import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { toSafeUser } from "./lib/safeUser";
import { randomBytes, createHash } from "crypto";
import { getStripeClient, getStripePublishableKey, isStripeConfigured, ensureStripeCustomer } from "./stripeClient";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { tiktok2Telemetry, passwordResetTokens } from "@shared/schema";
import { checkIPRateLimit, detectBotTraffic } from "./botDetection";
import { verifyDomainDNS } from "./domainUtils";
import { resetConsecutiveFailures } from "./domainMonitor";
import { registerAdminRoutes, seedDefaultEmailTemplates } from "./routes/admin.routes";
import { registerNotificationRoutes } from "./routes/notifications.routes";
import { registerAffiliateRoutes } from "./routes/affiliate.routes";
import { registerHealthRoutes } from "./health/routes";
import { getCachedGeoIp, cacheGeoIp, getRedisClient, getCachedIpInfo, cacheIpInfo, type IpInfoData } from "./redis";
import { sendPlanLimitEmail, sendDomainRemovedEmail, sendPasswordResetEmail } from "./email";
import { handleClickOverage, SUSPENDED_PAGE_URL } from "./limitEnforcer";
import { syncUserSubscriptionState, syncAllUsers } from "./syncService";
import { syncPlansToStripe } from "./stripePlanSync";
import { z } from "zod";
import { startOfLocalDay, endOfLocalDay } from "./timezone";
import {
  type ChallengeData,
  type TikTok2BaitData,
  generateToken as generateChallengeToken,
  createChallengeToken,
  getChallengeToken,
  updateChallengeToken,
  consumeChallengeToken,
  createTikTok2Token,
  getTikTok2Token,
  consumeTikTok2Token,
  CHALLENGE_TTL_MS,
  TIKTOK2_TTL_MS,
} from "./challengeStore";

// ==========================================
// ANTI-BOT CHALLENGE SYSTEM
// ==========================================

const CHALLENGE_EXPIRY_MS = CHALLENGE_TTL_MS;
const TIKTOK2_BAIT_EXPIRY_MS = TIKTOK2_TTL_MS;
const MIN_HUMAN_TIME_MS = 800; // Minimum 800ms for human interaction

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.href.replace(/['"<>]/g, '');
  } catch {
    return url.replace(/['"<>]/g, '');
  }
}

// ==========================================
// IP EXTRACTION HELPER
// ==========================================
// Extract the real client IP from request headers
// Prioritizes IPv4 and skips known datacenter/proxy IPs (like Facebook's 2a03:2880::/32)
function extractClientIP(req: Request): string {
  // Known datacenter/proxy IPv6 prefixes to skip
  const proxyIPv6Prefixes = [
    '2a03:2880', // Facebook/Meta datacenter
    '2606:4700', // Cloudflare
    '2001:4860', // Google
  ];
  
  // Check if IP is a known proxy/datacenter IP
  const isProxyIP = (ip: string): boolean => {
    const normalizedIP = ip.toLowerCase().trim();
    return proxyIPv6Prefixes.some(prefix => normalizedIP.startsWith(prefix.toLowerCase()));
  };
  
  // Check if IP is private/reserved
  const isPrivateIP = (ip: string): boolean => {
    // IPv4 private ranges
    if (/^10\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    if (/^127\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;
    // IPv6 private/local
    if (/^(fc|fd|fe80|::1)/i.test(ip)) return true;
    return false;
  };
  
  // Check if IP is valid IPv4
  const isIPv4 = (ip: string): boolean => {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
  };
  
  // Clean up IP (remove ::ffff: prefix for IPv4-mapped IPv6)
  const cleanIP = (ip: string): string => {
    return ip.replace(/^::ffff:/i, '').trim();
  };
  
  // Get all forwarded IPs
  const xForwardedFor = req.headers["x-forwarded-for"] as string || '';
  const cfConnectingIP = req.headers["cf-connecting-ip"] as string || '';
  const trueClientIP = req.headers["true-client-ip"] as string || '';
  const xRealIP = req.headers["x-real-ip"] as string || '';
  
  // Build list of candidate IPs (from most reliable to least)
  const candidates: string[] = [];
  
  // Add CF-Connecting-IP first (most reliable if using Cloudflare)
  if (cfConnectingIP) {
    candidates.push(cleanIP(cfConnectingIP));
  }
  
  // Add True-Client-IP (used by some CDNs)
  if (trueClientIP) {
    candidates.push(cleanIP(trueClientIP));
  }
  
  // Add X-Real-IP
  if (xRealIP) {
    candidates.push(cleanIP(xRealIP));
  }
  
  // Add X-Forwarded-For IPs (can have multiple, comma-separated)
  if (xForwardedFor) {
    const forwardedIPs = xForwardedFor.split(',').map(ip => cleanIP(ip));
    candidates.push(...forwardedIPs);
  }
  
  // Add socket remote address as last resort
  if (req.socket?.remoteAddress) {
    candidates.push(cleanIP(req.socket.remoteAddress));
  }
  if (req.ip) {
    candidates.push(cleanIP(req.ip));
  }
  
  // First pass: find first valid public IPv4 (preferred)
  for (const ip of candidates) {
    if (isIPv4(ip) && !isPrivateIP(ip) && !isProxyIP(ip)) {
      return ip;
    }
  }
  
  // Second pass: find any valid public IP (including IPv6) but skip proxy IPs
  for (const ip of candidates) {
    if (!isPrivateIP(ip) && !isProxyIP(ip) && ip !== 'unknown' && ip !== '') {
      return ip;
    }
  }
  
  // Third pass: return any non-empty IP as last resort
  for (const ip of candidates) {
    if (ip && ip !== 'unknown') {
      return ip;
    }
  }
  
  return 'unknown';
}

// ==========================================
// UTM PARAMETER HELPER
// ==========================================
// Append UTM parameters (and other tracking params) from query string to destination URL
// Excludes internal cloaking params like fbcl, xcode, ttclid, cname
function appendUTMParams(targetUrl: string, queryParams: Record<string, any>): string {
  // List of internal cloaking params to exclude
  const excludedParams = ['fbcl', 'xcode', 'ttclid', 'cname', 'adname', 'adset'];
  
  // Params to include (UTM and other tracking)
  const paramsToInclude: [string, string][] = [];
  
  for (const [key, value] of Object.entries(queryParams)) {
    // Skip excluded params and non-string values
    if (excludedParams.includes(key.toLowerCase())) continue;
    if (typeof value !== 'string' || !value) continue;
    
    // Clean up key (remove leading ? if present from malformed URLs)
    const cleanKey = key.startsWith('?') ? key.substring(1) : key;
    if (excludedParams.includes(cleanKey.toLowerCase())) continue;
    
    paramsToInclude.push([cleanKey, value]);
  }
  
  if (paramsToInclude.length === 0) {
    return targetUrl;
  }
  
  try {
    const url = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    for (const [key, value] of paramsToInclude) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch (e) {
    console.error('[UTM] Error appending params to URL:', e);
    return targetUrl;
  }
}

function generateTikTok2BaitHTML(token: string, whiteUrl: string, baseUrl?: string): string {
  const honeypotId = `hp_${randomBytes(4).toString('hex')}`;
  const trapLinkId = `tl_${randomBytes(4).toString('hex')}`;
  const delay = 100 + Math.floor(Math.random() * 50); // 100-150ms optimized for speed
  const safeWhiteUrl = sanitizeUrl(whiteUrl);
  
  // Use absolute URLs to avoid routing issues with custom domains
  const prefix = baseUrl ? baseUrl : '';
  const botLogUrl = `${prefix}/track/${token}`;
  const verifyUrl = `${prefix}/go/${token}`;
  const telemetryUrl = `${prefix}/tt2/t/${token}`; // GET-based telemetry pixel
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5;url=${safeWhiteUrl}">
  <title>Carregando...</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .c{text-align:center}
    .s{width:40px;height:40px;border:3px solid #e0e0e0;border-top:3px solid #333;border-radius:50%;animation:r 1s linear infinite;margin:0 auto 16px}
    @keyframes r{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    .t{color:#333;font-size:16px}
    .h{position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:auto}
    .tl{position:absolute;left:-9999px;font-size:1px;color:transparent}
  </style>
</head>
<body>
  <div class="c">
    <div class="s"></div>
    <p class="t">Carregando...</p>
  </div>
  
  <!-- Non-JS fallback beacon -->
  <noscript>
    <img src="/b/${token}?r=no_js" width="1" height="1" alt="" style="position:absolute;left:-9999px">
  </noscript>
  
  <!-- Honeypot traps for bots -->
  <input type="text" id="${honeypotId}" class="h" tabindex="-1" autocomplete="off" aria-hidden="true">
  <a href="${safeWhiteUrl}" id="${trapLinkId}" class="tl">Clique aqui para continuar</a>
  <button class="h" onclick="window.location='${safeWhiteUrl}'">Submit</button>
  
  <script>
    (function(){
      var w='${safeWhiteUrl}',b='${verifyUrl}',bl='${botLogUrl}',d=${delay},tUrl='${telemetryUrl}',tk='${token}';
      var T={tk:tk,start:Date.now(),events:[],touch:0,click:0,scroll:0,mouse:0,key:0,vis:0,focus:0,hp:false,trap:false,bot:null};
      
      // Collect device fingerprint
      T.screen={w:screen.width,h:screen.height};
      T.viewport={w:window.innerWidth,h:window.innerHeight};
      T.dpr=window.devicePixelRatio||1;
      T.cd=screen.colorDepth;
      T.tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
      T.lang=navigator.language;
      T.langs=navigator.languages?navigator.languages.join(','):'';
      T.plat=navigator.platform;
      T.hw=navigator.hardwareConcurrency||0;
      T.mem=navigator.deviceMemory||0;
      T.mtp=navigator.maxTouchPoints||0;
      T.ua=navigator.userAgent;
      
      // Bot indicators
      T.wd=!!navigator.webdriver;
      T.auto=!!(window.callPhantom||window._phantom||window.__nightmare||window.domAutomation||window.selenium);
      T.fakeC=!window.chrome&&navigator.userAgent.toLowerCase().indexOf('chrome')>-1;
      T.noLang=typeof navigator.languages==='undefined'||navigator.languages.length===0;
      
      // Performance timing
      try{
        var p=performance.timing;
        T.dcl=p.domContentLoadedEventEnd-p.navigationStart;
        T.load=p.loadEventEnd-p.navigationStart;
      }catch(e){}
      
      // Connection info
      try{
        var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
        if(c)T.conn=c.effectiveType||c.type||'unknown';
      }catch(e){}
      
      // Event logging with timestamp
      function logE(type,data){T.events.push({t:Date.now()-T.start,type:type,d:data})}
      
      // Bot already detected flag to prevent multiple redirects
      var botDetected=false;
      
      // CRITICAL: Any interaction on loading page = BOT (goes to WHITE immediately)
      // On TikTok mobile: NO mouse, NO clicks, NO scroll, NO keyboard - just auto redirect
      
      // Mouse events = IMPOSSIBLE on real TikTok mobile -> WHITE
      document.addEventListener('mousemove',function(e){
        T.mouse++;logE('mouse',{x:e.clientX,y:e.clientY});
        if(T.mouse>=3&&!botDetected){botDetected=true;logBot('mouse_on_mobile')}
      });
      
      // Click events = BOT trying to interact -> WHITE
      document.addEventListener('click',function(e){
        T.click++;logE('click',{x:e.clientX,y:e.clientY});
        if(!botDetected){botDetected=true;logBot('click_on_loading')}
      });
      
      // Touch events = suspicious on loading page (log but allow some tolerance)
      document.addEventListener('touchstart',function(e){
        T.touch++;logE('touch',{x:e.touches[0].clientX,y:e.touches[0].clientY});
        // Allow 1-2 accidental touches, but 3+ is suspicious
        if(T.touch>=3&&!botDetected){botDetected=true;logBot('excessive_touch')}
      });
      document.addEventListener('touchmove',function(e){logE('touchmove',{x:e.touches[0].clientX,y:e.touches[0].clientY})});
      
      // Scroll = BOT exploring page -> WHITE
      document.addEventListener('scroll',function(){
        T.scroll++;logE('scroll',{y:window.scrollY});
        if(!botDetected){botDetected=true;logBot('scroll_on_loading')}
      });
      
      // Key events = BOT trying to interact -> WHITE
      document.addEventListener('keydown',function(e){
        T.key++;logE('key',{k:e.key});
        if(!botDetected){botDetected=true;logBot('keyboard_on_loading')}
      });
      
      // Visibility changes (just log, don't block)
      document.addEventListener('visibilitychange',function(){T.vis++;logE('vis',{h:document.hidden})});
      
      // Focus changes (just log, don't block)
      window.addEventListener('blur',function(){T.focus++;logE('blur',{})});
      window.addEventListener('focus',function(){T.focus++;logE('focus',{})});
      
      // Honeypot listeners -> WHITE immediately
      var hp=document.getElementById('${honeypotId}');
      var tl=document.getElementById('${trapLinkId}');
      if(hp){hp.addEventListener('focus',function(){T.hp=true;logE('honeypot',{});if(!botDetected){botDetected=true;logBot('honeypot')}})}
      if(tl){tl.addEventListener('click',function(e){e.preventDefault();T.trap=true;logE('trap',{});if(!botDetected){botDetected=true;logBot('trap_link')}})}
      
      // Mouse teleport detection (impossible movement pattern)
      var lastX=0,lastY=0,teleport=0;
      document.addEventListener('mousemove',function(e){
        if(lastX!==0&&lastY!==0){
          var dx=Math.abs(e.clientX-lastX),dy=Math.abs(e.clientY-lastY);
          if(dx>300||dy>300){teleport++;if(teleport>1&&!botDetected){botDetected=true;logBot('mouse_teleport')}}
        }
        lastX=e.clientX;lastY=e.clientY;
      });
      
      // PIXEL VALIDATION: Redirect to BLACK only if pixel loads successfully
      // Bots that block image requests will fail and go to WHITE
      var pixelLoaded=false;
      var pixelTimeout=null;
      
      // Build telemetry data
      function buildMetrics(dest){
        T.total=Date.now()-T.start;
        T.dest=dest;
        T.teleport=teleport;
        return {
          d:dest,
          t:T.total,
          tc:T.touch,
          cl:T.click,
          sc:T.scroll,
          mo:T.mouse,
          ke:T.key,
          sw:T.screen.w,
          sh:T.screen.h,
          vw:T.viewport.w,
          vh:T.viewport.h,
          mtp:T.mtp,
          wd:T.wd?1:0,
          au:T.auto?1:0,
          hp:T.hp?1:0,
          tr:T.trap?1:0,
          tp:T.teleport||0
        };
      }
      
      // Send telemetry via pixel - returns promise-like with callbacks
      function sendPixel(dest,onSuccess,onFail){
        var m=buildMetrics(dest);
        try{
          var img=new Image();
          img.onload=function(){pixelLoaded=true;if(onSuccess)onSuccess()};
          img.onerror=function(){if(onFail)onFail('pixel_blocked')};
          img.src=tUrl+'?m='+encodeURIComponent(btoa(JSON.stringify(m)));
        }catch(e){if(onFail)onFail('pixel_error')}
      }
      
      // Bot detection - send to WHITE
      function logBot(r){
        T.bot=r;
        // Try to send telemetry (may fail for bots)
        sendPixel('white',null,null);
        var img=new Image();
        img.src=bl+'&r='+encodeURIComponent(r);
        setTimeout(function(){window.location=w},50);
      }
      
      // Check for bots immediately
      if(T.wd){botDetected=true;logBot('webdriver');return}
      if(T.auto){botDetected=true;logBot('automation');return}
      var ua=navigator.userAgent.toLowerCase();
      if(ua.indexOf('headless')>-1||ua.indexOf('phantom')>-1||ua.indexOf('selenium')>-1){botDetected=true;logBot('automation_ua');return}
      if(T.fakeC){botDetected=true;logBot('fake_chrome');return}
      if(T.noLang){botDetected=true;logBot('no_languages');return}
      
      // TikTok Bot Detection - these patterns are ONLY seen in TikTok crawlers, not real WebView users
      // 1. Screen size EXACTLY equals viewport (real devices always have navigation bars taking space)
      var screenEqualsViewport=(T.screen.w===T.viewport.w&&T.screen.h===T.viewport.h);
      // 2. Missing platform info (real devices always report platform)
      var noPlatform=(!T.plat||T.plat==='');
      // 3. BytedanceWebview in user agent (TikTok's crawler signature)
      var isBytedance=ua.indexOf('bytedancewebview')>-1;
      // 4. musical_ly in user agent (TikTok app identifier)
      var isMusicalLy=ua.indexOf('musical_ly')>-1;
      
      // Combined detection: TikTok UA + suspicious fingerprint = BOT
      if((isBytedance||isMusicalLy)&&(screenEqualsViewport||noPlatform)){
        botDetected=true;logBot('tiktok_crawler');return
      }
      
      // After delay, try to load pixel - only go to BLACK if it succeeds
      setTimeout(function(){
        if(botDetected)return;
        
        // Set a hard timeout for pixel loading (1000ms - balanced for speed vs slow connections)
        // Bots typically block immediately, real users load within 500ms normally
        pixelTimeout=setTimeout(function(){
          if(!pixelLoaded&&!botDetected){
            // Pixel didn't load in time = bot blocking images
            botDetected=true;
            var img=new Image();
            img.src=bl+'&r=pixel_timeout';
            window.location=w;
          }
        },1000);
        
        // Try to send pixel - only go to BLACK on success
        sendPixel('black',function(){
          // SUCCESS: Pixel loaded = real user, go to BLACK
          clearTimeout(pixelTimeout);
          if(!botDetected){
            window.location=b;
          }
        },function(reason){
          // FAIL: Pixel blocked = bot, go to WHITE
          clearTimeout(pixelTimeout);
          if(!botDetected){
            botDetected=true;
            var img=new Image();
            img.src=bl+'&r='+encodeURIComponent(reason);
            window.location=w;
          }
        });
      },d);
    })();
  </script>
</body>
</html>`;
}

function generateChallengeHTML(token: string, honeypotId: string, baseUrl?: string): string {
  // Generate random variable names to avoid detection
  const varNames = {
    checks: `_${randomBytes(4).toString('hex')}`,
    score: `_${randomBytes(4).toString('hex')}`,
    start: `_${randomBytes(4).toString('hex')}`,
    result: `_${randomBytes(4).toString('hex')}`,
  };
  
  // Use absolute URLs to avoid routing issues with custom domains
  const prefix = baseUrl ? baseUrl : '';
  const verifyUrl = `${prefix}/api/challenge/verify`;
  const completeUrl = `${prefix}/api/challenge/complete`;
  const honeypotUrl = `${prefix}/api/honeypot`;
  const trapUrl = `${prefix}/api/trap`;
  const submitUrl = `${prefix}/api/submit`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verificando...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 { color: #333; margin-bottom: 10px; }
    p { color: #666; font-size: 14px; }
    /* Honeypot - invisible to users, visible to bots */
    .${honeypotId} {
      position: absolute;
      left: -9999px;
      top: -9999px;
      opacity: 0;
      pointer-events: none;
      height: 0;
      width: 0;
      z-index: -1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Verificando seu acesso...</h2>
    <p>Aguarde um momento</p>
  </div>
  
  <!-- Honeypot links - bots will find and potentially access these -->
  <a href="${honeypotUrl}/${token}" class="${honeypotId}" tabindex="-1" aria-hidden="true">admin</a>
  <a href="${trapUrl}/${token}" class="${honeypotId}" tabindex="-1" aria-hidden="true">login</a>
  <form action="${submitUrl}/${token}" class="${honeypotId}">
    <input type="text" name="email" class="${honeypotId}">
    <input type="password" name="password" class="${honeypotId}">
  </form>
  
  <script>
    (function() {
      var ${varNames.start} = Date.now();
      var ${varNames.checks} = {};
      var ${varNames.score} = 0;
      
      // 1. Check if running in a real browser environment
      ${varNames.checks}.hasWindow = typeof window !== 'undefined';
      ${varNames.checks}.hasDocument = typeof document !== 'undefined';
      ${varNames.checks}.hasNavigator = typeof navigator !== 'undefined';
      
      // 2. Check for headless browser signatures
      ${varNames.checks}.webdriver = navigator.webdriver === true;
      ${varNames.checks}.headless = /HeadlessChrome|PhantomJS|Puppeteer|Playwright/i.test(navigator.userAgent);
      ${varNames.checks}.phantom = window.callPhantom || window._phantom;
      ${varNames.checks}.nightmare = window.__nightmare;
      ${varNames.checks}.selenium = window.document.documentElement.getAttribute('webdriver') !== null;
      ${varNames.checks}.seleniumIDE = window._Selenium_IDE_Recorder;
      ${varNames.checks}.webdriverIO = window.wdioElectron;
      ${varNames.checks}.domAutomation = window.domAutomation || window.domAutomationController;
      ${varNames.checks}.cdc = window.cdc_adoQpoasnfa76pfcZLmcfl_Array || window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      
      // 3. Check for automation properties
      ${varNames.checks}.automationProp = navigator.plugins === undefined || navigator.plugins.length === 0;
      ${varNames.checks}.languages = !navigator.languages || navigator.languages.length === 0;
      
      // 4. Check for browser features that bots often lack
      ${varNames.checks}.hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      ${varNames.checks}.hasNotification = 'Notification' in window;
      ${varNames.checks}.hasPerformance = 'performance' in window && 'timing' in window.performance;
      
      // 5. Check screen properties (bots often have weird values)
      ${varNames.checks}.screenOk = window.screen.width > 0 && window.screen.height > 0;
      ${varNames.checks}.outerOk = window.outerWidth > 0 && window.outerHeight > 0;
      
      // 6. Check for Chrome DevTools protocol
      ${varNames.checks}.devtoolsOpen = window.devtools && window.devtools.open;
      
      // 7. Canvas fingerprint check (bots often fail or have identical outputs)
      try {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Bot check', 2, 2);
        ${varNames.checks}.canvas = canvas.toDataURL().length > 1000;
      } catch(e) {
        ${varNames.checks}.canvas = false;
      }
      
      // 8. WebGL check
      try {
        var canvas2 = document.createElement('canvas');
        var gl = canvas2.getContext('webgl') || canvas2.getContext('experimental-webgl');
        ${varNames.checks}.webgl = gl !== null;
        if (gl) {
          var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            var renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            ${varNames.checks}.swiftShader = /SwiftShader|llvmpipe|softpipe/i.test(renderer);
          }
        }
      } catch(e) {
        ${varNames.checks}.webgl = false;
      }
      
      // 9. Audio fingerprint check
      try {
        var audioContext = new (window.AudioContext || window.webkitAudioContext)();
        ${varNames.checks}.audio = audioContext !== null;
        audioContext.close();
      } catch(e) {
        ${varNames.checks}.audio = false;
      }
      
      // 10. Browser plugins detection (headless browsers have no plugins)
      try {
        ${varNames.checks}.pluginCount = navigator.plugins ? navigator.plugins.length : 0;
        ${varNames.checks}.hasPlugins = ${varNames.checks}.pluginCount > 0;
        // Real browsers typically have at least PDF viewer or Chrome PDF
        ${varNames.checks}.pluginNames = [];
        if (navigator.plugins && navigator.plugins.length > 0) {
          for (var i = 0; i < Math.min(navigator.plugins.length, 5); i++) {
            ${varNames.checks}.pluginNames.push(navigator.plugins[i].name);
          }
        }
      } catch(e) {
        ${varNames.checks}.hasPlugins = false;
        ${varNames.checks}.pluginCount = 0;
      }
      
      // 11. WebRTC detection (detect VPN/proxy by comparing IPs)
      ${varNames.checks}.webrtcSupported = false;
      ${varNames.checks}.webrtcIPs = [];
      try {
        if (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection) {
          ${varNames.checks}.webrtcSupported = true;
          var pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection)({
            iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
          });
          pc.createDataChannel('');
          pc.createOffer().then(function(offer) {
            pc.setLocalDescription(offer);
          });
          pc.onicecandidate = function(e) {
            if (e.candidate) {
              var candidate = e.candidate.candidate;
              var ipRegex = /([0-9]{1,3}(\\.[0-9]{1,3}){3})/;
              var match = candidate.match(ipRegex);
              if (match && ${varNames.checks}.webrtcIPs.indexOf(match[1]) === -1) {
                ${varNames.checks}.webrtcIPs.push(match[1]);
              }
            }
          };
          setTimeout(function() { pc.close(); }, 1000);
        }
      } catch(e) {
        ${varNames.checks}.webrtcSupported = false;
      }
      
      // 12. Enhanced Canvas fingerprint (more complex drawing for better detection)
      try {
        var canvas3 = document.createElement('canvas');
        canvas3.width = 200;
        canvas3.height = 50;
        var ctx3 = canvas3.getContext('2d');
        // Complex drawing pattern
        ctx3.textBaseline = 'alphabetic';
        ctx3.fillStyle = '#f60';
        ctx3.fillRect(125, 1, 62, 20);
        ctx3.fillStyle = '#069';
        ctx3.font = '11pt Arial';
        ctx3.fillText('Cwm fjordbank glyphs vext quiz', 2, 15);
        ctx3.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx3.font = '18pt Arial';
        ctx3.fillText('Cwm fjordbank', 4, 45);
        // Get data and compute hash length as fingerprint indicator
        var canvasData = canvas3.toDataURL();
        ${varNames.checks}.canvasHash = canvasData.length;
        ${varNames.checks}.canvasValid = canvasData.length > 3000;
        // Check for known headless patterns (very short canvas data)
        ${varNames.checks}.canvasSuspicious = canvasData.length < 1000;
      } catch(e) {
        ${varNames.checks}.canvasValid = false;
        ${varNames.checks}.canvasSuspicious = true;
      }
      
      // 13. Enhanced WebGL fingerprint (get renderer info)
      try {
        var canvas4 = document.createElement('canvas');
        var gl2 = canvas4.getContext('webgl') || canvas4.getContext('experimental-webgl');
        if (gl2) {
          ${varNames.checks}.webglVendor = gl2.getParameter(gl2.VENDOR);
          ${varNames.checks}.webglRenderer = gl2.getParameter(gl2.RENDERER);
          var debugInfo2 = gl2.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo2) {
            ${varNames.checks}.webglUnmaskedVendor = gl2.getParameter(debugInfo2.UNMASKED_VENDOR_WEBGL);
            ${varNames.checks}.webglUnmaskedRenderer = gl2.getParameter(debugInfo2.UNMASKED_RENDERER_WEBGL);
            // Check for headless indicators
            var renderer = ${varNames.checks}.webglUnmaskedRenderer || '';
            ${varNames.checks}.webglHeadless = /SwiftShader|llvmpipe|softpipe|Mesa|Microsoft Basic|Google Inc/i.test(renderer);
          }
        }
      } catch(e) {
        ${varNames.checks}.webglVendor = null;
      }
      
      // 14. Check for common bot frameworks
      ${varNames.checks}.hasCDP = !!window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      ${varNames.checks}.hasAwesomium = !!window.awesomium;
      ${varNames.checks}.hasCefSharp = !!window.CefSharp;
      ${varNames.checks}.hasPhantom = !!window.__phantomas;
      
      // 15. Permission API check (bots often don't implement this)
      try {
        ${varNames.checks}.hasPermissions = 'permissions' in navigator;
      } catch(e) {
        ${varNames.checks}.hasPermissions = false;
      }
      
      // Calculate score
      if (${varNames.checks}.hasWindow && ${varNames.checks}.hasDocument && ${varNames.checks}.hasNavigator) ${varNames.score} += 10;
      if (!${varNames.checks}.webdriver) ${varNames.score} += 15;
      if (!${varNames.checks}.headless) ${varNames.score} += 15;
      if (!${varNames.checks}.phantom && !${varNames.checks}.nightmare) ${varNames.score} += 10;
      if (!${varNames.checks}.selenium && !${varNames.checks}.seleniumIDE) ${varNames.score} += 10;
      if (!${varNames.checks}.domAutomation && !${varNames.checks}.cdc) ${varNames.score} += 10;
      if (${varNames.checks}.canvas) ${varNames.score} += 5;
      if (${varNames.checks}.webgl && !${varNames.checks}.swiftShader) ${varNames.score} += 5;
      if (${varNames.checks}.audio) ${varNames.score} += 5;
      if (${varNames.checks}.screenOk && ${varNames.checks}.outerOk) ${varNames.score} += 5;
      // New scoring for advanced checks
      if (${varNames.checks}.hasPlugins && ${varNames.checks}.pluginCount >= 1) ${varNames.score} += 10;
      if (${varNames.checks}.webrtcSupported) ${varNames.score} += 5;
      if (${varNames.checks}.canvasValid && !${varNames.checks}.canvasSuspicious) ${varNames.score} += 10;
      if (!${varNames.checks}.webglHeadless) ${varNames.score} += 10;
      if (!${varNames.checks}.hasCDP && !${varNames.checks}.hasAwesomium && !${varNames.checks}.hasCefSharp && !${varNames.checks}.hasPhantom) ${varNames.score} += 5;
      if (${varNames.checks}.hasPermissions) ${varNames.score} += 5;
      
      // Wait for minimum human time then submit
      function submitResult() {
        var elapsed = Date.now() - ${varNames.start};
        var ${varNames.result} = {
          t: '${token}',
          s: ${varNames.score},
          e: elapsed,
          c: ${varNames.checks},
          r: Math.random().toString(36).substr(2, 9)
        };
        
        // Use image request for stealth (harder to detect than fetch)
        var img = new Image();
        img.onload = function() {
          // Success - redirect will happen server-side via meta refresh
          setTimeout(function() {
            window.location.href = '${completeUrl}/' + '${token}' + '?v=' + ${varNames.result}.s + '&e=' + ${varNames.result}.e;
          }, 100);
        };
        img.onerror = function() {
          // Fallback to direct navigation
          window.location.href = '${completeUrl}/' + '${token}' + '?v=' + ${varNames.result}.s + '&e=' + ${varNames.result}.e;
        };
        img.src = '${verifyUrl}/' + '${token}' + '?s=' + ${varNames.result}.s + '&e=' + ${varNames.result}.e + '&r=' + ${varNames.result}.r;
      }
      
      // Add some randomness to timing (800-1500ms)
      var delay = 800 + Math.floor(Math.random() * 700);
      setTimeout(submitResult, delay);
    })();
  </script>
</body>
</html>`;
}


function generateXcode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}`;
}

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const partLength = 3;
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < partLength; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}`;
}

async function generateUniqueSlug(
  storage: any,
  domainId: number | null,
  sharedDomainId: number | null,
  maxRetries: number = 20
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const slug = generateSlug();
    let existing = null;
    if (sharedDomainId) {
      existing = await storage.getOfferBySlugAndSharedDomain(slug, sharedDomainId);
    } else {
      existing = await storage.getOfferBySlugAndDomain(slug, domainId);
    }
    if (!existing) {
      return slug;
    }
  }
  throw new Error("Failed to generate a unique slug after multiple attempts");
}

function selectBlackPageUrl(offer: { blackPageUrl: string; blackPages?: Array<{ url: string; percentage: number }> | null }): string {
  if (!offer.blackPages || !Array.isArray(offer.blackPages) || offer.blackPages.length <= 1) {
    return offer.blackPages?.[0]?.url || offer.blackPageUrl;
  }
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const bp of offer.blackPages) {
    cumulative += bp.percentage;
    if (rand < cumulative) {
      return bp.url;
    }
  }
  return offer.blackPages[offer.blackPages.length - 1].url;
}

function parseUserAgent(ua: string): "smartphone" | "tablet" | "desktop" {
  const uaLower = ua.toLowerCase();
  if (/android.*mobile|iphone|ipod|blackberry|windows phone/i.test(uaLower)) {
    return "smartphone";
  }
  if (/ipad|android(?!.*mobile)|tablet/i.test(uaLower)) {
    return "tablet";
  }
  return "desktop";
}

// Cache for admin settings — refreshed every 60s or invalidated on PATCH /api/admin/config
let adminSettingsCache: { tiktokFilterEnabled: boolean; timestamp: number } | null = null;
const ADMIN_SETTINGS_CACHE_TTL = 60000; // 60 seconds

async function getTiktokFilterEnabled(): Promise<boolean> {
  const now = Date.now();
  if (adminSettingsCache && now - adminSettingsCache.timestamp < ADMIN_SETTINGS_CACHE_TTL) {
    return adminSettingsCache.tiktokFilterEnabled;
  }
  try {
    const settings = await storage.getAdminSettings();
    const enabled = settings?.tiktokFilterEnabled ?? true;
    adminSettingsCache = { tiktokFilterEnabled: enabled, timestamp: now };
    return enabled;
  } catch {
    return adminSettingsCache?.tiktokFilterEnabled ?? true;
  }
}

// Cache for IP geolocation - Redis as primary, memory as fallback
const ipCountryCache = new Map<string, { country: string; timestamp: number }>();
const IP_CACHE_TTL = 3600000; // 1 hour cache
const IP_CACHE_MAX_SIZE = 10000;

async function getCountryFromIP(ip: string): Promise<string> {
  try {
    const cleanIp = ip.replace(/^::ffff:/, "");
    
    // Local IPs default to BR
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.")) {
      return "BR";
    }
    
    // Check Redis cache first (faster, shared across instances)
    const redisCached = await getCachedGeoIp(cleanIp);
    if (redisCached) {
      return redisCached;
    }
    
    // Fallback to memory cache
    const cached = ipCountryCache.get(cleanIp);
    if (cached && Date.now() - cached.timestamp < IP_CACHE_TTL) {
      return cached.country;
    }
    
    // Clean old cache entries if too large
    if (ipCountryCache.size > IP_CACHE_MAX_SIZE) {
      const now = Date.now();
      for (const [key, value] of ipCountryCache.entries()) {
        if (now - value.timestamp > IP_CACHE_TTL) {
          ipCountryCache.delete(key);
        }
      }
    }
    
    const response = await fetch(`http://ip-api.com/json/${cleanIp}?fields=countryCode,status,message`);
    if (response.ok) {
      const data = await response.json();
      
      // Check if API returned rate limit error
      if (data.status === 'fail') {
        console.log(`[GeoIP] API error for ${cleanIp}: ${data.message}`);
        return cached?.country || "XX";
      }
      
      const country = data.countryCode || "XX";
      
      // Cache in both Redis and memory
      await cacheGeoIp(cleanIp, country);
      ipCountryCache.set(cleanIp, { country, timestamp: Date.now() });
      
      return country;
    }
    
    return cached?.country || "XX";
  } catch (error) {
    console.log(`[GeoIP] Error for IP: ${error}`);
    return "XX";
  }
}

// Known datacenter/hosting ASN patterns (major cloud providers and VPS)
// NOTE: Removed generic keywords (CLOUD, SERVER, HOSTING, VPS, DEDICATED, DATACENTER, COLOCATION)
// to avoid false positives with legitimate ISPs that have these words in their name
const DATACENTER_ASN_PATTERNS = [
  // Major Cloud Providers (specific names only)
  'AMAZON', 'AWS', 'GOOGLE', 'MICROSOFT', 'AZURE', 'DIGITALOCEAN', 'LINODE',
  'VULTR', 'OVH', 'HETZNER', 'CLOUDFLARE', 'AKAMAI', 'FASTLY',
  // VPS/Hosting Providers (specific names only)
  'HOSTINGER', 'GODADDY', 'NAMECHEAP', 'BLUEHOST', 'HOSTGATOR', 'SITEGROUND',
  'CONTABO', 'SCALEWAY', 'UPCLOUD', 'RACKSPACE', 'LEASEWEB', 'CHOOPA',
  'HIVELOCITY', 'QUADRANET', 'TZULO', 'NOCSER', 'DATACAMP', 'HOSTWINDS',
  // Proxy/VPN Providers
  'NORDVPN', 'EXPRESSVPN', 'SURFSHARK', 'MULLVAD', 'CYBERGHOST', 'PROTONVPN',
  'M247', 'IPVOLUME', 'DATACAMP',
  // Bot Networks / Known Crawlers
  'TIKTOK', 'BYTEDANCE', 'FACEBOOK', 'META PLATFORMS'
];

// Known datacenter ISP patterns
const DATACENTER_ISP_PATTERNS = [
  'AMAZON', 'GOOGLE', 'MICROSOFT', 'DIGITALOCEAN', 'LINODE', 'VULTR', 'OVH',
  'HETZNER', 'CLOUDFLARE', 'FACEBOOK', 'TIKTOK', 'BYTEDANCE', 'META'
];

// Known corporate Secure Web Gateway / SSE providers.
// Real employees browse through these transparent proxies by corporate IT policy.
// They are NOT bot datacenters — ip-api may return hosting=true for some of their nodes,
// but as long as proxy=false, these are legitimate user connections.
// Their exit IPs appear in foreign countries (e.g. Zscaler routes BR users via GB/CH nodes).
// Rule: match by ISP/ORG/AS name + proxy=false → isCorporateProxy=true, isDatacenter=false.
const CORPORATE_SECURITY_PROXY_PATTERNS = [
  'ZSCALER',    // Zscaler Internet Access — AS62044, AS55177, AS62563, AS393421, AS17054
  'NETSKOPE',   // Netskope Security Cloud
  'SYMANTEC',   // Symantec / Blue Coat ProxySG (legacy SWG)
  'BLUECOAT',   // Blue Coat ProxySG (Symantec legacy brand)
  'IBOSS',      // iboss Cloud Security
  'MENLO',      // Menlo Security Isolation Platform
  'FORCEPOINT', // Forcepoint Web Security Gateway
];

interface IpAnalysis {
  country: string;
  isDatacenter: boolean;
  isProxy: boolean;
  /** True when the IP is a known corporate Secure Web Gateway (SWG/SSE) that confirmed
   *  proxy=false — real employee traffic routed transparently, NOT automated bots. */
  isCorporateProxy: boolean;
  isMobile: boolean;
  isp: string;
  org: string;
  as: string;
  reason?: string;
}

// Cache for IP analysis
const ipAnalysisCache = new Map<string, { data: IpAnalysis; timestamp: number }>();
const IP_ANALYSIS_CACHE_TTL = 3600000; // 1 hour

// ──────────────────────────────────────────────────────────────
// DECISION REASON HELPER
// ──────────────────────────────────────────────────────────────
/**
 * Computes a single canonical decision reason string for a click.
 * Used in click logs so operators can see exactly why each redirect happened.
 *
 * Returns 'valid_traffic' for BLACK redirects.
 * Returns one of the reason codes below for WHITE redirects:
 *   bot_detected:rate_limited | bot_detected:datacenter_ip | bot_detected:proxy_ip
 *   bot_detected:facebook_crawler | bot_detected:headless_browser
 *   bot_detected:facebook_background | bot_detected:empty_ua
 *   bot_detected:fake_chrome_version | bot_detected:unresolved_macro | bot_detected:ua_pattern
 *   invalid_xcode | invalid_fbcl_format | missing_params | missing_xcode | missing_ttclid
 *   missing_utm_medium | missing_utm_content | missing_utm_campaign
 *   invalid_device:{device} | invalid_country:{country} | unknown
 */
function computeDecisionReason(
  finalDecision: 'black' | 'white',
  isBotDetected: boolean,
  botPrimaryReason: string,
  paramsValid: boolean,
  failReason: string,
  deviceAllowed: boolean,
  countryAllowed: boolean,
  deviceType: string,
  country: string
): string {
  if (finalDecision === 'black') return 'valid_traffic';

  if (isBotDetected) {
    const r = botPrimaryReason.toLowerCase();
    if (r.startsWith('rate_limited')) return 'bot_detected:rate_limited';
    if (r.startsWith('datacenter_ip')) return 'bot_detected:datacenter_ip';
    if (r.startsWith('proxy_ip')) return 'bot_detected:proxy_ip';
    if (r.includes('facebookexternalhit') || r.includes('facebook') || r.includes('facebot') || r.includes('meta-external')) return 'bot_detected:facebook_crawler';
    if (r.includes('headlesschrome') || r.includes('headless') || r.includes('puppeteer') || r.includes('playwright') || r.includes('selenium')) return 'bot_detected:headless_browser';
    if (r.includes('cfnetwork')) return 'bot_detected:facebook_background';
    if (r.includes('ua_empty') || r.includes('too_short')) return 'bot_detected:empty_ua';
    if (r.includes('fake_chrome')) return 'bot_detected:fake_chrome_version';
    if (r.includes('unresolved_macro')) return 'bot_detected:unresolved_macro';
    if (r.startsWith('bot_ua')) return 'bot_detected:ua_pattern';
    if (r.startsWith('ua_typo')) return 'bot_detected:ua_typo';
    return `bot_detected:${botPrimaryReason.substring(0, 40).replace(/[^a-zA-Z0-9_:.\-]/g, '_')}`;
  }

  if (failReason) {
    if (failReason === 'missing_facebook_params') return 'missing_params';
    if (failReason.startsWith('unresolved_')) return 'bot_detected:unresolved_macro';
    return failReason;
  }

  if (!deviceAllowed) return `invalid_device:${deviceType}`;
  if (!countryAllowed) return `invalid_country:${country}`;
  return 'unknown';
}

async function analyzeIP(ip: string): Promise<IpAnalysis> {
  try {
    const cleanIp = ip.replace(/^::ffff:/, "");
    
    // Local IPs are not datacenters
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.")) {
      return {
        country: "BR",
        isDatacenter: false,
        isProxy: false,
        isCorporateProxy: false,
        isMobile: false,
        isp: "Local",
        org: "Local",
        as: "Local"
      };
    }
    
    // Check memory cache first
    const cached = ipAnalysisCache.get(cleanIp);
    if (cached && Date.now() - cached.timestamp < IP_ANALYSIS_CACHE_TTL) {
      return cached.data;
    }
    
    // Check Redis cache
    const redisCached = await getCachedIpInfo(cleanIp);
    if (redisCached) {
      // Re-run corporate proxy detection on cached data so the rule applies even after cache restore
      const cachedIspUpper = (redisCached.isp || "").toUpperCase();
      const cachedOrgUpper = (redisCached.org || "").toUpperCase();
      const cachedAsUpper  = (redisCached.as  || "").toUpperCase();
      const cachedIspOrgAs = `${cachedIspUpper} ${cachedOrgUpper} ${cachedAsUpper}`;
      const cachedIsCorporate = !redisCached.proxy && CORPORATE_SECURITY_PROXY_PATTERNS.some(p => cachedIspOrgAs.includes(p));
      const analysis: IpAnalysis = {
        // Corporate proxy exit IPs report foreign country codes — use XX so country check passes
        country: cachedIsCorporate ? "XX" : redisCached.country,
        // Corporate proxies are NOT datacenters even when ip-api sets hosting=true
        isDatacenter: cachedIsCorporate ? false : redisCached.hosting,
        isProxy: redisCached.proxy && !redisCached.mobile,
        isCorporateProxy: cachedIsCorporate,
        isMobile: redisCached.mobile,
        isp: redisCached.isp,
        org: redisCached.org,
        as: redisCached.as
      };
      ipAnalysisCache.set(cleanIp, { data: analysis, timestamp: Date.now() });
      return analysis;
    }
    
    // Fetch from ip-api.com with extended fields including hosting/proxy detection
    const response = await fetch(
      `http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,isp,org,as,hosting,proxy,mobile`
    );
    
    if (!response.ok) {
      return {
        country: "XX",
        isDatacenter: false,
        isProxy: false,
        isCorporateProxy: false,
        isMobile: false,
        isp: "",
        org: "",
        as: ""
      };
    }
    
    const data = await response.json();
    
    if (data.status === 'fail') {
      console.log(`[IP Analysis] API error for ${cleanIp}: ${data.message}`);
      return {
        country: "XX",
        isDatacenter: false,
        isProxy: false,
        isCorporateProxy: false,
        isMobile: false,
        isp: "",
        org: "",
        as: ""
      };
    }
    
    // Check ASN and ISP patterns for datacenter detection
    const asUpper = (data.as || "").toUpperCase();
    const ispUpper = (data.isp || "").toUpperCase();
    const orgUpper = (data.org || "").toUpperCase();
    const ispOrgAs = `${ispUpper} ${orgUpper} ${asUpper}`;
    
    let isDatacenterByPattern = false;
    let patternReason = "";
    
    for (const pattern of DATACENTER_ASN_PATTERNS) {
      if (asUpper.includes(pattern) || orgUpper.includes(pattern)) {
        isDatacenterByPattern = true;
        patternReason = `ASN/ORG contains: ${pattern}`;
        break;
      }
    }
    
    if (!isDatacenterByPattern) {
      for (const pattern of DATACENTER_ISP_PATTERNS) {
        if (ispUpper.includes(pattern)) {
          isDatacenterByPattern = true;
          patternReason = `ISP contains: ${pattern}`;
          break;
        }
      }
    }

    // Detect corporate Secure Web Gateway / SSE providers.
    // Condition: ISP/ORG/AS name matches a known corporate proxy AND ip-api says proxy=false.
    // proxy=false is the key signal: it means the vendor itself has told ip-api this IP is
    // not being used as a voluntary anonymizing proxy. Corporate gateway = legitimate.
    const isCorporateProxy = data.proxy !== true &&
      CORPORATE_SECURITY_PROXY_PATTERNS.some(p => ispOrgAs.includes(p));

    // Use ip-api's hosting flag OR our pattern matching — but NEVER flag corporate proxies
    // as datacenters, even when ip-api marks their nodes as hosting=true.
    const isDatacenterRaw = data.hosting === true || isDatacenterByPattern;
    const isDatacenter = isCorporateProxy ? false : isDatacenterRaw;

    // Mobile users going through carrier proxies are real users (very common in LatAm, Asia, Africa)
    // ip-api marks mobile carrier transparent proxies as proxy:true, but these are not VPNs/bots
    // Only block proxy if user is NOT on mobile
    const isProxy = data.proxy === true && data.mobile !== true;

    // Corporate proxy exit IPs report the country of the gateway node, NOT the real user's country.
    // Zscaler routes Brazilian users through GB/CH exit nodes → ip-api returns country=GB.
    // Returning XX bypasses the country filter so these legitimate users are not blocked.
    const country = isCorporateProxy ? "XX" : (data.countryCode || "XX");
    
    const analysis: IpAnalysis = {
      country,
      isDatacenter,
      isProxy,
      isCorporateProxy,
      isMobile: data.mobile === true,
      isp: data.isp || "",
      org: data.org || "",
      as: data.as || "",
      reason: isDatacenter ? (data.hosting ? "hosting_flag" : patternReason) : (isCorporateProxy ? "corporate_swg" : undefined)
    };
    
    // Cache in Redis — store raw country/hosting so cache is re-evaluated on restore
    const ipInfoData: IpInfoData = {
      country: data.countryCode || "XX",
      isp: analysis.isp,
      org: analysis.org,
      as: analysis.as,
      hosting: isDatacenterRaw,
      proxy: data.proxy === true,
      mobile: data.mobile === true
    };
    await cacheIpInfo(cleanIp, ipInfoData);
    
    // Cache in memory (evaluated analysis, including isCorporateProxy)
    ipAnalysisCache.set(cleanIp, { data: analysis, timestamp: Date.now() });
    
    if (analysis.isDatacenter || analysis.isProxy) {
      console.log(`[IP Analysis] ${cleanIp}: DATACENTER=${analysis.isDatacenter} PROXY=${analysis.isProxy} CORPORATE=${isCorporateProxy} ISP=${analysis.isp} AS=${analysis.as} ${analysis.reason || ''}`);
    } else if (isCorporateProxy) {
      console.log(`[IP Analysis] ${cleanIp}: CORPORATE_PROXY=true ISP=${analysis.isp} AS=${analysis.as} — proxy=false, country overridden to XX`);
    }
    
    return analysis;
  } catch (error) {
    console.log(`[IP Analysis] Error for ${ip}: ${error}`);
    return {
      country: "XX",
      isDatacenter: false,
      isProxy: false,
      isCorporateProxy: false,
      isMobile: false,
      isp: "",
      org: "",
      as: ""
    };
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  // Register modularized route groups
  registerNotificationRoutes(app);
  registerAffiliateRoutes(app);
  registerAdminRoutes(app, () => { adminSettingsCache = null; });
  registerHealthRoutes(app);

  // ==========================================
  // SUSPENDED PAGE (lightweight, no auth, no React)
  // ==========================================
  app.get("/suspended", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-cache");
    res.status(200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conta Suspensa</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh}
    .box{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:48px 40px;text-align:center;max-width:480px;width:90%}
    h1{font-size:1.4rem;color:#111;margin-bottom:12px}
    p{color:#555;line-height:1.6}
  </style>
</head>
<body>
  <div class="box">
    <h1>Conta temporariamente suspensa</h1>
    <p>Regularize sua assinatura para reativar o acesso.</p>
  </div>
</body>
</html>`);
  });

  // ==========================================
  // ADMIN: SUBSCRIPTION INCONSISTENCY DETECTION + SYNC
  // ==========================================

  app.get("/api/admin/subscription-inconsistencies", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    const user = await storage.getUser(userId);
    const { checkIsAdmin } = await import("./auth/permissions");
    const adminCheck = await checkIsAdmin(userId);
    if (!adminCheck.granted && !user?.isAdmin) return res.status(403).json({ message: "Forbidden" });

    try {
      const inconsistencies = await storage.getUsersWithSubscriptionInconsistencies();
      res.json({
        count: inconsistencies.length,
        users: inconsistencies.map(({ user: u, issues }) => ({
          id: u.id,
          email: u.email,
          subscriptionStatus: u.subscriptionStatus,
          suspendedAt: u.suspendedAt,
          gracePeriodEndsAt: u.gracePeriodEndsAt,
          subscriptionEndDate: u.subscriptionEndDate,
          planId: u.planId,
          stripeSubscriptionId: u.stripeSubscriptionId,
          issues,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/subscription-sync/:userId", isAuthenticated, async (req: Request, res: Response) => {
    const currentUserId = (req.user as any)?.id;
    const currentUser = await storage.getUser(currentUserId);
    const { checkIsAdmin } = await import("./auth/permissions");
    const adminCheck2 = await checkIsAdmin(currentUserId);
    if (!adminCheck2.granted && !currentUser?.isAdmin) return res.status(403).json({ message: "Forbidden" });

    try {
      const result = await syncUserSubscriptionState(req.params.userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/subscription-sync-all", isAuthenticated, async (req: Request, res: Response) => {
    const currentUserId = (req.user as any)?.id;
    const currentUser = await storage.getUser(currentUserId);
    const { checkIsAdmin } = await import("./auth/permissions");
    const adminCheck3 = await checkIsAdmin(currentUserId);
    if (!adminCheck3.granted && !currentUser?.isAdmin) return res.status(403).json({ message: "Forbidden" });

    try {
      const summary = await syncAllUsers();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==========================================
  // ADMIN: STRIPE PRODUCT/PRICE SYNC
  // ==========================================

  app.post("/api/admin/stripe/create-products", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    const user = await storage.getUser(userId);
    const { checkIsAdmin } = await import("./auth/permissions");
    const adminCheck4 = await checkIsAdmin(userId);
    if (!adminCheck4.granted && !user?.isAdmin) return res.status(403).json({ message: "Forbidden" });

    try {
      const summary = await syncPlansToStripe();
      res.json(summary);
    } catch (err: any) {
      console.error("[Admin] stripe/create-products error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ==========================================
  // ANTI-BOT CHALLENGE ROUTES
  // ==========================================
  
  // Honeypot routes - if a bot accesses these, mark the token as compromised
  app.get("/api/honeypot/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const challenge = await getChallengeToken(token);
    if (challenge) {
      await updateChallengeToken(token, { honeypotTriggered: true });
      console.log(`[AntiBot] HONEYPOT TRIGGERED - Token: ${token.substring(0, 16)}... IP: ${challenge.ip}`);
    }
    // Return a fake success to not alert the bot
    res.status(200).send('OK');
  });
  
  app.get("/api/trap/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const challenge = await getChallengeToken(token);
    if (challenge) {
      await updateChallengeToken(token, { honeypotTriggered: true });
      console.log(`[AntiBot] TRAP TRIGGERED - Token: ${token.substring(0, 16)}... IP: ${challenge.ip}`);
    }
    res.status(200).send('OK');
  });
  
  app.all("/api/submit/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const challenge = await getChallengeToken(token);
    if (challenge) {
      await updateChallengeToken(token, { honeypotTriggered: true });
      console.log(`[AntiBot] FORM SUBMIT TRIGGERED - Token: ${token.substring(0, 16)}... IP: ${challenge.ip}`);
    }
    res.status(200).send('OK');
  });
  
  // ==========================================
  // TIKTOK 2 BOT DETECTION LOGGING (supports both /api/tt2-bot and /b/:token for custom domains)
  // ==========================================
  
  // Bot detection handler - shared logic
  async function handleBotDetection(token: string, reason: string, res: Response) {
    if (!token) {
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      return res.send(gif);
    }
    
    const baitData = await consumeTikTok2Token(token);
    if (baitData) {
      const elapsed = Date.now() - baitData.createdAt;
      console.log(`[TikTok2] BOT DETECTED (${reason}) - Token: ${token.substring(0, 16)}... (${elapsed}ms)`);
      storage.createClickLog({
        offerId: baitData.offerId,
        userId: baitData.userId,
        ipAddress: baitData.ip,
        userAgent: baitData.userAgent,
        country: baitData.country,
        device: baitData.device,
        redirectedTo: 'white',
        requestUrl: baitData.requestUrl,
        responseTimeMs: elapsed,
        hasError: false,
        allParams: {
          domainId: baitData.domainId,
          platform: 'tiktok',
          referer: baitData.referer,
          ttclid: baitData.ttclid,
          adname: baitData.adname,
          adset: baitData.adset,
          campaignName: baitData.cname,
          xcode: baitData.xcode,
          botReason: reason,
        },
      }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
      storage.incrementOfferClicks(baitData.offerId, false)
        .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
    }
    
    // Return 1x1 transparent GIF — sent immediately, analytics run in background
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(gif);
  }
  
  // Route for custom domains: /b/:token and /track/:token (fallback)
  app.get("/b/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const reason = (req.query.r as string) || 'unknown';
    console.log(`[TikTok2] Bot detection via /b/:token - Token: ${token?.substring(0, 16)}...`);
    return handleBotDetection(token, reason, res);
  });
  
  app.get("/track/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const reason = (req.query.r as string) || 'unknown';
    console.log(`[TikTok2] Bot detection via /track/:token - Token: ${token?.substring(0, 16)}...`);
    return handleBotDetection(token, reason, res);
  });
  
  // ==========================================
  // TIKTOK2 TELEMETRY ENDPOINT - GET-based pixel for reliability
  // ==========================================
  
  app.get("/tt2/t/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const encodedMetrics = req.query.m as string;
    
    console.log(`[TikTok2 Telemetry] Received GET request for token: ${token?.substring(0, 16)}...`);
    
    // Return 1x1 transparent GIF immediately
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    try {
      if (!encodedMetrics) {
        console.log('[TikTok2 Telemetry] No metrics data');
        return res.send(gif);
      }
      
      // Decode base64 metrics
      const decoded = Buffer.from(decodeURIComponent(encodedMetrics), 'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      
      const baitData = await getTikTok2Token(token);
      const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
      
      console.log(`[TikTok2 Telemetry] Token: ${token.substring(0, 16)}... | Dest: ${data.d} | Time: ${data.t}ms | Touch: ${data.tc} | Mouse: ${data.mo} | Click: ${data.cl}`);
      
      // Save telemetry to database (using compact field names from pixel)
      await db.insert(tiktok2Telemetry).values({
        token: token,
        offerId: baitData?.offerId || null,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || null,
        
        // Timing (compact: t=total)
        totalTimeOnPage: data.t || null,
        timeToRedirect: data.t || null,
        
        // Interactions (compact: tc=touch, cl=click, sc=scroll, mo=mouse, ke=key)
        touchCount: data.tc || 0,
        clickCount: data.cl || 0,
        scrollCount: data.sc || 0,
        mouseMoveCount: data.mo || 0,
        keyPressCount: data.ke || 0,
        
        // Device fingerprint (compact: sw/sh=screen, vw/vh=viewport, mtp=maxTouchPoints)
        screenWidth: data.sw || null,
        screenHeight: data.sh || null,
        viewportWidth: data.vw || null,
        viewportHeight: data.vh || null,
        maxTouchPoints: data.mtp || null,
        
        // Bot indicators (compact: wd=webdriver, au=automation, hp=honeypot, tr=trap, tp=teleport)
        hasWebdriver: data.wd === 1,
        hasAutomation: data.au === 1,
        honeypotTriggered: data.hp === 1,
        trapLinkClicked: data.tr === 1,
        
        // Outcome (compact: d=destination)
        redirectedTo: data.d || null,
        isBotDetected: data.wd === 1 || data.au === 1 || data.hp === 1 || data.tr === 1,
      });
      
      return res.send(gif);
    } catch (error) {
      console.error('[TikTok2 Telemetry] Error:', error);
      return res.send(gif); // Always return GIF to complete image load
    }
  });
  
  // Legacy route: /api/tt2-bot
  app.get("/api/tt2-bot", async (req: Request, res: Response) => {
    const token = req.query.t as string;
    const reason = req.query.r as string || 'unknown';
    
    if (!token) {
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      return res.send(gif);
    }
    
    const baitData = await consumeTikTok2Token(token);
    if (baitData) {
      const elapsed = Date.now() - baitData.createdAt;
      console.log(`[TikTok2] BOT DETECTED (${reason}) - Token: ${token.substring(0, 16)}... (${elapsed}ms)`);
      storage.createClickLog({
        offerId: baitData.offerId,
        userId: baitData.userId,
        ipAddress: baitData.ip,
        userAgent: baitData.userAgent,
        country: baitData.country,
        device: baitData.device,
        redirectedTo: 'white',
        requestUrl: baitData.requestUrl,
        responseTimeMs: elapsed,
        hasError: false,
        allParams: {
          domainId: baitData.domainId,
          platform: 'tiktok',
          referer: baitData.referer,
          ttclid: baitData.ttclid,
          adname: baitData.adname,
          adset: baitData.adset,
          campaignName: baitData.cname,
          xcode: baitData.xcode,
          botReason: reason,
        },
      }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
      storage.incrementOfferClicks(baitData.offerId, false)
        .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
    }
    
    // Return 1x1 transparent GIF — sent immediately, analytics run in background
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(gif);
  });
  
  // ==========================================
  // TIKTOK 2 BAIT PAGE VERIFICATION (supports both /api/tt2-verify and /v/:token for custom domains)
  // ==========================================
  
  // Verification handler - shared logic
  async function handleVerification(token: string, res: Response) {
    const host = "";
    
    console.log(`[TikTok2] Verify - Token: ${token?.substring(0, 16) || 'MISSING'}...`);
    
    if (!token) {
      console.log(`[TikTok2] Verify - Missing token`);
      return res.status(400).send('Invalid request');
    }
    
    // Consume the token atomically (one-time use) — reads + deletes from Redis
    const baitData = await consumeTikTok2Token(token);
    if (!baitData) {
      console.log(`[TikTok2] Verify - Invalid/expired token: ${token.substring(0, 16)}...`);
      return res.status(400).send('Session expired. Please try again.');
    }
    
    const now = Date.now();
    const elapsed = now - baitData.createdAt;
    
    // Validate timing - too fast is suspicious, too slow means expired
    if (elapsed < 200) {
      console.log(`[TikTok2] BOT DETECTED - Too fast (${elapsed}ms) - Token: ${token.substring(0, 16)}...`);
      storage.createClickLog({
        offerId: baitData.offerId,
        userId: baitData.userId,
        ipAddress: baitData.ip,
        userAgent: baitData.userAgent,
        country: baitData.country,
        device: baitData.device,
        redirectedTo: 'white',
        requestUrl: baitData.requestUrl,
        responseTimeMs: elapsed,
        hasError: false,
        allParams: {
          domainId: baitData.domainId,
          platform: 'tiktok',
          referer: baitData.referer,
          ttclid: baitData.ttclid,
          adname: baitData.adname,
          adset: baitData.adset,
          campaignName: baitData.cname,
          xcode: baitData.xcode,
          botReason: 'too_fast',
        },
      }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
      storage.incrementOfferClicks(baitData.offerId, false)
        .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
      return res.redirect(302, baitData.whiteUrl);
    }
    
    if (elapsed > TIKTOK2_BAIT_EXPIRY_MS) {
      console.log(`[TikTok2] Token expired (${elapsed}ms) - Token: ${token.substring(0, 16)}...`);
      storage.createClickLog({
        offerId: baitData.offerId,
        userId: baitData.userId,
        ipAddress: baitData.ip,
        userAgent: baitData.userAgent,
        country: baitData.country,
        device: baitData.device,
        redirectedTo: 'white',
        requestUrl: baitData.requestUrl,
        responseTimeMs: elapsed,
        hasError: false,
        allParams: {
          domainId: baitData.domainId,
          platform: 'tiktok',
          referer: baitData.referer,
          ttclid: baitData.ttclid,
          adname: baitData.adname,
          adset: baitData.adset,
          campaignName: baitData.cname,
          xcode: baitData.xcode,
          botReason: 'expired',
        },
      }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
      storage.incrementOfferClicks(baitData.offerId, false)
        .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
      return res.redirect(302, baitData.whiteUrl);
    }
    
    // Valid human visitor - log as BLACK and redirect immediately
    console.log(`[TikTok2] HUMAN VERIFIED (${elapsed}ms) - Token: ${token.substring(0, 16)}... → BLACK`);
    
    storage.createClickLog({
      offerId: baitData.offerId,
      userId: baitData.userId,
      ipAddress: baitData.ip,
      userAgent: baitData.userAgent,
      country: baitData.country,
      device: baitData.device,
      redirectedTo: 'black',
      requestUrl: baitData.requestUrl,
      responseTimeMs: elapsed,
      hasError: false,
      allParams: {
        domainId: baitData.domainId,
        platform: 'tiktok',
        referer: baitData.referer,
        ttclid: baitData.ttclid,
        adname: baitData.adname,
        adset: baitData.adset,
        campaignName: baitData.cname,
        xcode: baitData.xcode,
      },
    }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
    storage.incrementOfferClicks(baitData.offerId, true)
      .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
    
    // Append UTM parameters to black page URL
    const finalBlackUrl = appendUTMParams(baitData.blackUrl, baitData.queryParams);
    return res.redirect(302, finalBlackUrl);
  }
  
  // Route for custom domains: /v/:token and /go/:token (fallback)
  app.get("/v/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    console.log(`[TikTok2] Verify via /v/:token - Token: ${token?.substring(0, 16)}...`);
    return handleVerification(token, res);
  });
  
  app.get("/go/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    console.log(`[TikTok2] Verify via /go/:token - Token: ${token?.substring(0, 16)}...`);
    return handleVerification(token, res);
  });
  
  // Legacy route: /api/tt2-verify
  app.get("/api/tt2-verify", async (req: Request, res: Response) => {
    const token = req.query.t as string;
    return handleVerification(token, res);
  });
  
  // Challenge verification route (called by JavaScript)
  // This stores the verification data server-side so it can't be faked
  app.get("/api/challenge/verify/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const score = parseInt(req.query.s as string) || 0;
    const nonce = req.query.r as string || '';
    
    const challenge = await getChallengeToken(token);
    if (!challenge) {
      console.log(`[AntiBot] Verify - Invalid/expired token: ${token.substring(0, 16)}...`);
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      return res.send(gif);
    }
    
    // SERVER-SIDE: Store verification data (can only be set once)
    if (challenge.verifiedAt === null) {
      await updateChallengeToken(token, {
        verifiedAt: Date.now(),
        verifiedScore: score,
        verificationNonce: nonce,
      });
      console.log(`[AntiBot] Verify - Token: ${token.substring(0, 16)}... Score: ${score}, Nonce: ${nonce.substring(0, 8)}, Honeypot: ${challenge.honeypotTriggered}`);
    } else {
      // Token already verified - potential replay attack
      console.log(`[AntiBot] Verify - DUPLICATE attempt for token: ${token.substring(0, 16)}...`);
    }
    
    // Return 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(gif);
  });
  
  // Challenge completion route - validate and redirect
  // Uses SERVER-SIDE stored verification data, not client parameters
  app.get("/api/challenge/complete/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    
    // Consume the token atomically (one-time use) — reads + deletes from Redis.
    // If Redis is unavailable or token is expired/already used, challenge returns null.
    // Safe fallback: treat as bot → white page.
    const challenge = await consumeChallengeToken(token);
    if (!challenge) {
      console.log(`[AntiBot] Complete - Invalid/expired/already-used token: ${token.substring(0, 16)}...`);
      return res.status(400).send('Challenge expired. Please try again.');
    }
    
    const now = Date.now();
    const tokenAge = now - challenge.createdAt;
    
    // Use SERVER-SIDE verification data (not client-supplied params)
    const score = challenge.verifiedScore ?? 0;
    const verifiedAt = challenge.verifiedAt;
    const elapsed = verifiedAt ? (verifiedAt - challenge.createdAt) : 0;
    
    // Validate the challenge
    let isBot = false;
    let botReason = '';
    
    // 1. Check if verification route was never called (JavaScript didn't run)
    if (!verifiedAt) {
      isBot = true;
      botReason = 'no_js_verification';
      console.log(`[AntiBot] BOT - No JavaScript verification (direct access to complete route)`);
    }
    
    // 2. Check if honeypot was triggered
    if (!isBot && challenge.honeypotTriggered) {
      isBot = true;
      botReason = 'honeypot_triggered';
      console.log(`[AntiBot] BOT - Honeypot was triggered`);
    }
    
    // 3. Check if response was too fast (bots don't run JavaScript properly)
    // Using SERVER-MEASURED elapsed time
    if (!isBot && elapsed < MIN_HUMAN_TIME_MS) {
      isBot = true;
      botReason = `too_fast:${elapsed}ms`;
      console.log(`[AntiBot] BOT - Response too fast: ${elapsed}ms (min: ${MIN_HUMAN_TIME_MS}ms)`);
    }
    
    // 4. Check if token is too old (Redis TTL is authoritative; this is an extra safety net)
    if (!isBot && tokenAge > CHALLENGE_EXPIRY_MS) {
      isBot = true;
      botReason = `token_expired:${tokenAge}ms`;
      console.log(`[AntiBot] BOT - Token expired: ${tokenAge}ms (max: ${CHALLENGE_EXPIRY_MS}ms)`);
    }
    
    // 5. Check browser verification score (from SERVER-STORED data)
    const MIN_SCORE = 50; // Minimum score to be considered human
    if (!isBot && score < MIN_SCORE) {
      isBot = true;
      botReason = `low_score:${score}`;
      console.log(`[AntiBot] BOT - Score too low: ${score} (min: ${MIN_SCORE})`);
    }
    
    // Token already consumed above (one-time use enforced by Redis GET+DEL)
    
    // Log the result
    console.log(`[AntiBot] Challenge result - Token: ${token.substring(0, 16)}... IsBot: ${isBot} Reason: ${botReason || 'passed'} Score: ${score} Elapsed: ${elapsed}ms`);
    
    // Determine redirect URL and log the click
    let targetUrl: string;
    const redirectedTo = isBot ? 'white' : 'black';
    
    if (isBot) {
      // Bot detected - always go to white page
      const offer = await storage.getOffer(challenge.offerId);
      if (!offer) {
        return res.status(404).send('Not found');
      }
      targetUrl = offer.whitePageUrl;
    } else {
      // Human verified - go to black page with UTM params
      targetUrl = appendUTMParams(challenge.targetUrl, challenge.queryParams);
    }
    
    // LOG THE CLICK AFTER CHALLENGE RESULT — fire-and-forget, redirect goes first
    const redirectStart = Date.now();
    storage.createClickLog({
      offerId: challenge.offerId,
      userId: challenge.userId,
      ipAddress: challenge.ip,
      userAgent: challenge.userAgent,
      country: challenge.country,
      device: challenge.device,
      redirectedTo: redirectedTo,
      requestUrl: challenge.requestUrl,
      responseTimeMs: elapsed,
      hasError: false,
      allParams: {
        platform: challenge.platform,
        referer: challenge.referer,
        ttclid: challenge.ttclid,
        fbcl: challenge.fbcl,
        campaignName: challenge.cname,
        challengeResult: isBot ? 'failed' : 'passed',
        botReason: isBot ? botReason : null,
        challengeScore: score,
        challengeElapsed: elapsed,
        honeypotTriggered: challenge.honeypotTriggered,
      },
    }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
    storage.incrementOfferClicks(challenge.offerId, !isBot)
      .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
    
    console.log(`[AntiBot] ${redirectedTo.toUpperCase()} redirect after challenge - Score: ${score}, Elapsed: ${elapsed}ms, Bot: ${isBot} - Redirect in ${Date.now() - redirectStart}ms`);
    
    return res.redirect(302, targetUrl);
  });

  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const isSuspended = user.suspendedAt !== null;
      const isTrialing = user.trialEndsAt !== null && new Date(user.trialEndsAt) > new Date();
      const isSubscriptionActive = ['active', 'trialing'].includes(user.subscriptionStatus ?? '');
      
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const isAdminByEmail = !!(adminEmail && user.email?.toLowerCase() === adminEmail);
      const isAdmin = user.isAdmin === true || isAdminByEmail;
      const isImpersonating = (req as any).user?.isImpersonating === true;
      const originalAdminId = (req as any).user?.originalAdminId ?? null;

      res.json({ ...toSafeUser(user), isSuspended, isTrialing, isAdmin, isSubscriptionActive, isImpersonating, originalAdminId });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans.filter(p => p.isActive));
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = req.query.offerId as string;
      const platform = req.query.platform as string;
      const dateRange = (req.query.dateRange as string) || "today";
      const customStart = req.query.startDate as string;
      const customEnd = req.query.endDate as string;

      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      let useHourly = false;

      switch (dateRange) {
        case "today":
          startDate = startOfLocalDay(now);
          endDate = endOfLocalDay(now);
          useHourly = true;
          break;
        case "yesterday": {
          const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = startOfLocalDay(yest);
          endDate = endOfLocalDay(yest);
          useHourly = true;
          break;
        }
        case "week":
          startDate = startOfLocalDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
          endDate = endOfLocalDay(now);
          break;
        case "month":
          startDate = startOfLocalDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
          endDate = endOfLocalDay(now);
          break;
        case "custom":
          if (customStart) { startDate = startOfLocalDay(new Date(customStart)); }
          if (customEnd) { endDate = endOfLocalDay(new Date(customEnd)); }
          break;
        default:
          break;
      }

      const statsResult = await storage.getDashboardStats(userId, {
        offerId: offerId && offerId !== "all" ? parseInt(offerId) : undefined,
        platform: platform && platform !== "all" ? platform : undefined,
        startDate,
        endDate,
        useHourly,
      });

      res.json(statsResult);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/fail-reasons", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = req.query.offerId as string;
      const platform = req.query.platform as string;
      const dateRange = (req.query.dateRange as string) || "today";
      const customStart = req.query.startDate as string;
      const customEnd = req.query.endDate as string;

      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      switch (dateRange) {
        case "today":
          startDate = startOfLocalDay(now);
          endDate = endOfLocalDay(now);
          break;
        case "yesterday": {
          const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = startOfLocalDay(yest);
          endDate = endOfLocalDay(yest);
          break;
        }
        case "week":
          startDate = startOfLocalDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
          endDate = endOfLocalDay(now);
          break;
        case "month":
          startDate = startOfLocalDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
          endDate = endOfLocalDay(now);
          break;
        case "custom":
          if (customStart) startDate = startOfLocalDay(new Date(customStart));
          if (customEnd) endDate = endOfLocalDay(new Date(customEnd));
          break;
        default:
          break;
      }

      const result = await storage.getDashboardFailReasons(userId, {
        offerId: offerId && offerId !== "all" ? parseInt(offerId) : undefined,
        platform: platform && platform !== "all" ? platform : undefined,
        startDate,
        endDate,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching fail reasons:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/breakdown", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = req.query.offerId as string;
      const platform = req.query.platform as string;
      const dateRange = (req.query.dateRange as string) || "today";
      const customStart = req.query.startDate as string;
      const customEnd = req.query.endDate as string;

      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      switch (dateRange) {
        case "today":
          startDate = startOfLocalDay(now);
          endDate = endOfLocalDay(now);
          break;
        case "yesterday": {
          const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = startOfLocalDay(yest);
          endDate = endOfLocalDay(yest);
          break;
        }
        case "week":
          startDate = startOfLocalDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
          endDate = endOfLocalDay(now);
          break;
        case "month":
          startDate = startOfLocalDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
          endDate = endOfLocalDay(now);
          break;
        case "custom":
          if (customStart) startDate = startOfLocalDay(new Date(customStart));
          if (customEnd) endDate = endOfLocalDay(new Date(customEnd));
          break;
        default:
          break;
      }

      const result = await storage.getDashboardBreakdown(userId, {
        offerId: offerId && offerId !== "all" ? parseInt(offerId) : undefined,
        platform: platform && platform !== "all" ? platform : undefined,
        startDate,
        endDate,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching dashboard breakdown:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/export/logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const format = req.query.format as string || "csv";
      const logs = await storage.getClickLogs(userId, 1, 10000);
      
      if (format === "csv") {
        const headers = ["ID", "Date", "Country", "Device", "Redirect Type", "IP", "User Agent", "Offer Name"];
        const csvRows = [headers.join(",")];
        
        for (const log of logs.logs) {
          const row = [
            log.id,
            new Date(log.createdAt).toISOString(),
            log.country || "",
            log.device || "",
            log.redirectedTo || "",
            log.ip || "",
            `"${(log.userAgent || "").replace(/"/g, '""')}"`,
            `"${((log as any).offer?.name || "").replace(/"/g, '""')}"`
          ];
          csvRows.push(row.join(","));
        }
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=click_logs_${new Date().toISOString().split("T")[0]}.csv`);
        return res.send(csvRows.join("\n"));
      }
      
      res.status(400).json({ message: "Unsupported format" });
    } catch (error) {
      console.error("Error exporting logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  app.get("/api/offers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offers = await storage.getOffersByUserId(userId);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/offers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { name, platform, domainId, blackPageUrl, blackPages, whitePageUrl, allowedCountries, allowedDevices, isActive } = req.body;

      let validatedBlackPages: Array<{ url: string; percentage: number }> | null = null;
      let finalBlackPageUrl = blackPageUrl;

      if (blackPages && Array.isArray(blackPages) && blackPages.length > 0) {
        if (blackPages.length > 5) {
          return res.status(400).json({ message: "Maximum of 5 black page links allowed" });
        }
        for (const bp of blackPages) {
          if (!bp.url || typeof bp.url !== 'string' || bp.url.trim() === '') {
            return res.status(400).json({ message: "All black page links must have a valid URL" });
          }
          if (typeof bp.percentage !== 'number' || bp.percentage < 10) {
            return res.status(400).json({ message: "Each black page link must have at least 10% traffic" });
          }
        }
        const rounded = blackPages.map((bp: any) => ({ url: bp.url.trim(), percentage: Math.round(bp.percentage) }));
        const totalRounded = rounded.reduce((sum: number, bp: any) => sum + bp.percentage, 0);
        if (totalRounded !== 100) {
          rounded[0].percentage += 100 - totalRounded;
        }
        validatedBlackPages = rounded;
        finalBlackPageUrl = validatedBlackPages[0].url;
      }

      const canCreate = await storage.canUserCreateOffer(userId);
      if (!canCreate.allowed) {
        if (canCreate.reason === 'user_suspended') {
          return res.status(403).json({ 
            message: "Your account is suspended. Please upgrade your plan to continue.",
            code: "USER_SUSPENDED"
          });
        }
        if (canCreate.reason === 'subscription_inactive') {
          return res.status(403).json({ 
            message: "Your subscription is inactive. Please renew your plan to create offers.",
            code: "SUBSCRIPTION_INACTIVE"
          });
        }
        if (canCreate.reason === 'no_active_plan') {
          return res.status(403).json({ 
            message: "You need an active plan to create offers.",
            code: "NO_ACTIVE_PLAN"
          });
        }
        if (canCreate.reason === 'limit_reached') {
          return res.status(403).json({ 
            message: `You have reached the maximum number of offers (${canCreate.limit}) for your plan. Please upgrade to create more.`,
            code: "OFFER_LIMIT_REACHED",
            currentCount: canCreate.currentCount,
            limit: canCreate.limit
          });
        }
        return res.status(403).json({ message: "Cannot create offer", code: canCreate.reason });
      }

      console.log("[Offer Create] Received domainId:", domainId, "type:", typeof domainId);

      let parsedDomainId: number | null = null;
      let parsedSharedDomainId: number | null = null;

      if (domainId && domainId !== "platform" && domainId !== "0" && domainId !== "") {
        if (String(domainId).startsWith("shared_")) {
          parsedSharedDomainId = parseInt(String(domainId).replace("shared_", ""));
          console.log("[Offer Create] Parsed as SHARED domain:", parsedSharedDomainId);
        } else {
          parsedDomainId = parseInt(domainId);
          console.log("[Offer Create] Parsed as USER domain:", parsedDomainId);
        }
      }

      const slug = await generateUniqueSlug(storage, parsedDomainId, parsedSharedDomainId);
      const xcode = generateXcode();
      const offer = await storage.createOffer({
        userId,
        name,
        slug,
        platform,
        domainId: parsedDomainId,
        sharedDomainId: parsedSharedDomainId,
        blackPageUrl: finalBlackPageUrl,
        blackPages: validatedBlackPages,
        whitePageUrl,
        allowedCountries: allowedCountries || ["BR"],
        allowedDevices: allowedDevices || ["smartphone"],
        isActive: isActive !== false,
        xcode,
      });

      res.json(offer);
    } catch (error) {
      console.error("Error creating offer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/offers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = parseInt(req.params.id);
      const offer = await storage.getOffer(offerId);

      if (!offer || offer.userId !== userId) {
        return res.status(404).json({ message: "Offer not found" });
      }

      const { name, slug, platform, domainId, blackPageUrl, blackPages, whitePageUrl, allowedCountries, allowedDevices, isActive } = req.body;

      let validatedBlackPages: Array<{ url: string; percentage: number }> | null = null;
      let finalBlackPageUrl = blackPageUrl;

      if (blackPages && Array.isArray(blackPages) && blackPages.length > 0) {
        if (blackPages.length > 5) {
          return res.status(400).json({ message: "Maximum of 5 black page links allowed" });
        }
        for (const bp of blackPages) {
          if (!bp.url || typeof bp.url !== 'string' || bp.url.trim() === '') {
            return res.status(400).json({ message: "All black page links must have a valid URL" });
          }
          if (typeof bp.percentage !== 'number' || bp.percentage < 10) {
            return res.status(400).json({ message: "Each black page link must have at least 10% traffic" });
          }
        }
        const rounded = blackPages.map((bp: any) => ({ url: bp.url.trim(), percentage: Math.round(bp.percentage) }));
        const totalRounded = rounded.reduce((sum: number, bp: any) => sum + bp.percentage, 0);
        if (totalRounded !== 100) {
          rounded[0].percentage += 100 - totalRounded;
        }
        validatedBlackPages = rounded;
        finalBlackPageUrl = validatedBlackPages[0].url;
      }

      let parsedDomainId: number | null = null;
      let parsedSharedDomainId: number | null = null;

      if (domainId && domainId !== "platform" && domainId !== "0" && domainId !== "") {
        if (String(domainId).startsWith("shared_")) {
          parsedSharedDomainId = parseInt(String(domainId).replace("shared_", ""));
        } else {
          parsedDomainId = parseInt(domainId);
        }
      }

      const domainChanged = slug !== offer.slug || parsedDomainId !== offer.domainId || parsedSharedDomainId !== offer.sharedDomainId;
      
      if (domainChanged) {
        if (parsedSharedDomainId) {
          const existingOffer = await storage.getOfferBySlugAndSharedDomain(slug, parsedSharedDomainId);
          if (existingOffer && existingOffer.id !== offerId) {
            return res.status(400).json({ message: "Slug already exists on this shared domain" });
          }
        } else {
          const existingOffer = await storage.getOfferBySlugAndDomain(slug, parsedDomainId);
          if (existingOffer && existingOffer.id !== offerId) {
            return res.status(400).json({ message: "Slug already exists on this domain" });
          }
        }
      }

      const updated = await storage.updateOffer(offerId, {
        name,
        slug,
        platform,
        domainId: parsedDomainId,
        sharedDomainId: parsedSharedDomainId,
        blackPageUrl: finalBlackPageUrl,
        blackPages: validatedBlackPages,
        whitePageUrl,
        allowedCountries,
        allowedDevices,
        isActive,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating offer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/offers/:id/extra-params", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = parseInt(req.params.id);
      const { extraParams } = req.body;

      const offer = await storage.getOffer(offerId);
      if (!offer || offer.userId !== userId) {
        return res.status(404).json({ message: "Offer not found" });
      }

      const updated = await storage.updateOffer(offerId, { extraParams: extraParams || "" });
      res.json(updated);
    } catch (error) {
      console.error("Error saving extra params:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/offers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = parseInt(req.params.id);
      const offer = await storage.getOffer(offerId);

      if (!offer || offer.userId !== userId) {
        return res.status(404).json({ message: "Offer not found" });
      }

      await storage.deleteOffer(offerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting offer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Preview proxy routes - fetch external pages and strip frame-blocking headers
  app.get("/api/offers/:id/preview", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = parseInt(req.params.id);
      const variant = req.query.variant as string; // 'black' or 'white'

      if (!variant || !['black', 'white'].includes(variant)) {
        return res.status(400).json({ message: "Invalid variant. Use 'black' or 'white'" });
      }

      const offer = await storage.getOffer(offerId);
      if (!offer || offer.userId !== userId) {
        return res.status(404).json({ message: "Offer not found" });
      }

      const targetUrl = variant === 'black' ? selectBlackPageUrl(offer) : offer.whitePageUrl;
      if (!targetUrl) {
        return res.status(400).json({ message: `No ${variant} page URL configured` });
      }

      console.log(`[Preview Proxy] Fetching ${variant} page: ${targetUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          redirect: 'follow',
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return res.status(response.status).json({ message: `Target page returned ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'text/html';
        
        if (!contentType.includes('text/html')) {
          return res.status(400).json({ message: "Target URL is not an HTML page" });
        }

        let html = await response.text();
        const baseUrl = new URL(targetUrl);
        // Use the full URL as base for proper relative path resolution
        // Handle cases: https://example.com, https://example.com/, https://example.com/page, https://example.com/path/page
        let baseHref: string;
        const pathPart = baseUrl.pathname;
        if (pathPart === '/' || pathPart === '') {
          baseHref = baseUrl.origin + '/';
        } else if (targetUrl.endsWith('/')) {
          baseHref = targetUrl;
        } else {
          // Get directory of the current page
          const lastSlashIndex = targetUrl.lastIndexOf('/');
          baseHref = lastSlashIndex > targetUrl.indexOf('://') + 2 
            ? targetUrl.substring(0, lastSlashIndex + 1) 
            : baseUrl.origin + '/';
        }

        // Rewrite relative URLs to absolute
        html = html.replace(/(href|src|action)=["'](?!http|\/\/|data:|javascript:|#|mailto:)([^"']+)["']/gi, (match, attr, path) => {
          try {
            // For absolute paths starting with /, use origin
            if (path.startsWith('/')) {
              return `${attr}="${baseUrl.origin}${path}"`;
            }
            // For relative paths, use the directory of the current page
            const absoluteUrl = new URL(path, baseHref).href;
            return `${attr}="${absoluteUrl}"`;
          } catch {
            return match;
          }
        });

        // Fix protocol-relative URLs
        html = html.replace(/(href|src|action)=["']\/\/([^"']+)["']/gi, (match, attr, path) => {
          return `${attr}="https://${path}"`;
        });

        // Remove frame-busting scripts
        html = html.replace(/<script[^>]*>[\s\S]*?(top\.location|parent\.location|self\.location\s*=\s*top)[\s\S]*?<\/script>/gi, '');
        html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)[\s\S]*?(top\.location|break|return)/gi, '');
        html = html.replace(/if\s*\(\s*window\s*!==?\s*window\.top\s*\)[\s\S]*?(location|break|return)/gi, '');

        // Add base tag if not present (use baseHref for proper relative path resolution)
        if (!/<base\s/i.test(html)) {
          html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}" target="_self">`);
        }

        // Set headers that allow embedding
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        res.send(html);
      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ message: "Request timeout - page took too long to load" });
        }
        console.error(`[Preview Proxy] Fetch error:`, fetchError);
        return res.status(502).json({ message: `Failed to fetch page: ${fetchError.message}` });
      }
    } catch (error) {
      console.error("Error in preview proxy:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const domains = await storage.getDomainsByUserId(userId);
      res.json(domains);
    } catch (error) {
      console.error("Error fetching domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { subdomain } = req.body;

      // Check if user can create more domains
      const canCreate = await storage.canUserCreateDomain(userId);
      if (!canCreate.allowed) {
        if (canCreate.reason === 'user_suspended') {
          return res.status(403).json({ 
            message: "Your account is suspended. Please upgrade your plan to continue.",
            code: "USER_SUSPENDED"
          });
        }
        if (canCreate.reason === 'subscription_inactive') {
          return res.status(403).json({ 
            message: "Your subscription is inactive. Please renew your plan to add domains.",
            code: "SUBSCRIPTION_INACTIVE"
          });
        }
        if (canCreate.reason === 'no_active_plan') {
          return res.status(403).json({ 
            message: "You need an active plan to add domains.",
            code: "NO_ACTIVE_PLAN"
          });
        }
        if (canCreate.reason === 'limit_reached') {
          return res.status(403).json({ 
            message: `You have reached the maximum number of domains (${canCreate.limit}) for your plan. Please upgrade to add more.`,
            code: "DOMAIN_LIMIT_REACHED",
            currentCount: canCreate.currentCount,
            limit: canCreate.limit
          });
        }
        return res.status(403).json({ message: "Cannot create domain", code: canCreate.reason });
      }

      const existing = await storage.getDomainBySubdomain(subdomain);
      if (existing) {
        return res.status(400).json({ message: "Domain already exists" });
      }

      let domain = await storage.createDomain({
        userId,
        subdomain,
        isActive: true,
        isVerified: false,
        sslStatus: "pending",
      });

      // Sync with EasyPanel (add domain automatically)
      const { easypanelService } = await import("./easypanel");
      console.log(`[EasyPanel] Attempting to add domain: ${subdomain}, isConfigured: ${easypanelService.isConfigured()}`);
      if (easypanelService.isConfigured()) {
        const result = await easypanelService.addDomain(subdomain);
        console.log(`[EasyPanel] Add domain result:`, result);
        if (result.success && result.domainId) {
          // Save the EasyPanel domain ID
          domain = await storage.updateDomain(domain.id, {
            easypanelDomainId: result.domainId
          });
          console.log(`[EasyPanel] Saved EasyPanel domain ID: ${result.domainId}`);
        } else if (!result.success) {
          console.log(`[EasyPanel] Failed to add domain, but continuing: ${result.error}`);
        }
      } else {
        console.log(`[EasyPanel] Skipping - not configured`);
      }

      res.json(domain);
    } catch (error) {
      console.error("Error creating domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/domains/:id/verify", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const domainId = parseInt(req.params.id);
      const domain = await storage.getDomain(domainId);

      if (!domain || domain.userId !== userId) {
        return res.status(404).json({ message: "Domain not found" });
      }

      const dnsResult = await verifyDomainDNS(domain.subdomain, "user_verify");

      // Build rich response payload (always returned, even on failure)
      const richPayload = {
        verified: dnsResult.verified,
        errorType: dnsResult.errorType,
        error: dnsResult.error || null,
        transient: dnsResult.allTransient,
        resolverResults: dnsResult.resolverResults,
        foundCnames: dnsResult.foundCnames,
        expectedCname: dnsResult.expectedCname,
        source: dnsResult.source,
        checkedAt: dnsResult.checkedAt,
        resolverUsed: dnsResult.resolverUsed,
      };

      if (dnsResult.verified) {
        // ── SUCCESS ────────────────────────────────────────────
        console.log(JSON.stringify({
          event: "DOMAIN_STATE_CHANGE", changed: true,
          domain: domain.subdomain, domainId, domainType: "user", source: "user_verify",
          previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
          newState: { isActive: true, isVerified: true, sslStatus: "active" },
          OFFICIAL_CNAME_value: dnsResult.expectedCname, resolver: dnsResult.resolverUsed,
          processPid: process.pid, hostname: require("os").hostname(),
          timestamp: new Date().toISOString(),
        }));
        const updated = await storage.updateDomain(domainId, {
          isVerified: true, isActive: true,
          lastCheckedAt: new Date(), lastVerificationError: null, sslStatus: "active",
        });
        resetConsecutiveFailures("user", domainId);
        return res.json({ ...richPayload, domain: updated });
      }

      if (dnsResult.allTransient) {
        // ── TRANSIENT FAILURE: preserve current state, save error note only ──
        console.log(JSON.stringify({
          event: "MANUAL_VERIFY_TRANSIENT",
          domain: domain.subdomain, domainId, source: "user_verify",
          error: dnsResult.error, resolverUsed: dnsResult.resolverUsed,
          note: "State preserved — domain NOT deactivated for transient DNS failure",
          processPid: process.pid, hostname: require("os").hostname(),
          timestamp: new Date().toISOString(),
        }));
        await storage.updateDomain(domainId, {
          lastCheckedAt: new Date(),
          lastVerificationError: `[DNS instável] ${dnsResult.error}`,
        });
        const current = await storage.getDomain(domainId);
        return res.json({ ...richPayload, domain: current });
      }

      // ── PERMANENT / MISMATCH FAILURE ───────────────────────
      // Mark isVerified=false so the user sees the problem, but do NOT set isActive=false.
      // The monitor handles deactivation after repeated confirmed failures.
      console.log(JSON.stringify({
        event: "DOMAIN_STATE_CHANGE", changed: domain.isVerified !== false,
        domain: domain.subdomain, domainId, domainType: "user", source: "user_verify",
        previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
        newState: { isActive: domain.isActive, isVerified: false },
        OFFICIAL_CNAME_value: dnsResult.expectedCname, resolver: dnsResult.resolverUsed,
        error: dnsResult.error, errorType: dnsResult.errorType,
        processPid: process.pid, hostname: require("os").hostname(),
        timestamp: new Date().toISOString(),
      }));
      const updated = await storage.updateDomain(domainId, {
        isVerified: false,
        lastCheckedAt: new Date(),
        lastVerificationError: dnsResult.error || "DNS verification failed",
      });
      return res.json({ ...richPayload, domain: updated });
    } catch (error) {
      console.error("Error verifying domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/domains/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const domainId = parseInt(req.params.id);
      const domain = await storage.getDomain(domainId);

      if (!domain || domain.userId !== userId) {
        return res.status(404).json({ message: "Domain not found" });
      }

      // Get user info for email notification
      const user = await storage.getUser(userId);
      const domainName = domain.subdomain;

      // Sync with EasyPanel (remove domain automatically)
      const { easypanelService } = await import("./easypanel");
      if (easypanelService.isConfigured() && domain.easypanelDomainId) {
        console.log(`[EasyPanel] Removing domain with EasyPanel ID: ${domain.easypanelDomainId}`);
        const result = await easypanelService.removeDomain(domain.easypanelDomainId);
        if (!result.success) {
          console.log(`[EasyPanel] Failed to remove domain, but continuing: ${result.error}`);
        }
      } else if (!domain.easypanelDomainId) {
        console.log(`[EasyPanel] No EasyPanel domain ID stored, skipping removal`);
      }

      await storage.deleteDomain(domainId);

      // Send email notification to user about domain removal
      if (user?.email) {
        const firstName = user.firstName || "Usuário";
        sendDomainRemovedEmail(user.email, domainName, 'user_deleted', firstName, userId).catch(err => {
          console.error(`Failed to send domain removed email to ${user.email}:`, err);
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/stripe/config", async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error fetching Stripe config:", error);
      res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
    }
  });

  app.post("/api/billing/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const { planId } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const stripe = await getStripeClient();
      
      const { customerId } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );

      const priceResult = await db.execute(
        sql`SELECT id FROM stripe.prices WHERE product = ${plan.stripePriceId} AND active = true LIMIT 1`
      );
      const priceId = priceResult.rows[0]?.id as string;

      if (!priceId && plan.stripePriceId) {
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          mode: 'subscription',
          success_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=success`,
          cancel_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=cancelled`,
          subscription_data: plan.hasTrial ? { trial_period_days: plan.trialDays } : undefined,
          metadata: { userId, planId: String(planId) },
        });
        return res.json({ url: session.url });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ 
          price_data: {
            currency: 'brl',
            product_data: { name: plan.name },
            unit_amount: plan.price * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1 
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=cancelled`,
        subscription_data: plan.hasTrial ? { trial_period_days: plan.trialDays } : undefined,
        metadata: { userId, planId: String(planId) },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Error creating checkout session (/api/billing/checkout):", error?.message || error);
      const message = error?.type === 'StripeAuthenticationError'
        ? "Stripe key invalid or expired. Contact support."
        : error?.message || "Internal server error";
      res.status(500).json({ message, code: error?.code || "CHECKOUT_ERROR" });
    }
  });

  app.post("/api/billing/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = await getStripeClient();
      
      const { customerId } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );
      
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${req.protocol}://${req.get('host')}/settings`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating billing portal:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/billing/invoices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.json([]);
      }

      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.json([]);
      }

      const stripe = await getStripeClient();
      
      const { customerId, wasRecreated } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );
      
      if (wasRecreated) {
        return res.json([]);
      }
      
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 10,
      });

      res.json(invoices.data.map(inv => ({
        id: inv.id,
        amount: inv.amount_due / 100,
        currency: inv.currency,
        status: inv.status,
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        pdfUrl: inv.invoice_pdf,
      })));
    } catch (error: any) {
      console.error("Error fetching invoices:", error);
      if (error?.code === "resource_missing" || error?.type === "StripeInvalidRequestError") {
        return res.json([]);
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/billing/payment-methods", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.json({ paymentMethods: [], defaultPaymentMethodId: null });
      }

      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.json({ paymentMethods: [], defaultPaymentMethodId: null });
      }

      const stripe = await getStripeClient();
      
      const { customerId, wasRecreated } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );
      
      if (wasRecreated) {
        return res.json({ paymentMethods: [], defaultPaymentMethodId: null });
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      const customer = await stripe.customers.retrieve(customerId) as any;
      const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || null;

      res.json({
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
          isDefault: pm.id === defaultPaymentMethodId,
        })),
        defaultPaymentMethodId,
      });
    } catch (error: any) {
      console.error("Error fetching payment methods:", error);
      if (error?.code === "resource_missing" || error?.type === "StripeInvalidRequestError") {
        return res.json({ paymentMethods: [], defaultPaymentMethodId: null });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/billing/payment-methods/setup", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const stripe = await getStripeClient();
      
      const { customerId } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      });

      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error) {
      console.error("Error creating setup intent:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/billing/payment-methods/:id/default", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const paymentMethodId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = await getStripeClient();
      
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ message: "Payment method not found" });
      }
      
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      if (user.stripeSubscriptionId) {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          default_payment_method: paymentMethodId,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/billing/payment-methods/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const paymentMethodId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = await getStripeClient();
      
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ message: "Payment method not found" });
      }
      
      const customer = await stripe.customers.retrieve(user.stripeCustomerId) as any;
      if (customer.invoice_settings?.default_payment_method === paymentMethodId) {
        return res.status(400).json({ message: "Cannot delete default payment method" });
      }

      const allPaymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });
      
      if (allPaymentMethods.data.length <= 1) {
        return res.status(400).json({ message: "Cannot delete the last payment method" });
      }

      await stripe.paymentMethods.detach(paymentMethodId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/change-password", isAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      
      if (user) {
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          token,
          expiresAt,
        });

        const baseUrl = process.env.BASE_URL || "https://clerion.app";
        const resetLink = `${baseUrl}/reset-password?token=${token}`;
        
        await sendPasswordResetEmail(user.email, resetLink, user.id);
      }

      res.json({ success: true, message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error) {
      console.error("Error requesting password reset:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(sql`${passwordResetTokens.token} = ${token} AND ${passwordResetTokens.usedAt} IS NULL AND ${passwordResetTokens.expiresAt} > NOW()`)
        .limit(1);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 10);

      await storage.updateUserPassword(resetToken.userId, hashedPassword);

      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(sql`${passwordResetTokens.id} = ${resetToken.id}`);

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/verify-reset-token", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({ valid: false, message: "Token is required" });
      }

      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(sql`${passwordResetTokens.token} = ${token} AND ${passwordResetTokens.usedAt} IS NULL AND ${passwordResetTokens.expiresAt} > NOW()`)
        .limit(1);

      if (!resetToken) {
        return res.json({ valid: false, message: "Invalid or expired reset token" });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Error verifying reset token:", error);
      res.status(500).json({ valid: false, message: "Internal server error" });
    }
  });

  app.get("/api/user/usage", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      const usage = await storage.getUserUsage(userId);
      const plan = user?.planId ? await storage.getPlan(user.planId) : null;
      
      res.json({
        offersCount: usage.offers.used,
        offersLimit: plan?.isUnlimited ? null : (usage.offers.limit ?? null),
        domainsCount: usage.domains.used,
        domainsLimit: plan?.isUnlimited ? null : (usage.domains.limit ?? null),
        clicksThisMonth: user?.clicksUsedThisMonth ?? 0,
        clicksLimit: plan?.isUnlimited ? null : (plan?.maxClicks ?? null),
        isUnlimited: plan?.isUnlimited ?? false,
        gracePeriodEndsAt: user?.gracePeriodEndsAt ?? null,
        isSuspended: user?.suspendedAt !== null,
        clicksResetDate: user?.clicksResetDate ?? null,
        subscriptionStatus: user?.subscriptionStatus ?? null,
      });
    } catch (error) {
      console.error("Error fetching user usage:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/user/click-stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const stats = await storage.getUserClickStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching click stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/subscription/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const { priceId, planId, couponCode } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate coupon if provided
      let validatedCoupon: { id: number; discountType: string; discountValue: number; discountDurationMonths: number | null; affiliateUserId: string | null; commissionType: string | null; commissionValue: number | null; commissionDurationMonths: number | null } | null = null;
      
      if (couponCode) {
        const planIdNum = planId || (priceId ? (await storage.getPlanByStripePriceId(priceId))?.id : null);
        if (!planIdNum) {
          return res.status(400).json({ message: "Plan not found for coupon validation" });
        }
        
        const validation = await storage.validateCouponForUser(couponCode, userId, planIdNum);
        if (!validation.valid) {
          return res.status(400).json({ message: "Invalid coupon", error: validation.error });
        }
        validatedCoupon = validation.coupon!;
      }

      const stripe = await getStripeClient();
      
      const { customerId } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );

      if (!priceId && !planId) {
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          mode: 'setup',
          metadata: {
            userId: userId,
            setupMode: 'true',
          },
          success_url: `${req.protocol}://${req.get('host')}/subscription?checkout=setup_success`,
          cancel_url: `${req.protocol}://${req.get('host')}/subscription?checkout=cancelled`,
        });
        return res.json({ url: session.url });
      }

      let plan = priceId ? await storage.getPlanByStripePriceId(priceId) : null;
      if (!plan && planId) {
        plan = await storage.getPlan(planId);
      }
      
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      // Block free, inactive, and unconfigured plans from checkout
      if (plan.isFree) {
        return res.status(400).json({ message: "Cannot create checkout for free plan", code: "FREE_PLAN_CHECKOUT" });
      }
      if (!plan.isActive) {
        return res.status(400).json({ message: "This plan is no longer available", code: "INACTIVE_PLAN" });
      }
      if (!plan.stripePriceId) {
        return res.status(400).json({ message: "Plan is not configured for billing. Contact support.", code: "PLAN_NOT_CONFIGURED" });
      }

      // Check if this is a downgrade and if usage exceeds new plan limits
      if (!plan.isUnlimited) {
        const offersCount = await storage.getUserOffersCount(userId);
        const domainsCount = await storage.getUserDomainsCount(userId);

        if (offersCount > plan.maxOffers) {
          return res.status(400).json({ 
            message: `You have ${offersCount} offers but this plan only allows ${plan.maxOffers}. Please delete some offers before downgrading.`,
            code: "DOWNGRADE_OFFERS_EXCEEDED",
            currentOffers: offersCount,
            planLimit: plan.maxOffers
          });
        }

        if (domainsCount > plan.maxDomains) {
          return res.status(400).json({ 
            message: `You have ${domainsCount} domains but this plan only allows ${plan.maxDomains}. Please delete some domains before downgrading.`,
            code: "DOWNGRADE_DOMAINS_EXCEEDED",
            currentDomains: domainsCount,
            planLimit: plan.maxDomains
          });
        }
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 100,
      });

      if (paymentMethods.data.length > 0) {
        const { paymentMethodId } = req.body;
        
        let selectedPaymentMethod: string;
        if (paymentMethodId) {
          try {
            const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
            if (pm.customer !== customerId) {
              return res.status(400).json({ message: "Invalid payment method selected" });
            }
            selectedPaymentMethod = paymentMethodId;
          } catch (err) {
            return res.status(400).json({ message: "Invalid payment method selected" });
          }
        } else {
          const customer = await stripe.customers.retrieve(customerId) as any;
          selectedPaymentMethod = customer.invoice_settings?.default_payment_method || paymentMethods.data[0].id;
        }

        // ── Plan change for existing subscriber ──────────────────────────────
        // If the user already has an active/trialing/past_due subscription, update it
        // instead of creating a new one (which would cause duplicate billing).
        const existingSubId = user.stripeSubscriptionId;
        const canUpdateExisting = !!existingSubId &&
          ['active', 'trialing', 'past_due'].includes(user.subscriptionStatus || '');

        if (canUpdateExisting) {
          const currentPlan = user.planId ? await storage.getPlan(user.planId) : null;
          const isUpgrade = !currentPlan || plan.price > currentPlan.price;
          const isDowngrade = !!currentPlan && plan.price < currentPlan.price;

          if (!isUpgrade && !isDowngrade) {
            return res.status(400).json({ message: "This is already your current plan.", code: "SAME_PLAN" });
          }

          // Retrieve current Stripe subscription to get item ID
          let existingSub: any;
          try {
            existingSub = await stripe.subscriptions.retrieve(existingSubId!);
          } catch (err: any) {
            console.error('[Stripe] Could not retrieve existing subscription:', err.message);
            return res.status(400).json({ message: "Could not retrieve current subscription. Please contact support." });
          }

          const currentItemId = existingSub.items?.data?.[0]?.id;
          if (!currentItemId) {
            return res.status(400).json({ message: "Current subscription has no items. Please contact support." });
          }

          if (isUpgrade) {
            // ── UPGRADE: immediate + charge proration ────────────────────────
            let updatedSub: any;
            try {
              updatedSub = await stripe.subscriptions.update(existingSubId!, {
                items: [{ id: currentItemId, price: plan.stripePriceId }],
                proration_behavior: 'always_invoice',
                payment_behavior: 'error_if_incomplete',
                default_payment_method: selectedPaymentMethod,
                expand: ['latest_invoice.payment_intent'],
              });
            } catch (stripeErr: any) {
              console.error('[Stripe] Upgrade failed:', stripeErr.message);
              return res.status(400).json({ message: stripeErr.message || "Payment failed. Please try again or use a different card." });
            }

            const upgradeInvoice = updatedSub.latest_invoice as any;
            const upgradePI = upgradeInvoice?.payment_intent;

            if (upgradePI?.status === 'requires_action' || upgradePI?.status === 'requires_confirmation') {
              return res.json({
                requiresAction: true,
                clientSecret: upgradePI.client_secret,
                subscriptionId: updatedSub.id,
                changeType: 'upgrade',
              });
            }

            if (updatedSub.status === 'incomplete' || updatedSub.status === 'incomplete_expired') {
              return res.status(400).json({ message: "Payment failed. Please try again or use a different card." });
            }

            await storage.updateUser(userId, {
              planId: plan.id,
              pendingPlanId: null,
              pendingPlanChangeAt: null,
              pendingPlanChangeType: null,
            });

            console.log(`[Stripe] ✓ Upgrade: user=${userId}, plan=${plan.name}`);
            return res.json({ success: true, changeType: 'upgrade' });
          }

          if (isDowngrade) {
            // ── DOWNGRADE: schedule for end of cycle, no immediate charge ────
            if (user.subscriptionStatus === 'past_due') {
              return res.status(400).json({
                message: "Cannot downgrade while payment is pending. Please resolve your payment first.",
                code: "DOWNGRADE_BLOCKED_PAST_DUE",
              });
            }

            try {
              await stripe.subscriptions.update(existingSubId!, {
                items: [{ id: currentItemId, price: plan.stripePriceId }],
                proration_behavior: 'none',
              });
            } catch (stripeErr: any) {
              console.error('[Stripe] Downgrade scheduling failed:', stripeErr.message);
              return res.status(400).json({ message: stripeErr.message || "Could not schedule downgrade. Please try again." });
            }

            const periodEnd = new Date(existingSub.current_period_end * 1000);
            await storage.updateUser(userId, {
              pendingPlanId: plan.id,
              pendingPlanChangeAt: periodEnd,
              pendingPlanChangeType: 'downgrade',
            });

            console.log(`[Stripe] ✓ Downgrade scheduled: user=${userId}, plan=${plan.name}, effective=${periodEnd.toISOString()}`);
            return res.json({
              success: true,
              changeType: 'downgrade',
              pendingPlanChangeAt: periodEnd.toISOString(),
            });
          }
        }

        // ── New subscriber: create subscription ──────────────────────────────
        const trialDays = plan.hasTrial ? plan.trialDays : undefined;
        
        let subscriptionConfig: any = {
          customer: customerId,
          default_payment_method: selectedPaymentMethod,
          metadata: { userId, planId: String(plan.id) },
        };

        if (trialDays) {
          subscriptionConfig.trial_period_days = trialDays;
        }

        // Apply coupon discount if valid
        if (validatedCoupon) {
          const stripeCoupon = await stripe.coupons.create({
            ...(validatedCoupon.discountType === 'percentage' 
              ? { percent_off: validatedCoupon.discountValue }
              : { amount_off: validatedCoupon.discountValue, currency: 'brl' }),
            duration: validatedCoupon.discountDurationMonths 
              ? 'repeating' 
              : 'once',
            ...(validatedCoupon.discountDurationMonths 
              ? { duration_in_months: validatedCoupon.discountDurationMonths }
              : {}),
            metadata: { 
              internalCouponId: String(validatedCoupon.id),
              affiliateUserId: validatedCoupon.affiliateUserId || '',
            },
          });
          subscriptionConfig.coupon = stripeCoupon.id;
          subscriptionConfig.metadata.couponId = String(validatedCoupon.id);
          if (validatedCoupon.affiliateUserId) {
            subscriptionConfig.metadata.affiliateUserId = validatedCoupon.affiliateUserId;
          }
        }

        // Always use the synced stripePriceId — never create ad-hoc products/prices
        subscriptionConfig.items = [{ price: plan.stripePriceId }];

        const idempotencyKeySub = `sub_${userId}_${plan.id}_${Math.floor(Date.now() / 600000)}`;
        const subscription = await stripe.subscriptions.create(
          {
            ...subscriptionConfig,
            payment_behavior: 'error_if_incomplete',
            payment_settings: {
              payment_method_options: {
                card: {
                  request_three_d_secure: 'automatic',
                },
              },
              save_default_payment_method: 'on_subscription',
            },
            expand: ['latest_invoice.payment_intent'],
          },
          { idempotencyKey: idempotencyKeySub }
        );
        
        const subscriptionStatus = subscription.status;
        const invoice = subscription.latest_invoice as any;
        const paymentIntent = invoice?.payment_intent;
        
        if (paymentIntent?.status === 'requires_action' || paymentIntent?.status === 'requires_confirmation') {
          return res.json({ 
            requiresAction: true, 
            clientSecret: paymentIntent.client_secret,
            subscriptionId: subscription.id 
          });
        }
        
        if (subscriptionStatus === 'incomplete' || subscriptionStatus === 'incomplete_expired') {
          return res.status(400).json({ 
            message: "Payment failed. Please try again or use a different card." 
          });
        }

        // NOTE: coupon usage is recorded exclusively in the checkout.session.completed webhook
        // (processCouponUsageAndCommission) to avoid race conditions and duplicate key errors.
        // Do NOT create coupon usage here — the webhook handles it with full deduplication.

        await storage.updateUser(userId, {
          stripeSubscriptionId: subscription.id,
          planId: plan.id,
          subscriptionStatus: subscriptionStatus === 'trialing' ? 'trialing' : 'active',
          subscriptionStartDate: new Date(),
          subscriptionEndDate: subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000)
            : null,
        });

        return res.json({ success: true, subscriptionId: subscription.id });
      }

      const trialDays = plan.hasTrial ? plan.trialDays : undefined;

      let sessionConfig: any = {
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/subscription?checkout=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/subscription?checkout=cancelled`,
        subscription_data: trialDays ? { trial_period_days: trialDays } : undefined,
        metadata: { userId, planId: String(plan.id) },
      };

      // Apply coupon discount if valid
      if (validatedCoupon) {
        const stripeCoupon = await stripe.coupons.create({
          ...(validatedCoupon.discountType === 'percentage' 
            ? { percent_off: validatedCoupon.discountValue }
            : { amount_off: validatedCoupon.discountValue, currency: 'brl' }),
          duration: validatedCoupon.discountDurationMonths 
            ? 'repeating' 
            : 'once',
          ...(validatedCoupon.discountDurationMonths 
            ? { duration_in_months: validatedCoupon.discountDurationMonths }
            : {}),
          metadata: { 
            internalCouponId: String(validatedCoupon.id),
            affiliateUserId: validatedCoupon.affiliateUserId || '',
          },
        });
        
        // Add discount to checkout session
        sessionConfig.discounts = [{ coupon: stripeCoupon.id }];
        sessionConfig.metadata.couponId = String(validatedCoupon.id);
        if (validatedCoupon.affiliateUserId) {
          sessionConfig.metadata.affiliateUserId = validatedCoupon.affiliateUserId;
        }
        
        // Store validated coupon info for webhook processing
        if (!sessionConfig.subscription_data) {
          sessionConfig.subscription_data = {};
        }
        sessionConfig.subscription_data.metadata = {
          couponId: String(validatedCoupon.id),
          affiliateUserId: validatedCoupon.affiliateUserId || '',
        };
      }

      // Always use the synced stripePriceId — never create ad-hoc price_data
      sessionConfig.line_items = [{ price: plan.stripePriceId, quantity: 1 }];

      const idempotencyKeyCs = `cs_${userId}_${plan.id}_${Math.floor(Date.now() / 600000)}`;
      const session = await stripe.checkout.sessions.create(sessionConfig, { idempotencyKey: idempotencyKeyCs });
      console.log(`[Stripe] Checkout session created: ${session.id} for user ${userId} plan ${plan?.id}`);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Error creating checkout session (/api/subscription/checkout):", error?.message || error);
      const message = error?.type === 'StripeAuthenticationError'
        ? "Stripe key invalid or expired. Contact support."
        : error?.message || "Internal server error";
      res.status(500).json({ message, code: error?.code || "CHECKOUT_ERROR" });
    }
  });

  app.post("/api/subscription/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configured = await isStripeConfigured();
      if (!configured) {
        return res.status(503).json({ message: "Billing service unavailable", code: "STRIPE_NOT_CONFIGURED" });
      }

      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = await getStripeClient();
      
      const { customerId } = await ensureStripeCustomer(
        userId,
        user.email || '',
        user.stripeCustomerId,
        async (uid, data) => storage.updateUser(uid, data)
      );
      
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${req.protocol}://${req.get('host')}/subscription`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating billing portal:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  app.get("/api/support-whatsapp", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json({ whatsapp: settings?.supportWhatsapp || null });
    } catch (error) {
      console.error("Error fetching support whatsapp:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public platform config — tells frontend which platforms are available
  app.get("/api/platform-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json({ tiktokEnabled: settings?.tiktokFilterEnabled ?? true });
    } catch (error) {
      console.error("Error fetching platform config:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });



  // Helper function to extract domain from request headers
  // Checks multiple headers that reverse proxies like EasyPanel, Nginx, Traefik may use
  function extractDomainFromRequest(req: Request): string {
    // Priority order for host detection from reverse proxies
    const hostHeaders = [
      req.get("x-forwarded-host"),
      req.get("x-original-host"),
      req.get("x-real-host"),
      req.get("x-host"),
      req.get("forwarded")?.match(/host=([^;,]+)/)?.[1],
      req.get("host"),
    ];
    
    for (const header of hostHeaders) {
      if (header) {
        // Remove port if present and normalize
        const domain = header.split(":")[0].toLowerCase().replace(/^www\./, '');
        if (domain && domain !== 'localhost' && !domain.match(/^127\./)) {
          return domain;
        }
      }
    }
    
    // Fallback to host header
    return (req.get("host") || "").split(":")[0].toLowerCase().replace(/^www\./, '');
  }

  // Cloaking redirect endpoint - handles clicks from TikTok/Facebook ads
  app.get("/r/:slug", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { slug } = req.params;
    const rawHost = req.get("host") || "";
    const host = rawHost.split(":")[0]; // Remove port if present
    const userAgent = req.get("user-agent") || "";
    const ip = extractClientIP(req);
    const referer = req.get("referer") || "";
    const requestUrlR = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    console.log(`[Cloak] Incoming request - Host: ${rawHost}, Slug: ${slug}, IP: ${ip}`);
    console.log(`[Cloak] All relevant headers: ${JSON.stringify({
      host: req.get("host"),
      "x-forwarded-host": req.get("x-forwarded-host"),
      "x-original-host": req.get("x-original-host"),
      "x-real-host": req.get("x-real-host"),
      "x-host": req.get("x-host"),
      "forwarded": req.get("forwarded"),
      "x-forwarded-proto": req.get("x-forwarded-proto"),
    })}`);

    // Declare variables outside try block for error logging
    let domain: any = undefined;
    let sharedDomain: any = undefined;
    let offer: any = undefined;

    try {
      // Extract domain using the helper function that checks multiple headers
      const domainToCheck = extractDomainFromRequest(req);
      
      // Skip if this is the primary app domain (clerion.app)
      const primaryAppDomains = ["clerion.app", "www.clerion.app"];
      if (primaryAppDomains.some(d => domainToCheck === d || domainToCheck.endsWith(".replit.dev") || domainToCheck.endsWith(".kirk.replit.dev"))) {
        console.log(`[Cloak /r/:slug] Skipping - primary app domain: ${domainToCheck}`);
        return res.status(404).json({ error: "Not found", message: "This endpoint is for cloaking redirects on custom domains only." });
      }
      
      console.log(`[Cloak] Looking for domain: ${domainToCheck}`);
      
      domain = await storage.getDomainBySubdomain(domainToCheck);
      sharedDomain = undefined;
      offer = undefined;
      
      if (domain && domain.isActive && domain.isVerified) {
        // Found valid user domain, get offer by slug and domain
        offer = await storage.getOfferBySlugAndDomain(slug, domain.id);
      } else {
        // Check if it's a shared domain
        sharedDomain = await storage.getSharedDomainBySubdomain(domainToCheck);
        
        if (sharedDomain && sharedDomain.isActive && sharedDomain.isVerified) {
          // Found valid shared domain, get offer by slug and sharedDomainId
          offer = await storage.getOfferBySlugAndSharedDomain(slug, sharedDomain.id);
        } else {
          // BUG #4 FIX: In production, never fall back to a slug-only lookup when the domain
          // is inactive/invalid — that would allow offers to remain reachable even after their
          // domain is deactivated.  Only allow the loose fallback in local development.
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Cloak] DEV FALLBACK — Domain not found or invalid, trying slug-only lookup for: ${slug}`);
            offer = await storage.getOfferBySlug(slug);
            if (offer && offer.domainId) {
              domain = await storage.getDomain(offer.domainId);
            }
          } else {
            console.log(`[Cloak] Domain not found or inactive for slug ${slug} — returning 404 (production)`);
          }
        }
      }
      
      if (!offer) {
        console.log(`[Cloak] Offer not found: ${slug}`);
        return res.status(404).send("Not found");
      }

      if (!offer.isActive) {
        console.log(`[Cloak] Offer inactive: ${slug}`);
        return res.status(404).send("Not found");
      }

      let currentOwner = await storage.getUser(offer.userId);
      if (!currentOwner) {
        return res.status(404).send("Not found");
      }

      // ==========================================
      // PLAN LIMITS AND SUSPENSION CHECK
      // ==========================================
      
      // Block if subscription is not active — return 404 immediately
      const activeSubStatuses = ['active', 'trialing'];
      if (!activeSubStatuses.includes(currentOwner.subscriptionStatus ?? '')) {
        console.log(`[Cloak] User ${currentOwner.id} has inactive subscription (${currentOwner.subscriptionStatus}) — returning 404`);
        return res.status(404).send("Not found");
      }

      // Get plan limits first (needed for reset logic)
      const planForLimits = currentOwner.planId ? await storage.getPlan(currentOwner.planId) : null;
      if (!planForLimits || planForLimits.isFree) {
        // No paid plan - return 404
        console.log(`[Cloak] User ${currentOwner.id} has no active paid plan - returning 404`);
        return res.status(404).send("Not found");
      }

      // Check if monthly clicks should be reset (subscription anniversary)
      // This MUST happen BEFORE suspension check so users can be reactivated
      const nowForReset = new Date();
      let clicksUsed = currentOwner.clicksUsedThisMonth || 0;
      
      if (currentOwner.clicksResetDate && nowForReset >= currentOwner.clicksResetDate) {
        console.log(`[Cloak] User ${currentOwner.id} monthly reset triggered - resetting clicks and clearing suspension`);
        await storage.resetUserMonthlyClicks(currentOwner.id);
        // Also unsuspend the user if they were suspended due to click limits
        if (currentOwner.suspendedAt || currentOwner.gracePeriodEndsAt) {
          await storage.unsuspendUser(currentOwner.id);
        }
        // Reset local counters to reflect the database state
        clicksUsed = 0;
        // Refresh owner to get updated state
        currentOwner = await storage.getUser(offer.userId);
        if (!currentOwner) {
          return res.status(404).send("Not found");
        }
      }

      // Now check if user is suspended (after potential reset/unsuspend)
      if (currentOwner.suspendedAt) {
        console.log(`[Cloak] User ${currentOwner.id} is suspended — redirecting to /suspended`);
        return res.redirect(302, SUSPENDED_PAGE_URL);
      }

      // Grace period: expired → redirect to /suspended; active → allow clicks through
      if (currentOwner.gracePeriodEndsAt && new Date() > currentOwner.gracePeriodEndsAt) {
        console.log(`[Cloak] User ${currentOwner.id} grace period expired — redirecting to /suspended`);
        return res.redirect(302, SUSPENDED_PAGE_URL);
      }

      // Check clicks limit (only for non-unlimited plans)
      // 0–100%: normal. 100–120%: tolerance zone (log only). >120%: trigger auto-upgrade or grace.
      if (!planForLimits.isUnlimited) {
        const clicksLimit = planForLimits.maxClicks;
        const toleranceLimit = Math.ceil(clicksLimit * 1.2);

        if (clicksUsed > toleranceLimit) {
          // Above 120% — fire-and-forget overage handler (attempts auto-upgrade, then grace period)
          if (!currentOwner.gracePeriodEndsAt && !currentOwner.suspendedAt) {
            console.log(`[Cloak] User ${currentOwner.id} exceeded 120% tolerance (${clicksUsed}/${toleranceLimit}) — initiating overage handling`);
            handleClickOverage(currentOwner.id, clicksUsed, planForLimits).catch((err: any) =>
              console.error('[Cloak] handleClickOverage error:', err.message)
            );
          }
          // Clicks still proceed during grace period; blocked only when grace expires (above)
        } else if (clicksUsed > clicksLimit) {
          // 100–120% tolerance zone — log warning only, no action
          console.log(`[Cloak] User ${currentOwner.id} in tolerance zone (${clicksUsed}/${clicksLimit} — ${Math.round((clicksUsed / clicksLimit) * 100)}%)`);
        }
      }

      // Fix malformed query parameters (e.g., ?fbcl instead of fbcl due to double ??)
      // This happens when URLs are constructed incorrectly with ??param=value
      const rawQuery = req.query as Record<string, string>;
      const fixedQuery: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(rawQuery)) {
        // Remove leading ? from parameter names (URL encoding issue)
        const fixedKey = key.startsWith('?') ? key.substring(1) : key;
        fixedQuery[fixedKey] = value;
      }
      
      // Use fixed parameters (check both raw and fixed versions)
      const ttclid = fixedQuery.ttclid || rawQuery.ttclid;
      const cname = fixedQuery.cname || rawQuery.cname;
      const fbcl = fixedQuery.fbcl || rawQuery.fbcl;
      const xcode = fixedQuery.xcode || rawQuery.xcode;
      
      // TikTok UTM parameters (new format)
      const utmMedium = fixedQuery.utm_medium || rawQuery.utm_medium;
      const utmContent = fixedQuery.utm_content || rawQuery.utm_content;
      const utmCampaign = fixedQuery.utm_campaign || rawQuery.utm_campaign;
      const csite = fixedQuery.src || rawQuery.src;
      const cid = fixedQuery.cid || rawQuery.cid;
      
      let paramsValid = false;
      let failReason = "";

      // ── CENTRALIZED BOT DETECTION (/r/:slug) ─────────────────────────────
      const rateLimitResult = checkIPRateLimit(ip);
      const ipAnalysis      = await analyzeIP(ip);
      const botResult       = detectBotTraffic({
        userAgent,
        rateLimitResult,
        ipAnalysis,
        ttclid:   ttclid   ?? undefined,
        cname:    cname    ?? undefined,
        route:    '/r/:slug',
        slug,
        platform: offer.platform,
      });
      const isBotDetected = botResult.isBot;
      if (isBotDetected) failReason = botResult.primaryReason;
      // ─────────────────────────────────────────────────────────────────────

      if (offer.platform === "tiktok") {
        // ==========================================
        // TIKTOK 2 - SIMPLIFIED VALIDATION (NO JS CHALLENGE)
        // ==========================================
        const tiktokFilterEnabled = await getTiktokFilterEnabled();
        if (!tiktokFilterEnabled) {
          // TikTok filter disabled globally by admin — bypass param validation
          paramsValid = true;
          console.log(`[TikTok2] Filter DISABLED globally — bypassing param validation for offer ${offer.id}`);
        } else {
          // Required params: ttclid, utm_medium, utm_content, utm_campaign, xcode
          // Optional: src (csite) for analytics

          // Check for unresolved macros (bot detection)
          const tiktok2Macros = [
            '__CALLBACK_PARAM__',   // Click ID macro
            '__AID_NAME__',         // Ad name macro
            '__CID_NAME__',         // Campaign ID/Name macro
            '__CAMPAIGN_NAME__',    // Campaign name macro
            '__CSITE__'             // Site origin macro
          ];
          let hasUnresolvedMacro = false;
          let failedParam = "";

          for (const macro of tiktok2Macros) {
            if ((ttclid && ttclid.includes(macro)) ||
                (utmMedium && utmMedium.includes(macro)) ||
                (utmContent && utmContent.includes(macro)) ||
                (utmCampaign && utmCampaign.includes(macro)) ||
                (csite && csite.includes(macro))) {
              hasUnresolvedMacro = true;
              failedParam = `macro:${macro}`;
              break;
            }
          }

          if (hasUnresolvedMacro) {
            failReason = `unresolved_${failedParam}`;
            paramsValid = false;
          } else if (!ttclid) {
            failReason = "missing_ttclid";
            paramsValid = false;
          } else if (!utmMedium) {
            failReason = "missing_utm_medium";
            paramsValid = false;
          } else if (!utmContent) {
            failReason = "missing_utm_content";
            paramsValid = false;
          } else if (!utmCampaign) {
            failReason = "missing_utm_campaign";
            paramsValid = false;
          } else if (!xcode) {
            failReason = "missing_xcode";
            paramsValid = false;
          } else if (xcode !== offer.xcode) {
            failReason = "invalid_xcode";
            paramsValid = false;
          } else {
            paramsValid = true;
          }

          console.log(`[TikTok2] Param validation: ttclid=${!!ttclid}, utm_medium=${!!utmMedium}, utm_content=${!!utmContent}, utm_campaign=${!!utmCampaign}, src=${!!csite}, xcode=${xcode === offer.xcode ? 'match' : 'mismatch'} → ${paramsValid ? 'VALID' : failReason}`);
        }
      } else if (offer.platform === "facebook") {
        // Facebook requires: fbcl (campaign.name|campaign.id), xcode
        if (!fbcl || !xcode) {
          failReason = "missing_facebook_params";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          const parts = fbcl.split("|");
          if (parts.length < 2 || !parts[0] || !parts[1]) {
            failReason = "invalid_fbcl_format";
          } else {
            paramsValid = true;
          }
        }
      }

      // Check device filter
      const deviceType = parseUserAgent(userAgent);
      const deviceAllowed = offer.allowedDevices.includes(deviceType);

      // Check country filter
      // TikTok2: Skip geolocation check entirely (TikTok preview uses US datacenter IPs)
      // Other platforms: Check country normally
      let country = "XX";
      let countryAllowed = true;
      
      if (offer.platform !== "tiktok") {
        if (offer.allowedCountries.includes("ALL")) {
          countryAllowed = true;
        } else {
          country = await getCountryFromIP(ip);
          countryAllowed = offer.allowedCountries.includes(country) || country === 'XX';
        }
      }

      // Determine redirect type — BUG #1 FIX: include !isBotDetected in decision
      const shouldRedirectToBlack = !isBotDetected && paramsValid && deviceAllowed && countryAllowed;
      const redirectType = shouldRedirectToBlack ? "black" : "white";
      const targetUrl = shouldRedirectToBlack ? selectBlackPageUrl(offer) : offer.whitePageUrl;

      // Calculate response time before logging
      const duration = Date.now() - startTime;

      // Build full request URL for logging
      const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

      // If going to WHITE page - fire-and-forget analytics, redirect immediately
      if (!shouldRedirectToBlack) {
        const xcodeValid = xcode === offer.xcode;
        const fbclValid = !!(fbcl && fbcl.split('|').length >= 2);
        const decisionReason = computeDecisionReason('white', isBotDetected, botResult.primaryReason, paramsValid, failReason, deviceAllowed, countryAllowed, deviceType, country);
        storage.createClickLog({
          offerId: offer.id,
          userId: offer.userId,
          ipAddress: ip,
          userAgent,
          country,
          device: deviceType,
          redirectedTo: 'white',
          requestUrl,
          responseTimeMs: duration,
          hasError: false,
          allParams: {
            domainId: domain?.id || offer.domainId || null,
            platform: offer.platform,
            referer,
            ttclid: ttclid || null,
            fbcl: fbcl || null,
            campaignName: offer.platform === "tiktok" ? cname : (fbcl?.split("|")[0] || null),
            campaignId: offer.platform === "facebook" ? (fbcl?.split("|")[1] || null) : null,
            adname: offer.platform === "tiktok" ? (fixedQuery.adname || rawQuery.adname || null) : null,
            adset: offer.platform === "tiktok" ? (fixedQuery.adset || rawQuery.adset || null) : null,
            failReason: failReason || decisionReason,
            decisionReason,
            finalDecision: 'white',
            isBotDetected,
            botReasons: botResult.reasons,
            botConfidence: botResult.confidence,
            paramsValid,
            xcodeValid,
            fbclValid,
            deviceAllowed,
            countryAllowed,
            isDatacenter: ipAnalysis.isDatacenter,
            isProxy: ipAnalysis.isProxy,
            isCorporateProxy: ipAnalysis.isCorporateProxy,
            route: '/r/:slug',
          },
        }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
        storage.incrementOfferClicks(offer.id, false)
          .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
        console.log(
          `[Cloak] WHITE redirect for ${slug} (${duration}ms)` +
          ` | ip=${ip}` +
          ` | country=${country}` +
          ` | device=${deviceType}` +
          ` | ua="${userAgent.substring(0, 80)}"` +
          ` | paramsValid=${paramsValid}` +
          ` | xcodeValid=${xcodeValid}` +
          ` | fbclValid=${fbclValid}` +
          ` | countryAllowed=${countryAllowed}` +
          ` | deviceAllowed=${deviceAllowed}` +
          ` | isBotDetected=${isBotDetected}` +
          ` | botReasons=[${botResult.reasons.join('|')}]` +
          ` | confidence=${botResult.confidence}` +
          ` | corporate=${ipAnalysis.isCorporateProxy}` +
          ` | decisionReason=${decisionReason}` +
          ` | target=${targetUrl.substring(0, 60)}`
        );
        return res.redirect(302, targetUrl);
      }

      // ==========================================
      // TIKTOK 2 - BAIT PAGE WITH BOT TRAPS
      // ==========================================
      if (offer.platform === "tiktok") {
        // TikTok 2 serves a bait page that looks innocent to bots
        // Real users are redirected to BLACK after ~400ms
        // Bots that interact or don't run JS are sent to WHITE
        
        const baitToken = generateChallengeToken();
        const whiteUrl = offer.whitePageUrl.startsWith('http') ? offer.whitePageUrl : `https://${offer.whitePageUrl}`;
        
        const baitStored = await createTikTok2Token(baitToken, {
          offerId: offer.id,
          slug,
          blackUrl: targetUrl,
          whiteUrl,
          ip,
          userAgent,
          createdAt: Date.now(),
          queryParams: req.query as Record<string, any>,
          userId: offer.userId,
          country,
          device: deviceType,
          requestUrl,
          referer,
          ttclid: ttclid || null,
          adname: fixedQuery.adname || rawQuery.adname || null,
          adset: fixedQuery.adset || rawQuery.adset || null,
          cname: cname || null,
          xcode: xcode || null,
          domainId: domain?.id || offer.domainId || null,
        });
        
        if (!baitStored) {
          // Redis unavailable — safe fallback: serve white page immediately
          console.error(`[Cloak] Cannot store TikTok2 bait token (Redis unavailable) — redirecting to white page`);
          return res.redirect(302, whiteUrl);
        }
        
        console.log(`[TikTok2] Serving bait page for ${slug} (${duration}ms) - Token: ${baitToken.substring(0, 16)}...`);
        
        // Build base URL for verification redirects (important for custom domains)
        // Safe protocol fallback: X-Forwarded-Proto (for proxies) > req.protocol > secure detection > http
        const proto = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
        const hostHeader = req.get('x-forwarded-host') || req.get('host') || '';
        const baseUrl = hostHeader ? `${proto}://${hostHeader}` : '';
        
        console.log(`[TikTok2] Using baseUrl: ${baseUrl} for verification redirects`);
        
        const baitHTML = generateTikTok2BaitHTML(baitToken, whiteUrl, baseUrl);
        res.set('Content-Type', 'text/html');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        return res.send(baitHTML);
      }

      // ==========================================
      // FACEBOOK - DIRECT REDIRECT (NO CHALLENGE)
      // ==========================================
      // Facebook uses simple validation: params + filters → direct redirect
      // No JavaScript challenge needed - just redirect immediately
      if (offer.platform === "facebook") {
        // Append UTM parameters to black page URL
        const finalUrl = appendUTMParams(targetUrl, req.query as Record<string, any>);
        // Fire-and-forget analytics — redirect goes first
        storage.createClickLog({
          offerId: offer.id,
          userId: offer.userId,
          ipAddress: ip,
          userAgent,
          country,
          device: deviceType,
          redirectedTo: 'black',
          requestUrl,
          responseTimeMs: duration,
          hasError: false,
          allParams: {
            domainId: domain?.id || offer.domainId || null,
            platform: offer.platform,
            referer,
            fbcl: fbcl || null,
            campaignName: fbcl?.split("|")[0] || null,
            campaignId: fbcl?.split("|")[1] || null,
            xcode: xcode || null,
            decisionReason: 'valid_traffic',
            finalDecision: 'black',
            isBotDetected: false,
            botReasons: [],
            botConfidence: botResult.confidence,
            paramsValid: true,
            xcodeValid: true,
            fbclValid: true,
            deviceAllowed: true,
            countryAllowed: true,
            isDatacenter: ipAnalysis.isDatacenter,
            isProxy: ipAnalysis.isProxy,
            isCorporateProxy: ipAnalysis.isCorporateProxy,
            route: '/r/:slug',
          },
        }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
        storage.incrementOfferClicks(offer.id, true)
          .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
        console.log(`[Facebook] BLACK redirect for ${slug} (${duration}ms) - Direct redirect to: ${finalUrl}`);
        // Direct 302 redirect - no intermediate page
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.redirect(302, finalUrl);
      }

      // For BLACK page candidates (TikTok only - uses JavaScript challenge)
      // The click will be logged AFTER the JavaScript challenge is completed
      console.log(`[Cloak] BLACK candidate for ${slug} (${duration}ms) - serving JavaScript challenge`);

      // ==========================================
      // JAVASCRIPT CHALLENGE FOR BLACK PAGE ACCESS (TikTok only)
      // ==========================================
      // TikTok (not TikTok2) uses a JavaScript challenge page
      // that verifies the visitor is a real human with a real browser
      
      // Generate challenge token and store challenge data in Redis (TTL: 30s)
      const challengeToken = generateChallengeToken();
      const honeypotId = `hp_${randomBytes(4).toString('hex')}`;
      
      const challengeStored = await createChallengeToken(challengeToken, {
        offerId: offer.id,
        slug,
        targetUrl,
        redirectType: 'black',
        ip,
        userAgent,
        createdAt: Date.now(),
        queryParams: req.query as Record<string, any>,
        honeypotTriggered: false,
        verifiedAt: null,
        verifiedScore: null,
        verificationNonce: null,
        userId: offer.userId,
        country,
        device: deviceType,
        requestUrl,
        platform: offer.platform,
        referer,
        ttclid: ttclid || null,
        fbcl: fbcl || null,
        cname: cname || null,
      });
      
      if (!challengeStored) {
        // Redis unavailable — safe fallback: serve white page immediately
        console.error(`[Cloak] Cannot store challenge token (Redis unavailable) — redirecting to white page`);
        const safeWhiteUrl = offer.whitePageUrl.startsWith('http') ? offer.whitePageUrl : `https://${offer.whitePageUrl}`;
        return res.redirect(302, safeWhiteUrl);
      }
      
      console.log(`[Cloak] Serving JavaScript challenge for ${slug} - Token: ${challengeToken.substring(0, 16)}...`);
      
      // Build base URL for challenge verification redirects (important for custom domains)
      // Safe protocol fallback: X-Forwarded-Proto (for proxies) > req.protocol > secure detection > http
      const proto = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
      const hostHeader = req.get('x-forwarded-host') || req.get('host') || '';
      const baseUrl = hostHeader ? `${proto}://${hostHeader}` : '';
      
      console.log(`[Cloak] Using baseUrl: ${baseUrl} for challenge redirects`);
      
      // Serve the challenge HTML page
      res.set('Content-Type', 'text/html');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(generateChallengeHTML(challengeToken, honeypotId, baseUrl));
    } catch (error: any) {
      console.error("[Cloak] Error:", error);
      // Try to log the error click if we have offer info
      try {
        if (offer) {
          const duration = Date.now() - startTime;
          await storage.createClickLog({
            offerId: offer.id,
            userId: offer.userId,
            ipAddress: ip,
            userAgent,
            country: 'XX',
            device: parseUserAgent(userAgent),
            redirectedTo: 'error',
            requestUrl: requestUrlR,
            responseTimeMs: duration,
            hasError: true,
            allParams: {
              domainId: domain?.id || sharedDomain?.id || null,
              platform: offer.platform,
              referer,
              failReason: `error:${error?.message || String(error)}`,
              errorDetails: error?.message || String(error),
            },
          });
          console.log(`[Cloak] ERROR logged for ${slug}: ${error?.message}`);
        }
      } catch (logError) {
        console.error(`[Cloak] CRITICAL: Failed to log error click:`, logError);
      }
      return res.status(500).send("Internal server error");
    }
  });

  // Alternative cloaking route without /r/ prefix - for cleaner URLs
  // This catches /:slug patterns on custom domains and shared domains
  app.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
    const { slug } = req.params;
    
    console.log(`[CLOAK /:slug] Received request for slug: ${slug}`);
    
    // Skip known routes and static files
    const skipPaths = [
      "api", "assets", "src", "@", "node_modules", "favicon.ico", "robots.txt", "images",
      "domains", "offers", "logs", "analytics", "subscription", "settings", "confg-admin", "reset-password"
    ];
    if (skipPaths.some(p => slug === p || slug.startsWith(p + "/")) || slug.includes(".")) {
      console.log(`[CLOAK /:slug] Skipping - matches skip pattern`);
      return next();
    }
    
    // Use the same helper function to extract domain from request headers
    const domainToCheck = extractDomainFromRequest(req);
    
    // Skip if this is the primary app domain (clerion.app)
    const primaryAppDomains = ["clerion.app", "www.clerion.app"];
    if (primaryAppDomains.some(d => domainToCheck === d || domainToCheck.endsWith(".replit.dev") || domainToCheck.endsWith(".kirk.replit.dev"))) {
      console.log(`[CLOAK /:slug] Skipping - primary app domain: ${domainToCheck}`);
      return next();
    }
    
    console.log(`[CLOAK /:slug] Host check - domainToCheck: ${domainToCheck}`);
    console.log(`[CLOAK /:slug] All relevant headers: ${JSON.stringify({
      host: req.get("host"),
      "x-forwarded-host": req.get("x-forwarded-host"),
      "x-original-host": req.get("x-original-host"),
      "x-real-host": req.get("x-real-host"),
      "x-host": req.get("x-host"),
      "forwarded": req.get("forwarded"),
    })}`);
    
    let offer: any = undefined;
    let isSharedDomain = false;
    
    // First, check if it's a user-owned domain
    const domain = await storage.getDomainBySubdomain(domainToCheck);
    console.log(`[CLOAK /:slug] User domain lookup result:`, domain ? { id: domain.id, subdomain: domain.subdomain, isActive: domain.isActive, isVerified: domain.isVerified } : null);
    
    if (domain && domain.isActive && domain.isVerified) {
      // Found valid user domain, get offer by slug and domain
      offer = await storage.getOfferBySlugAndDomain(slug, domain.id);
      console.log(`[CLOAK /:slug] User domain offer lookup result:`, offer ? { id: offer.id, slug: offer.slug, domainId: offer.domainId } : null);
    } else {
      // Check if it's a shared domain
      const sharedDomain = await storage.getSharedDomainBySubdomain(domainToCheck);
      console.log(`[CLOAK /:slug] Shared domain lookup result:`, sharedDomain ? { id: sharedDomain.id, subdomain: sharedDomain.subdomain, isActive: sharedDomain.isActive, isVerified: sharedDomain.isVerified } : null);
      
      if (sharedDomain && sharedDomain.isActive && sharedDomain.isVerified) {
        // Found valid shared domain, get offer by slug and sharedDomainId
        offer = await storage.getOfferBySlugAndSharedDomain(slug, sharedDomain.id);
        isSharedDomain = true;
        console.log(`[CLOAK /:slug] Shared domain offer lookup result:`, offer ? { id: offer.id, slug: offer.slug, sharedDomainId: offer.sharedDomainId } : null);
      }
    }
    
    if (!offer) {
      console.log(`[CLOAK /:slug] Offer not found for slug ${slug} on domain ${domainToCheck} - passing to next()`);
      return next(); // Not a valid offer slug
    }
    
    console.log(`[CLOAK /:slug] Processing cloaking for offer: ${offer.slug} (isSharedDomain: ${isSharedDomain})`);
    
    // Forward to the main cloaking handler by rewriting the URL
    req.url = `/r/${slug}`;
    req.params.slug = slug;
    
    // Manually trigger the /r/:slug handler logic
    const startTime = Date.now();
    const userAgent = req.get("user-agent") || "";
    const ip = extractClientIP(req);
    const referer = req.get("referer") || "";
    const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    // Helper to log error clicks - ensures NO click is ever lost
    const logErrorClick = async (errorMsg: string) => {
      try {
        const duration = Date.now() - startTime;
        await storage.createClickLog({
          offerId: offer.id,
          userId: offer.userId,
          ipAddress: ip,
          userAgent,
          country: 'XX',
          device: parseUserAgent(userAgent),
          redirectedTo: 'error',
          requestUrl,
          responseTimeMs: duration,
          hasError: true,
          allParams: {
            domainId: domain?.id || offer.domainId || null,
            platform: offer.platform,
            referer,
            failReason: `error:${errorMsg}`,
            errorDetails: errorMsg,
          },
        });
        console.log(`[Cloak] ERROR logged for ${slug}: ${errorMsg}`);
      } catch (logError) {
        console.error(`[Cloak] CRITICAL: Failed to log error click:`, logError);
      }
    };

    try {
      if (!offer.isActive) {
        console.log(`[Cloak] Offer inactive: ${slug}`);
        return res.status(404).send("Not found");
      }

      const owner = await storage.getUser(offer.userId);
      if (!owner) {
        return res.status(404).send("Not found");
      }

      const isSuspended = owner.suspendedAt !== null;
      const graceExpired = owner.gracePeriodEndsAt !== null && new Date() > owner.gracePeriodEndsAt;
      if (isSuspended || graceExpired) {
        console.log(`[Cloak /:slug] User ${offer.userId} is suspended — redirecting to /suspended`);
        return res.redirect(302, SUSPENDED_PAGE_URL);
      }

      // Block if subscription is not active — return 404 immediately
      const activeSubscriptionStatuses = ['active', 'trialing'];
      if (!activeSubscriptionStatuses.includes(owner.subscriptionStatus ?? '')) {
        console.log(`[Cloak] User ${offer.userId} has inactive subscription (${owner.subscriptionStatus}) — returning 404`);
        return res.status(404).send("Not found");
      }

      // Check click limits
      const plan = owner.planId ? await storage.getPlan(owner.planId) : null;
      if (!plan || plan.isFree) {
        console.log(`[Cloak] User ${offer.userId} has no paid plan — returning 404`);
        return res.status(404).send("Not found");
      }

      if (!plan.isUnlimited) {
        const clicksUsedSlug = owner.clicksUsedThisMonth || 0;
        const clicksLimitSlug = plan.maxClicks;
        const toleranceLimitSlug = Math.ceil(clicksLimitSlug * 1.2);

        if (clicksUsedSlug > toleranceLimitSlug) {
          // Above 120% — fire-and-forget overage handler
          if (!owner.gracePeriodEndsAt && !owner.suspendedAt) {
            console.log(`[Cloak /:slug] User ${offer.userId} exceeded 120% tolerance (${clicksUsedSlug}/${toleranceLimitSlug}) — initiating overage handling`);
            handleClickOverage(owner.id, clicksUsedSlug, plan).catch((err: any) =>
              console.error('[Cloak /:slug] handleClickOverage error:', err.message)
            );
          }
        } else if (clicksUsedSlug > clicksLimitSlug) {
          // 100–120% tolerance zone — log only
          console.log(`[Cloak /:slug] User ${offer.userId} in tolerance zone (${clicksUsedSlug}/${clicksLimitSlug})`);
        }
      }

      // Fix malformed query parameters (e.g., ?fbcl instead of fbcl due to double ??)
      const rawQuery2 = req.query as Record<string, string>;
      const fixedQuery2: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(rawQuery2)) {
        const fixedKey = key.startsWith('?') ? key.substring(1) : key;
        fixedQuery2[fixedKey] = value;
      }
      
      const ttclid = fixedQuery2.ttclid || rawQuery2.ttclid;
      const cname = fixedQuery2.cname || rawQuery2.cname;
      const fbcl = fixedQuery2.fbcl || rawQuery2.fbcl;
      const xcode = fixedQuery2.xcode || rawQuery2.xcode;
      
      // TikTok UTM parameters (new format)
      const utmMedium2 = fixedQuery2.utm_medium || rawQuery2.utm_medium;
      const utmContent2 = fixedQuery2.utm_content || rawQuery2.utm_content;
      const utmCampaign2 = fixedQuery2.utm_campaign || rawQuery2.utm_campaign;
      const csite2 = fixedQuery2.src || rawQuery2.src;
      const cid2 = fixedQuery2.cid || rawQuery2.cid;
      
      let paramsValid = false;
      let failReason = "";

      // ── CENTRALIZED BOT DETECTION (/:slug) ───────────────────────────────
      const rateLimitResult2 = checkIPRateLimit(ip);
      const ipAnalysis2      = await analyzeIP(ip);
      const ttclid2ForMacro  = fixedQuery2.ttclid || rawQuery2.ttclid;
      const cname2ForMacro   = fixedQuery2.cname  || rawQuery2.cname;
      const botResult2       = detectBotTraffic({
        userAgent,
        rateLimitResult: rateLimitResult2,
        ipAnalysis:      ipAnalysis2,
        ttclid:  ttclid2ForMacro ?? undefined,
        cname:   cname2ForMacro  ?? undefined,
        route:   '/:slug',
        slug,
        platform: offer.platform,
      });
      const isBotDetected2 = botResult2.isBot;
      if (isBotDetected2) failReason = botResult2.primaryReason;
      // ─────────────────────────────────────────────────────────────────────

      if (offer.platform === "tiktok" && !isBotDetected2) {
        // ==========================================
        // TIKTOK 2 - SIMPLIFIED VALIDATION (NO JS CHALLENGE)
        // ==========================================
        const tiktokFilterEnabled2 = await getTiktokFilterEnabled();
        if (!tiktokFilterEnabled2) {
          // TikTok filter disabled globally by admin — bypass param validation
          paramsValid = true;
          console.log(`[TikTok2] Filter DISABLED globally — bypassing param validation for offer ${offer.id}`);
        } else {
          // Required params: ttclid, utm_medium, utm_content, utm_campaign, xcode
          // Optional: src (csite) for analytics

          // Check for unresolved macros (bot detection)
          const tiktok2Macros = [
            '__CALLBACK_PARAM__',
            '__AID_NAME__',
            '__CID_NAME__',
            '__CAMPAIGN_NAME__',
            '__CSITE__'
          ];
          let hasUnresolvedMacro = false;
          let failedParam = "";

          for (const macro of tiktok2Macros) {
            if ((ttclid && ttclid.includes(macro)) ||
                (utmMedium2 && utmMedium2.includes(macro)) ||
                (utmContent2 && utmContent2.includes(macro)) ||
                (utmCampaign2 && utmCampaign2.includes(macro)) ||
                (csite2 && csite2.includes(macro))) {
              hasUnresolvedMacro = true;
              failedParam = `macro:${macro}`;
              break;
            }
          }

          if (hasUnresolvedMacro) {
            failReason = `unresolved_${failedParam}`;
          } else if (!ttclid) {
            failReason = "missing_ttclid";
          } else if (!utmMedium2) {
            failReason = "missing_utm_medium";
          } else if (!utmContent2) {
            failReason = "missing_utm_content";
          } else if (!utmCampaign2) {
            failReason = "missing_utm_campaign";
          } else if (!xcode) {
            failReason = "missing_xcode";
          } else if (xcode !== offer.xcode) {
            failReason = "invalid_xcode";
          } else {
            paramsValid = true;
          }

          console.log(`[TikTok2] Param validation: ttclid=${!!ttclid}, utm_medium=${!!utmMedium2}, utm_content=${!!utmContent2}, utm_campaign=${!!utmCampaign2}, src=${!!csite2}, xcode=${xcode === offer.xcode ? 'match' : 'mismatch'} → ${paramsValid ? 'VALID' : failReason}`);
        }
      } else if (offer.platform === "facebook" && !isBotDetected2) {
        if (!fbcl || !xcode) {
          failReason = "missing_facebook_params";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          const parts = fbcl.split("|");
          if (parts.length < 2 || !parts[0] || !parts[1]) {
            failReason = "invalid_fbcl_format";
          } else {
            paramsValid = true;
          }
        }
      }

      const deviceType = parseUserAgent(userAgent);
      const deviceAllowed = offer.allowedDevices.includes(deviceType);
      
      // TikTok2: Skip geolocation check entirely (TikTok preview uses US datacenter IPs)
      // Other platforms: Check country normally
      let country = "XX";
      let countryAllowed = true;
      
      if (offer.platform !== "tiktok") {
        if (offer.allowedCountries.includes("ALL")) {
          countryAllowed = true;
        } else {
          country = await getCountryFromIP(ip);
          countryAllowed = offer.allowedCountries.includes(country) || country === 'XX';
        }
      }

      // Bot detected = always go to WHITE
      const shouldRedirectToBlack = !isBotDetected2 && paramsValid && deviceAllowed && countryAllowed;
      const redirectType = shouldRedirectToBlack ? "black" : "white";
      const targetUrl = shouldRedirectToBlack ? selectBlackPageUrl(offer) : offer.whitePageUrl;

      // Calculate response time before logging
      const duration = Date.now() - startTime;

      // Build full request URL for logging
      const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

      // If going to WHITE page - fire-and-forget analytics, redirect immediately
      if (!shouldRedirectToBlack) {
        const xcodeValid2 = xcode === offer.xcode;
        const fbclValid2 = !!(fbcl && fbcl.split('|').length >= 2);
        const decisionReason2 = computeDecisionReason('white', isBotDetected2, botResult2.primaryReason, paramsValid, failReason, deviceAllowed, countryAllowed, deviceType, country);
        storage.createClickLog({
          offerId: offer.id,
          userId: offer.userId,
          ipAddress: ip,
          userAgent,
          country,
          device: deviceType,
          redirectedTo: 'white',
          requestUrl,
          responseTimeMs: duration,
          hasError: false,
          allParams: {
            domainId: domain?.id || offer.domainId || null,
            platform: offer.platform,
            referer,
            ttclid: ttclid || null,
            fbcl: fbcl || null,
            campaignName: offer.platform === "tiktok" ? cname : (fbcl?.split("|")[0] || null),
            campaignId: offer.platform === "facebook" ? (fbcl?.split("|")[1] || null) : null,
            adname: offer.platform === "tiktok" ? (fixedQuery2.adname || rawQuery2.adname || null) : null,
            adset: offer.platform === "tiktok" ? (fixedQuery2.adset || rawQuery2.adset || null) : null,
            failReason: failReason || decisionReason2,
            decisionReason: decisionReason2,
            finalDecision: 'white',
            isBotDetected: isBotDetected2,
            botReasons: botResult2.reasons,
            botConfidence: botResult2.confidence,
            paramsValid,
            xcodeValid: xcodeValid2,
            fbclValid: fbclValid2,
            deviceAllowed,
            countryAllowed,
            isDatacenter: ipAnalysis2.isDatacenter,
            isProxy: ipAnalysis2.isProxy,
            isCorporateProxy: ipAnalysis2.isCorporateProxy,
            route: '/:slug',
          },
        }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
        storage.incrementOfferClicks(offer.id, false)
          .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
        console.log(
          `[Cloak] WHITE redirect for ${slug} (${duration}ms)` +
          ` | ip=${ip}` +
          ` | country=${country}` +
          ` | device=${deviceType}` +
          ` | ua="${userAgent.substring(0, 80)}"` +
          ` | paramsValid=${paramsValid}` +
          ` | xcodeValid=${xcodeValid2}` +
          ` | fbclValid=${fbclValid2}` +
          ` | countryAllowed=${countryAllowed}` +
          ` | deviceAllowed=${deviceAllowed}` +
          ` | isBotDetected=${isBotDetected2}` +
          ` | botReasons=[${botResult2.reasons.join('|')}]` +
          ` | confidence=${botResult2.confidence}` +
          ` | corporate=${ipAnalysis2.isCorporateProxy}` +
          ` | decisionReason=${decisionReason2}` +
          ` | target=${targetUrl.substring(0, 60)}`
        );
        return res.redirect(302, targetUrl);
      }

      // ==========================================
      // TIKTOK 2 - BAIT PAGE WITH BOT TRAPS
      // ==========================================
      if (offer.platform === "tiktok") {
        const adname2 = fixedQuery2.adname || rawQuery2.adname;
        const adset2 = fixedQuery2.adset || rawQuery2.adset;
        
        const baitToken = generateChallengeToken();
        const whiteUrl = offer.whitePageUrl.startsWith('http') ? offer.whitePageUrl : `https://${offer.whitePageUrl}`;
        
        const baitStored2 = await createTikTok2Token(baitToken, {
          offerId: offer.id,
          slug,
          blackUrl: targetUrl,
          whiteUrl,
          ip,
          userAgent,
          createdAt: Date.now(),
          queryParams: req.query as Record<string, any>,
          userId: offer.userId,
          country,
          device: deviceType,
          requestUrl,
          referer,
          ttclid: ttclid || null,
          adname: adname2 || null,
          adset: adset2 || null,
          cname: cname || null,
          xcode: xcode || null,
          domainId: domain?.id || offer.domainId || null,
        });
        
        if (!baitStored2) {
          console.error(`[Cloak] Cannot store TikTok2 bait token (Redis unavailable) — redirecting to white page`);
          return res.redirect(302, whiteUrl);
        }
        
        console.log(`[TikTok2] Serving bait page for ${slug} (${duration}ms) - Token: ${baitToken.substring(0, 16)}...`);
        
        // Build base URL for verification redirects (important for custom domains)
        // Safe protocol fallback: X-Forwarded-Proto (for proxies) > req.protocol > secure detection > http
        const proto = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
        const hostHeader = req.get('x-forwarded-host') || req.get('host') || '';
        const baseUrl = hostHeader ? `${proto}://${hostHeader}` : '';
        
        console.log(`[TikTok2] Using baseUrl: ${baseUrl} for verification redirects`);
        
        const baitHTML = generateTikTok2BaitHTML(baitToken, whiteUrl, baseUrl);
        res.set('Content-Type', 'text/html');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        return res.send(baitHTML);
      }

      // ==========================================
      // FACEBOOK - DIRECT REDIRECT (NO CHALLENGE)
      // ==========================================
      // Facebook uses simple validation: params + filters → direct redirect
      // No JavaScript challenge needed - just redirect immediately
      if (offer.platform === "facebook") {
        // Append UTM parameters to black page URL
        const finalUrl = appendUTMParams(targetUrl, req.query as Record<string, any>);
        // Fire-and-forget analytics — redirect goes first
        storage.createClickLog({
          offerId: offer.id,
          userId: offer.userId,
          ipAddress: ip,
          userAgent,
          country,
          device: deviceType,
          redirectedTo: 'black',
          requestUrl,
          responseTimeMs: duration,
          hasError: false,
          allParams: {
            domainId: domain?.id || offer.domainId || null,
            platform: offer.platform,
            referer,
            fbcl: fbcl || null,
            campaignName: fbcl?.split("|")[0] || null,
            campaignId: fbcl?.split("|")[1] || null,
            xcode: xcode || null,
            decisionReason: 'valid_traffic',
            finalDecision: 'black',
            isBotDetected: false,
            botReasons: [],
            botConfidence: botResult2.confidence,
            paramsValid: true,
            xcodeValid: true,
            fbclValid: true,
            deviceAllowed: true,
            countryAllowed: true,
            isDatacenter: ipAnalysis2.isDatacenter,
            isProxy: ipAnalysis2.isProxy,
            isCorporateProxy: ipAnalysis2.isCorporateProxy,
            route: '/:slug',
          },
        }).catch(err => console.error('[Analytics] createClickLog failed:', err.message));
        storage.incrementOfferClicks(offer.id, true)
          .catch(err => console.error('[Analytics] incrementOfferClicks failed:', err.message));
        console.log(`[Facebook] BLACK redirect for ${slug} (${duration}ms) - Direct redirect to: ${finalUrl}`);
        // Direct 302 redirect - no intermediate page
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.redirect(302, finalUrl);
      }

      // For BLACK page candidates (TikTok only - uses JavaScript challenge)
      // The click will be logged AFTER the JavaScript challenge is completed
      console.log(`[Cloak] BLACK candidate for ${slug} (${duration}ms) - serving JavaScript challenge`);

      // ==========================================
      // JAVASCRIPT CHALLENGE FOR BLACK PAGE ACCESS (TikTok only)
      // ==========================================
      const challengeToken = generateChallengeToken();
      const honeypotId = `hp_${randomBytes(4).toString('hex')}`;
      
      const challengeStored2 = await createChallengeToken(challengeToken, {
        offerId: offer.id,
        slug,
        targetUrl,
        redirectType: 'black',
        ip,
        userAgent,
        createdAt: Date.now(),
        queryParams: req.query as Record<string, any>,
        honeypotTriggered: false,
        verifiedAt: null,
        verifiedScore: null,
        verificationNonce: null,
        userId: offer.userId,
        country,
        device: deviceType,
        requestUrl,
        platform: offer.platform,
        referer,
        ttclid: ttclid || null,
        fbcl: fbcl || null,
        cname: cname || null,
      });
      
      if (!challengeStored2) {
        console.error(`[Cloak] Cannot store challenge token (Redis unavailable) — redirecting to white page`);
        const safeWhiteUrl2 = offer.whitePageUrl.startsWith('http') ? offer.whitePageUrl : `https://${offer.whitePageUrl}`;
        return res.redirect(302, safeWhiteUrl2);
      }
      
      console.log(`[Cloak] Serving JavaScript challenge for ${slug} - Token: ${challengeToken.substring(0, 16)}...`);
      
      // Build base URL for challenge verification redirects (important for custom domains)
      // Safe protocol fallback: X-Forwarded-Proto (for proxies) > req.protocol > secure detection > http
      const challengeProto = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
      const challengeHost = req.get('x-forwarded-host') || req.get('host') || '';
      const challengeBaseUrl = challengeHost ? `${challengeProto}://${challengeHost}` : '';
      
      console.log(`[Cloak] Using baseUrl: ${challengeBaseUrl} for challenge redirects`);
      
      res.set('Content-Type', 'text/html');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(generateChallengeHTML(challengeToken, honeypotId, challengeBaseUrl));
    } catch (error: any) {
      console.error("[Cloak] Error:", error);
      // Log the click with error status - NO CLICKS LOST
      await logErrorClick(error?.message || String(error));
      return res.status(500).send("Internal server error");
    }
  });

  // Auto-seed email templates on startup
  await seedDefaultEmailTemplates();

  return httpServer;
}
