import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { randomBytes, createHash } from "crypto";
import { getStripeClient, getStripePublishableKey, isStripeConfigured, ensureStripeCustomer } from "./stripeClient";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { tiktok2Telemetry } from "@shared/schema";
import { promises as dns } from "dns";

// ==========================================
// ANTI-BOT CHALLENGE SYSTEM
// ==========================================

interface ChallengeData {
  offerId: number;
  slug: string;
  targetUrl: string;
  redirectType: 'black' | 'white';
  ip: string;
  userAgent: string;
  createdAt: number;
  queryParams: Record<string, any>;
  honeypotTriggered: boolean;
  // Server-side verification data
  verifiedAt: number | null;
  verifiedScore: number | null;
  verificationNonce: string | null;
  // Additional data for logging after challenge
  userId: string;
  country: string;
  device: 'smartphone' | 'tablet' | 'desktop';
  requestUrl: string;
  platform: string;
  referer: string;
  ttclid: string | null;
  fbcl: string | null;
  cname: string | null;
}

// Store challenge tokens (in production, use Redis for distributed systems)
const challengeTokens = new Map<string, ChallengeData>();
const CHALLENGE_EXPIRY_MS = 30000; // 30 seconds to complete challenge
const MIN_HUMAN_TIME_MS = 800; // Minimum 800ms for human interaction

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of challengeTokens.entries()) {
    if (now - data.createdAt > CHALLENGE_EXPIRY_MS * 2) {
      challengeTokens.delete(token);
    }
  }
}, 60000);

function generateChallengeToken(): string {
  return randomBytes(32).toString('hex');
}

// ==========================================
// TIKTOK 2 BAIT PAGE SYSTEM
// ==========================================

interface TikTok2BaitData {
  offerId: number;
  slug: string;
  blackUrl: string;
  whiteUrl: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  queryParams: Record<string, any>;
  userId: string;
  country: string;
  device: 'smartphone' | 'tablet' | 'desktop';
  requestUrl: string;
  referer: string;
  ttclid: string | null;
  adname: string | null;
  adset: string | null;
  cname: string | null;
  xcode: string | null;
  domainId: number | null;
}

const tiktok2BaitTokens = new Map<string, TikTok2BaitData>();
const TIKTOK2_BAIT_EXPIRY_MS = 15000; // 15 seconds to complete

// Clean up expired TikTok2 bait tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tiktok2BaitTokens.entries()) {
    if (now - data.createdAt > TIKTOK2_BAIT_EXPIRY_MS * 2) {
      tiktok2BaitTokens.delete(token);
    }
  }
}, 60000);

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
      
      // Calculate score
      if (${varNames.checks}.hasWindow && ${varNames.checks}.hasDocument && ${varNames.checks}.hasNavigator) ${varNames.score} += 10;
      if (!${varNames.checks}.webdriver) ${varNames.score} += 15;
      if (!${varNames.checks}.headless) ${varNames.score} += 15;
      if (!${varNames.checks}.phantom && !${varNames.checks}.nightmare) ${varNames.score} += 10;
      if (!${varNames.checks}.selenium && !${varNames.checks}.seleniumIDE) ${varNames.score} += 10;
      if (!${varNames.checks}.domAutomation && !${varNames.checks}.cdc) ${varNames.score} += 10;
      if (${varNames.checks}.canvas) ${varNames.score} += 10;
      if (${varNames.checks}.webgl && !${varNames.checks}.swiftShader) ${varNames.score} += 10;
      if (${varNames.checks}.audio) ${varNames.score} += 5;
      if (${varNames.checks}.screenOk && ${varNames.checks}.outerOk) ${varNames.score} += 5;
      
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

async function verifyDomainDNS(subdomain: string): Promise<{ verified: boolean; error?: string }> {
  console.log(`[DNS] Verifying domain: ${subdomain}`);
  
  // First try CNAME
  try {
    const cnameRecords = await dns.resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      console.log(`[DNS] CNAME found for ${subdomain}:`, cnameRecords);
      return { verified: true };
    }
  } catch (error: any) {
    console.log(`[DNS] CNAME lookup for ${subdomain} failed:`, error.code, error.message);
    // Continue to try A record
  }
  
  // Try A record (some users configure A instead of CNAME)
  try {
    const aRecords = await dns.resolve4(subdomain);
    if (aRecords && aRecords.length > 0) {
      console.log(`[DNS] A record found for ${subdomain}:`, aRecords);
      return { verified: true };
    }
  } catch (error: any) {
    console.log(`[DNS] A record lookup for ${subdomain} failed:`, error.code, error.message);
  }
  
  // Try to resolve any record to check if domain exists
  try {
    const anyRecords = await dns.resolve(subdomain);
    if (anyRecords && anyRecords.length > 0) {
      console.log(`[DNS] Other records found for ${subdomain}:`, anyRecords);
      return { verified: true };
    }
  } catch (error: any) {
    console.log(`[DNS] General lookup for ${subdomain} failed:`, error.code, error.message);
    
    if (error.code === "ENODATA") {
      return { verified: false, error: "No DNS records configured for this domain" };
    }
    if (error.code === "ENOTFOUND") {
      return { verified: false, error: "Domain not found - DNS not configured or not propagated yet" };
    }
    if (error.code === "SERVFAIL") {
      return { verified: false, error: "DNS server error - try again later" };
    }
    return { verified: false, error: `DNS lookup failed: ${error.message}` };
  }
  
  return { verified: false, error: "No DNS records found for this domain" };
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

// Cache for IP geolocation to avoid rate limiting (ip-api.com allows 45 req/min)
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
    
    // Check cache first
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
        // If rate limited, return cached value or XX
        return cached?.country || "XX";
      }
      
      const country = data.countryCode || "XX";
      
      // Cache the result
      ipCountryCache.set(cleanIp, { country, timestamp: Date.now() });
      
      return country;
    }
    
    // If response not ok, return cached value or XX
    return cached?.country || "XX";
  } catch (error) {
    console.log(`[GeoIP] Error for IP: ${error}`);
    return "XX";
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  // ==========================================
  // ANTI-BOT CHALLENGE ROUTES
  // ==========================================
  
  // Honeypot routes - if a bot accesses these, mark the token as compromised
  app.get("/api/honeypot/:token", (req: Request, res: Response) => {
    const { token } = req.params;
    const challenge = challengeTokens.get(token);
    if (challenge) {
      challenge.honeypotTriggered = true;
      console.log(`[AntiBot] HONEYPOT TRIGGERED - Token: ${token.substring(0, 16)}... IP: ${challenge.ip}`);
    }
    // Return a fake success to not alert the bot
    res.status(200).send('OK');
  });
  
  app.get("/api/trap/:token", (req: Request, res: Response) => {
    const { token } = req.params;
    const challenge = challengeTokens.get(token);
    if (challenge) {
      challenge.honeypotTriggered = true;
      console.log(`[AntiBot] TRAP TRIGGERED - Token: ${token.substring(0, 16)}... IP: ${challenge.ip}`);
    }
    res.status(200).send('OK');
  });
  
  app.all("/api/submit/:token", (req: Request, res: Response) => {
    const { token } = req.params;
    const challenge = challengeTokens.get(token);
    if (challenge) {
      challenge.honeypotTriggered = true;
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
    
    const baitData = tiktok2BaitTokens.get(token);
    if (baitData) {
      const elapsed = Date.now() - baitData.createdAt;
      
      console.log(`[TikTok2] BOT DETECTED (${reason}) - Token: ${token.substring(0, 16)}... (${elapsed}ms)`);
      
      await storage.createClickLog({
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
      });
      
      await storage.incrementOfferClicks(baitData.offerId, false);
      tiktok2BaitTokens.delete(token);
    }
    
    // Return 1x1 transparent GIF
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
      
      const baitData = tiktok2BaitTokens.get(token);
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
    
    const baitData = tiktok2BaitTokens.get(token);
    if (baitData) {
      const elapsed = Date.now() - baitData.createdAt;
      
      console.log(`[TikTok2] BOT DETECTED (${reason}) - Token: ${token.substring(0, 16)}... (${elapsed}ms)`);
      
      await storage.createClickLog({
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
      });
      
      await storage.incrementOfferClicks(baitData.offerId, false);
      tiktok2BaitTokens.delete(token);
    }
    
    // Return 1x1 transparent GIF
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
    
    const baitData = tiktok2BaitTokens.get(token);
    if (!baitData) {
      console.log(`[TikTok2] Verify - Invalid/expired token: ${token.substring(0, 16)}... (Active tokens: ${tiktok2BaitTokens.size})`);
      return res.status(400).send('Session expired. Please try again.');
    }
    
    const now = Date.now();
    const elapsed = now - baitData.createdAt;
    
    // Validate timing - too fast is suspicious, too slow means expired
    if (elapsed < 200) {
      console.log(`[TikTok2] BOT DETECTED - Too fast (${elapsed}ms) - Token: ${token.substring(0, 16)}...`);
      await storage.createClickLog({
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
      });
      await storage.incrementOfferClicks(baitData.offerId, false);
      tiktok2BaitTokens.delete(token);
      return res.redirect(302, baitData.whiteUrl);
    }
    
    if (elapsed > TIKTOK2_BAIT_EXPIRY_MS) {
      console.log(`[TikTok2] Token expired (${elapsed}ms) - Token: ${token.substring(0, 16)}...`);
      await storage.createClickLog({
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
      });
      await storage.incrementOfferClicks(baitData.offerId, false);
      tiktok2BaitTokens.delete(token);
      return res.redirect(302, baitData.whiteUrl);
    }
    
    // Valid human visitor - log as BLACK and redirect
    console.log(`[TikTok2] HUMAN VERIFIED (${elapsed}ms) - Token: ${token.substring(0, 16)}... → BLACK`);
    
    await storage.createClickLog({
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
    });
    
    await storage.incrementOfferClicks(baitData.offerId, true);
    tiktok2BaitTokens.delete(token);
    
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
  app.get("/api/challenge/verify/:token", (req: Request, res: Response) => {
    const { token } = req.params;
    const score = parseInt(req.query.s as string) || 0;
    const nonce = req.query.r as string || '';
    
    const challenge = challengeTokens.get(token);
    if (!challenge) {
      console.log(`[AntiBot] Verify - Invalid/expired token: ${token.substring(0, 16)}...`);
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      return res.send(gif);
    }
    
    // SERVER-SIDE: Store verification data (can only be set once)
    if (challenge.verifiedAt === null) {
      challenge.verifiedAt = Date.now();
      challenge.verifiedScore = score;
      challenge.verificationNonce = nonce;
      console.log(`[AntiBot] Verify - Token: ${token.substring(0, 16)}... Score: ${score}, Nonce: ${nonce}, Honeypot: ${challenge.honeypotTriggered}`);
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
    
    const challenge = challengeTokens.get(token);
    if (!challenge) {
      console.log(`[AntiBot] Complete - Invalid/expired token: ${token.substring(0, 16)}...`);
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
    
    // 4. Check if token is too old
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
    
    // Clean up the token
    challengeTokens.delete(token);
    
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
    
    // LOG THE CLICK AFTER CHALLENGE RESULT (this is the only place clicks to black are logged)
    await storage.createClickLog({
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
    });
    
    // Increment click counters
    await storage.incrementOfferClicks(challenge.offerId, !isBot);
    
    console.log(`[AntiBot] ${redirectedTo.toUpperCase()} redirect after challenge - Score: ${score}, Elapsed: ${elapsed}ms, Bot: ${isBot}`);
    
    return res.redirect(302, targetUrl);
  });

  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      const isSuspended = user.suspendedAt !== null;
      const isTrialing = user.trialEndsAt !== null && new Date(user.trialEndsAt) > new Date();
      
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const isAdmin = adminEmail && user.email?.toLowerCase() === adminEmail;
      
      res.json({ ...userWithoutPassword, isSuspended, isTrialing, isAdmin });
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
      const offers = await storage.getOffersByUserId(userId);
      const domains = await storage.getDomainsByUserId(userId);
      const clicksLast7Days = await storage.getClickLogsLast7Days(userId);

      const today = new Date().toISOString().split("T")[0];
      const todayData = clicksLast7Days.find(d => d.date === today);

      const activeOffers = offers.filter(o => o.isActive);
      const activeDomains = domains.filter(d => d.isActive && d.isVerified);

      const totalClicks = offers.reduce((sum, o) => sum + o.totalClicks, 0);

      const clicksByOffer = offers
        .filter(o => o.totalClicks > 0)
        .map(o => ({ name: o.name, clicks: o.totalClicks }))
        .sort((a, b) => b.clicks - a.clicks);

      const domainClicksMap = new Map<string, number>();
      for (const offer of offers) {
        const domain = (offer as any).domain;
        if (domain) {
          const current = domainClicksMap.get(domain.subdomain) || 0;
          domainClicksMap.set(domain.subdomain, current + offer.totalClicks);
        }
      }
      const clicksByDomain = Array.from(domainClicksMap.entries())
        .map(([name, clicks]) => ({ name, clicks }))
        .sort((a, b) => b.clicks - a.clicks);

      res.json({
        todayClicks: todayData?.clicks || 0,
        totalClicks,
        activeOffers: activeOffers.length,
        activeDomains: activeDomains.length,
        clicksLast7Days,
        clicksByOffer,
        clicksByDomain,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/advanced", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = req.query.offerId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      const logs = await storage.getClickLogs(userId, 1, 10000, {
        offerId: offerId && offerId !== 'all' ? parseInt(offerId) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      
      const countryStats = new Map<string, { total: number; black: number; white: number }>();
      const deviceStats = new Map<string, { total: number; black: number; white: number }>();
      const platformStats = new Map<string, { total: number; black: number; white: number }>();
      const hourlyStats = new Array(24).fill(null).map(() => ({ total: 0, black: 0, white: 0 }));
      const weekdayStats = new Array(7).fill(null).map(() => ({ total: 0, black: 0, white: 0 }));
      
      let totalBlack = 0;
      let totalWhite = 0;
      
      for (const log of logs.logs) {
        const isBlack = log.redirectedTo === "black";
        if (isBlack) totalBlack++; else totalWhite++;
        
        const country = log.country || "Unknown";
        if (!countryStats.has(country)) {
          countryStats.set(country, { total: 0, black: 0, white: 0 });
        }
        const cs = countryStats.get(country)!;
        cs.total++;
        if (isBlack) cs.black++; else cs.white++;
        
        const device = log.device || "Unknown";
        if (!deviceStats.has(device)) {
          deviceStats.set(device, { total: 0, black: 0, white: 0 });
        }
        const ds = deviceStats.get(device)!;
        ds.total++;
        if (isBlack) ds.black++; else ds.white++;
        
        const platform = (log as any).platform || "Unknown";
        if (!platformStats.has(platform)) {
          platformStats.set(platform, { total: 0, black: 0, white: 0 });
        }
        const ps = platformStats.get(platform)!;
        ps.total++;
        if (isBlack) ps.black++; else ps.white++;
        
        const logDate = new Date(log.createdAt);
        const hour = logDate.getHours();
        const weekday = logDate.getDay();
        hourlyStats[hour].total++;
        if (isBlack) hourlyStats[hour].black++; else hourlyStats[hour].white++;
        weekdayStats[weekday].total++;
        if (isBlack) weekdayStats[weekday].black++; else weekdayStats[weekday].white++;
      }
      
      const conversionRate = logs.total > 0 ? (totalBlack / logs.total * 100).toFixed(1) : "0";
      
      const byCountry = Array.from(countryStats.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
        
      const byDevice = Array.from(deviceStats.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
        }))
        .sort((a, b) => b.total - a.total);
        
      const byPlatform = Array.from(platformStats.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
        }))
        .sort((a, b) => b.total - a.total);
        
      const byHour = hourlyStats.map((stats, hour) => ({
        hour: `${hour.toString().padStart(2, "0")}:00`,
        ...stats,
        conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
      }));
      
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const byWeekday = weekdayStats.map((stats, day) => ({
        day: weekdayNames[day],
        ...stats,
        conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
      }));

      res.json({
        totalClicks: logs.total,
        totalBlack,
        totalWhite,
        conversionRate,
        byCountry,
        byDevice,
        byPlatform,
        byHour,
        byWeekday,
      });
    } catch (error) {
      console.error("Error fetching advanced analytics:", error);
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

  app.get("/api/export/analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const format = req.query.format as string || "csv";
      const reportType = req.query.type as string || "summary";
      const logs = await storage.getClickLogs(userId, 1, 10000);
      
      const countryStats = new Map<string, { total: number; black: number; white: number }>();
      const deviceStats = new Map<string, { total: number; black: number; white: number }>();
      
      let totalBlack = 0;
      let totalWhite = 0;
      
      for (const log of logs.logs) {
        const isBlack = log.redirectedTo === "black";
        if (isBlack) totalBlack++; else totalWhite++;
        
        const country = log.country || "Unknown";
        if (!countryStats.has(country)) {
          countryStats.set(country, { total: 0, black: 0, white: 0 });
        }
        const cs = countryStats.get(country)!;
        cs.total++;
        if (isBlack) cs.black++; else cs.white++;
        
        const device = log.device || "Unknown";
        if (!deviceStats.has(device)) {
          deviceStats.set(device, { total: 0, black: 0, white: 0 });
        }
        const ds = deviceStats.get(device)!;
        ds.total++;
        if (isBlack) ds.black++; else ds.white++;
      }
      
      if (format === "csv") {
        let csvContent = "";
        const dateStr = new Date().toISOString().split("T")[0];
        
        if (reportType === "country" || reportType === "summary") {
          csvContent += "ANALYTICS BY COUNTRY\n";
          csvContent += "Country,Total Clicks,Black Redirects,White Redirects,Conversion Rate\n";
          for (const [name, stats] of countryStats) {
            const rate = stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0";
            csvContent += `${name},${stats.total},${stats.black},${stats.white},${rate}%\n`;
          }
          csvContent += "\n";
        }
        
        if (reportType === "device" || reportType === "summary") {
          csvContent += "ANALYTICS BY DEVICE\n";
          csvContent += "Device,Total Clicks,Black Redirects,White Redirects,Conversion Rate\n";
          for (const [name, stats] of deviceStats) {
            const rate = stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0";
            csvContent += `${name},${stats.total},${stats.black},${stats.white},${rate}%\n`;
          }
          csvContent += "\n";
        }
        
        if (reportType === "summary") {
          const overallRate = logs.total > 0 ? (totalBlack / logs.total * 100).toFixed(1) : "0";
          csvContent += "SUMMARY\n";
          csvContent += "Total Clicks,Black Redirects,White Redirects,Overall Conversion Rate\n";
          csvContent += `${logs.total},${totalBlack},${totalWhite},${overallRate}%\n`;
        }
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=analytics_report_${dateStr}.csv`);
        return res.send(csvContent);
      }
      
      res.status(400).json({ message: "Unsupported format" });
    } catch (error) {
      console.error("Error exporting analytics:", error);
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
      const { name, slug, platform, domainId, blackPageUrl, whitePageUrl, allowedCountries, allowedDevices, isActive } = req.body;

      // Check if user can create more offers
      const canCreate = await storage.canUserCreateOffer(userId);
      if (!canCreate.allowed) {
        if (canCreate.reason === 'user_suspended') {
          return res.status(403).json({ 
            message: "Your account is suspended. Please upgrade your plan to continue.",
            code: "USER_SUSPENDED"
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

      if (parsedSharedDomainId) {
        const existingOffer = await storage.getOfferBySlugAndSharedDomain(slug, parsedSharedDomainId);
        if (existingOffer) {
          return res.status(400).json({ message: "Slug already exists on this shared domain" });
        }
      } else {
        const existingOffer = await storage.getOfferBySlugAndDomain(slug, parsedDomainId);
        if (existingOffer) {
          return res.status(400).json({ message: "Slug already exists on this domain" });
        }
      }

      const xcode = generateXcode();
      const offer = await storage.createOffer({
        userId,
        name,
        slug,
        platform,
        domainId: parsedDomainId,
        sharedDomainId: parsedSharedDomainId,
        blackPageUrl,
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

      const { name, slug, platform, domainId, blackPageUrl, whitePageUrl, allowedCountries, allowedDevices, isActive } = req.body;

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
        blackPageUrl,
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

      const targetUrl = variant === 'black' ? offer.blackPageUrl : offer.whitePageUrl;
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

      const dnsResult = await verifyDomainDNS(domain.subdomain);
      
      const updated = await storage.updateDomain(domainId, {
        isVerified: dnsResult.verified,
        lastCheckedAt: new Date(),
        lastVerificationError: dnsResult.error || null,
        sslStatus: dnsResult.verified ? "active" : "pending",
      });

      if (!dnsResult.verified) {
        return res.status(400).json({ 
          message: dnsResult.error || "DNS verification failed",
          domain: updated
        });
      }

      res.json(updated);
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
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offerId = req.query.offerId && req.query.offerId !== "all" ? parseInt(req.query.offerId as string) : undefined;
      const redirectType = req.query.redirectType && req.query.redirectType !== "all" ? req.query.redirectType as string : undefined;

      const result = await storage.getClickLogs(userId, page, limit, { offerId, redirectType });
      res.json(result);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/notifications", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const notifications = await storage.getNotificationsByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const notificationId = parseInt(req.params.id);
      await storage.markNotificationAsRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
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
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Internal server error" });
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
      const { priceId, planId } = req.body;
      
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

        const trialDays = plan.hasTrial ? plan.trialDays : undefined;
        
        let subscriptionConfig: any = {
          customer: customerId,
          default_payment_method: selectedPaymentMethod,
          metadata: { userId, planId: String(plan.id) },
        };

        if (trialDays) {
          subscriptionConfig.trial_period_days = trialDays;
        }

        if (priceId && plan.stripePriceId) {
          subscriptionConfig.items = [{ price: priceId }];
        } else {
          const product = await stripe.products.create({
            name: plan.name,
            description: plan.nameEn || undefined,
          });
          
          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: plan.price,
            currency: 'brl',
            recurring: { interval: 'month' },
          });
          
          subscriptionConfig.items = [{ price: price.id }];
        }

        const subscription = await stripe.subscriptions.create({
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
        });
        
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

      if (priceId && plan.stripePriceId) {
        sessionConfig.line_items = [{ price: priceId, quantity: 1 }];
      } else {
        sessionConfig.line_items = [{
          price_data: {
            currency: 'brl',
            product_data: { 
              name: plan.name,
              description: plan.nameEn || undefined,
            },
            unit_amount: plan.price,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }];
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Internal server error" });
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

  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 20;
      const search = req.query.search as string | undefined;
      const result = await storage.getAllUsers(page, limit, search);
      
      const userIds = result.users.map(u => u.id);
      const clicksBreakdown = await storage.getClicksBreakdownByUserIds(userIds);
      
      const usersWithClicks = result.users.map(user => ({
        ...user,
        clicksBreakdown: clicksBreakdown.get(user.id) || { today: 0, thisWeek: 0, thisMonth: 0, lifetime: 0 },
      }));
      
      res.json({ users: usersWithClicks, total: result.total, page, limit });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/suspend", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const adminId = (req.user as any).id;
      const { suspend, reason } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (suspend) {
        await storage.suspendUser(userId, reason || 'admin_action', adminId);
      } else {
        await storage.unsuspendUser(userId, adminId);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/suspension-history", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const history = await storage.getSuspensionHistory(userId, 100);
      res.json(history);
    } catch (error) {
      console.error("Error fetching suspension history:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/reset-clicks", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.resetUserMonthlyClicks(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting clicks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/change-plan", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { planId } = req.body;
      await storage.updateUser(userId, { planId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/add-days", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { days } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const currentEnd = user.subscriptionEndDate || new Date();
      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + days);
      await storage.updateUser(userId, { subscriptionEndDate: newEnd });
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding days:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/force-payment", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      await storage.updateUser(userId, {
        subscriptionStatus: "active",
        subscriptionEndDate: endDate,
        suspendedAt: null,
        suspensionReason: null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error forcing payment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/change-password", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { password } = req.body;
      
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 12);
      await storage.updateUser(userId, { password: hashedPassword });
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.email?.toLowerCase() === adminEmail) {
        return res.status(400).json({ message: "Cannot delete admin user" });
      }
      
      await storage.deleteUserWithCascade(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/impersonate/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const adminId = (req.user as any).id;
      const targetUserId = req.params.id;
      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await storage.createAdminImpersonation(adminId, targetUserId, sessionToken, expiresAt);
      
      (req.session as any).impersonationToken = sessionToken;
      res.json({ success: true });
    } catch (error) {
      console.error("Error impersonating user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/impersonation/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const sessionToken = (req.session as any).impersonationToken;
      if (!sessionToken) {
        return res.json({ isImpersonating: false });
      }
      const impersonation = await storage.getAdminImpersonation(sessionToken);
      if (!impersonation) {
        return res.json({ isImpersonating: false });
      }
      const targetUser = await storage.getUser(impersonation.targetUserId);
      res.json({
        isImpersonating: true,
        targetUser: targetUser ? { id: targetUser.id, email: targetUser.email } : null,
      });
    } catch (error) {
      console.error("Error checking impersonation status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/impersonation/exit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const sessionToken = (req.session as any).impersonationToken;
      if (sessionToken) {
        await storage.deleteAdminImpersonation(sessionToken);
        delete (req.session as any).impersonationToken;
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error exiting impersonation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/config", isAdmin, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json({ logoUrl: settings?.logoPath || null });
    } catch (error) {
      console.error("Error fetching admin config:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // System monitoring metrics - last 72 hours
  app.get("/api/admin/system-metrics", isAdmin, async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getSystemMetrics72h();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching system metrics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/dashboard", isAdmin, async (req: Request, res: Response) => {
    try {
      const platform = req.query.platform as string | undefined;
      const metrics = await storage.getAdminDashboardMetrics(platform);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching admin dashboard:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users-new", isAdmin, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as '7d' | '30d' | '1y') || '7d';
      const data = await storage.getUsersNewByPeriod(period);
      res.json(data);
    } catch (error) {
      console.error("Error fetching new users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users-ranking", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const period = (req.query.period as 'today' | '7d' | '30d') || 'today';
      const platform = req.query.platform as string | undefined;
      const data = await storage.getUsersRanking(page, limit, period, platform);
      res.json(data);
    } catch (error) {
      console.error("Error fetching users ranking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/metrics", isAdmin, async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getBillingMetrics();
      
      let totalRevenue = 0;
      const stripeConfigured = await isStripeConfigured();
      if (stripeConfigured) {
        try {
          const stripe = await getStripeClient();
          let hasMore = true;
          let startingAfter: string | undefined;
          
          while (hasMore) {
            const params: any = { limit: 100 };
            if (startingAfter) {
              params.starting_after = startingAfter;
            }
            const charges = await stripe.charges.list(params);
            totalRevenue += charges.data
              .filter(c => c.status === 'succeeded')
              .reduce((sum, c) => sum + c.amount, 0) / 100;
            hasMore = charges.has_more;
            if (charges.data.length > 0) {
              startingAfter = charges.data[charges.data.length - 1].id;
            }
          }
        } catch (e) {
          console.error("Error fetching Stripe charges:", e);
        }
      }
      
      res.json({
        subscriptionsActive: metrics.subscriptionsActive,
        subscriptionsInactive: metrics.subscriptionsInactive,
        subscriptionsTrial: metrics.subscriptionsTrial,
        subscriptionsSuspended: metrics.subscriptionsSuspended,
        usersToday: metrics.usersToday,
        usersThisMonth: metrics.usersThisMonth,
        mrr: metrics.mrr,
        totalRevenue,
      });
    } catch (error) {
      console.error("Error fetching billing metrics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/subscribers", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const planId = req.query.planId ? parseInt(req.query.planId as string) : undefined;
      const status = req.query.status as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const data = await storage.getSubscribersWithPagination(page, limit, { planId, status, startDate, endDate });
      res.json({ ...data, page, limit });
    } catch (error) {
      console.error("Error fetching subscribers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/payments", isAdmin, async (req: Request, res: Response) => {
    try {
      const stripeConfigured = await isStripeConfigured();
      if (!stripeConfigured) {
        return res.json({ payments: [], total: 0 });
      }
      
      const stripe = await getStripeClient();
      const limit = parseInt(req.query.limit as string) || 25;
      const startingAfter = req.query.startingAfter as string | undefined;
      
      const params: any = { limit };
      if (startingAfter) {
        params.starting_after = startingAfter;
      }
      
      const charges = await stripe.charges.list(params);
      
      const payments = await Promise.all(
        charges.data.map(async (charge) => {
          let userEmail = null;
          if (charge.customer) {
            const user = await storage.getUserByStripeCustomerId(charge.customer as string);
            userEmail = user?.email || null;
          }
          return {
            id: charge.id,
            amount: charge.amount / 100,
            currency: charge.currency,
            status: charge.status,
            date: charge.created ? new Date(charge.created * 1000).toISOString() : null,
            userEmail,
            description: charge.description,
          };
        })
      );
      
      res.json({
        payments,
        hasMore: charges.has_more,
        lastId: charges.data.length > 0 ? charges.data[charges.data.length - 1].id : null,
      });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/subscriptions-chart", isAdmin, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as '7d' | '30d' | '1y') || '30d';
      const data = await storage.getUsersNewByPeriod(period);
      res.json(data);
    } catch (error) {
      console.error("Error fetching subscriptions chart:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/plans", isAdmin, async (req: Request, res: Response) => {
    try {
      const plan = await storage.createPlan(req.body);
      res.json(plan);
    } catch (error) {
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/plans/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      const updated = await storage.updatePlan(planId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/plans/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      await storage.deletePlan(planId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Shared domains - Admin routes
  app.get("/api/admin/shared-domains", isAdmin, async (req: Request, res: Response) => {
    try {
      const domains = await storage.getAllSharedDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching shared domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/shared-domains", isAdmin, async (req: Request, res: Response) => {
    try {
      let { subdomain } = req.body;
      
      if (!subdomain || typeof subdomain !== "string") {
        return res.status(400).json({ message: "Subdomain is required" });
      }
      
      // Normalize subdomain: remove protocol, trailing slashes, lowercase
      subdomain = subdomain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
        .replace(/^www\./, "")
        .trim();
      
      // Validate subdomain format (must be a valid domain)
      const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
      if (!domainRegex.test(subdomain)) {
        return res.status(400).json({ message: "Invalid domain format. Use format: subdomain.domain.com" });
      }
      
      // Check if domain already exists in regular domains or shared domains
      const existingDomain = await storage.getDomainBySubdomain(subdomain);
      const existingShared = await storage.getSharedDomainBySubdomain(subdomain);
      
      if (existingDomain || existingShared) {
        return res.status(400).json({ message: "Domain already exists" });
      }
      
      let domain = await storage.createSharedDomain({
        subdomain,
        isActive: true,
        isVerified: false,
        sslStatus: "pending",
      });
      
      // Sync with EasyPanel
      const { easypanelService } = await import("./easypanel");
      if (easypanelService.isConfigured()) {
        const result = await easypanelService.addDomain(subdomain);
        if (result.success && result.domainId) {
          domain = await storage.updateSharedDomain(domain.id, {
            easypanelDomainId: result.domainId
          }) || domain;
        } else {
          console.warn(`[SharedDomains] Failed to sync with EasyPanel for ${subdomain}: ${result.error}`);
        }
      }
      
      res.json(domain);
    } catch (error) {
      console.error("Error creating shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/shared-domains/:id/verify", isAdmin, async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.id);
      const domain = await storage.getSharedDomain(domainId);
      
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      
      const dnsResult = await verifyDomainDNS(domain.subdomain);
      
      const updated = await storage.updateSharedDomain(domainId, {
        isVerified: dnsResult.verified,
        lastCheckedAt: new Date(),
        lastVerificationError: dnsResult.error || null,
        sslStatus: dnsResult.verified ? "active" : "pending",
      });
      
      if (!dnsResult.verified) {
        return res.status(400).json({ 
          message: dnsResult.error || "DNS verification failed",
          domain: updated
        });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error verifying shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/shared-domains/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.id);
      const domain = await storage.getSharedDomain(domainId);
      
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      
      // Sync with EasyPanel
      const { easypanelService } = await import("./easypanel");
      if (easypanelService.isConfigured() && domain.easypanelDomainId) {
        await easypanelService.removeDomain(domain.easypanelDomainId);
      }
      
      await storage.deleteSharedDomain(domainId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Shared domains - User route (get available shared domains)
  app.get("/api/shared-domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const domains = await storage.getActiveSharedDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching shared domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Rate limiting for bot detection - track clicks per IP
  const ipClickTracker = new Map<string, { count: number; firstClick: number; lastClick: number }>();
  const RATE_LIMIT_WINDOW_MS = 180000; // 3 minute window
  const RATE_LIMIT_MAX_CLICKS = 15; // Max 15 clicks per IP per 3 minutes
  const RATE_LIMIT_CLEANUP_INTERVAL = 300000; // Clean up every 5 minutes

  // Clean up old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipClickTracker.entries()) {
      if (now - data.lastClick > RATE_LIMIT_WINDOW_MS * 2) {
        ipClickTracker.delete(ip);
      }
    }
  }, RATE_LIMIT_CLEANUP_INTERVAL);

  function checkIPRateLimit(ip: string): { isRateLimited: boolean; clickCount: number } {
    const now = Date.now();
    const tracker = ipClickTracker.get(ip);
    
    if (!tracker) {
      ipClickTracker.set(ip, { count: 1, firstClick: now, lastClick: now });
      return { isRateLimited: false, clickCount: 1 };
    }
    
    // Reset if window has passed
    if (now - tracker.firstClick > RATE_LIMIT_WINDOW_MS) {
      ipClickTracker.set(ip, { count: 1, firstClick: now, lastClick: now });
      return { isRateLimited: false, clickCount: 1 };
    }
    
    // Increment and check
    tracker.count++;
    tracker.lastClick = now;
    
    return { 
      isRateLimited: tracker.count > RATE_LIMIT_MAX_CLICKS, 
      clickCount: tracker.count 
    };
  }

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
          // Fallback: try to find offer by slug only (for testing/development)
          console.log(`[Cloak] Domain not found or invalid, trying fallback lookup for slug: ${slug}`);
          offer = await storage.getOfferBySlug(slug);
          if (offer && offer.domainId) {
            domain = await storage.getDomain(offer.domainId);
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
      
      // Get plan limits first (needed for reset logic)
      const planForLimits = currentOwner.planId ? await storage.getPlan(currentOwner.planId) : null;
      if (!planForLimits) {
        // No active plan - return 404
        console.log(`[Cloak] User ${currentOwner.id} has no active plan - returning 404`);
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
        console.log(`[Cloak] User ${currentOwner.id} is suspended - returning 404`);
        return res.status(404).send("Not found");
      }

      // Check grace period expiration
      if (currentOwner.gracePeriodEndsAt && new Date() > currentOwner.gracePeriodEndsAt) {
        // Grace period has expired - suspend user
        console.log(`[Cloak] User ${currentOwner.id} grace period expired - suspending`);
        await storage.suspendUser(currentOwner.id, 'grace_period_expired');
        return res.status(404).send("Not found");
      }

      // Check clicks limit (only for non-unlimited plans)
      if (!planForLimits.isUnlimited) {
        const clicksLimit = planForLimits.maxClicks;
        
        if (clicksUsed >= clicksLimit) {
          // User has exceeded their click limit
          if (!currentOwner.gracePeriodEndsAt) {
            // Start grace period (48 hours)
            console.log(`[Cloak] User ${currentOwner.id} exceeded clicks limit - starting grace period`);
            await storage.startGracePeriod(currentOwner.id);
          }
          // During grace period, continue processing clicks
          // (The check above handles expired grace periods)
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
      
      let paramsValid = false;
      let failReason = "";
      let isBotDetected = false;

      // ==========================================
      // ADVANCED BOT DETECTION FOR TIKTOK
      // ==========================================
      
      // 0. Rate limiting - block IPs with too many clicks in a short time
      // This catches bot floods like 55 clicks in 1 minute
      const rateLimitResult = checkIPRateLimit(ip);
      if (rateLimitResult.isRateLimited) {
        isBotDetected = true;
        failReason = `rate_limited:${rateLimitResult.clickCount}_clicks_per_minute`;
        console.log(`[Cloak] BOT DETECTED - Rate limited: ${ip} - ${rateLimitResult.clickCount} clicks in 1 minute`);
      }
      
      // 1. Detect TikTok page verification bots by User-Agent
      const tiktokBotPatterns = [
        'thirdLandingPageFeInfra',     // TikTok page verification bot
        'TikTokBot',                    // Generic TikTok bot
        'bytespider',                   // ByteDance spider
        'Bytespider',
        'PetalBot',                     // Huawei crawler
        'Googlebot',                    // Google crawler
        'bingbot',                      // Bing crawler
        'facebookexternalhit',          // Facebook crawler
        'Twitterbot',                   // Twitter crawler
        'LinkedInBot',                  // LinkedIn crawler
        'Slackbot',                     // Slack crawler
        'WhatsApp',                     // WhatsApp crawler
        'TelegramBot',                  // Telegram crawler
        'HeadlessChrome',               // Headless browser
        'PhantomJS',                    // Headless browser
        'Puppeteer',                    // Puppeteer automation
        'Playwright',                   // Playwright automation
      ];
      
      const userAgentLower = userAgent.toLowerCase();
      for (const pattern of tiktokBotPatterns) {
        if (userAgent.includes(pattern) || userAgentLower.includes(pattern.toLowerCase())) {
          isBotDetected = true;
          failReason = `bot_detected:${pattern}`;
          console.log(`[Cloak] BOT DETECTED - Pattern: ${pattern} - UA: ${userAgent.substring(0, 100)}`);
          break;
        }
      }
      
      // 2. Detect unresolved TikTok macros (bots use template URLs)
      const unresolvedMacros = [
        '__CLICKID__',
        '__CID__',
        '__AID__',
        '__AID_NAME__',
        '__CAMPAIGN_NAME__',
        '__CAMPAIGN_ID__',
        '__DOMAIN__',
        '__PLACEMENT__',
        '{{clickid}}',
        '{{campaign_name}}',
        '${CLICKID}',
        '${CAMPAIGN}',
      ];
      
      if (!isBotDetected && ttclid) {
        for (const macro of unresolvedMacros) {
          if (ttclid.includes(macro) || (cname && cname.includes(macro))) {
            isBotDetected = true;
            failReason = `unresolved_macro:${macro}`;
            console.log(`[Cloak] BOT DETECTED - Unresolved macro: ${macro} in ttclid/cname`);
            break;
          }
        }
      }
      
      // 3b. Detect fake Chrome versions (bots use future versions that don't exist)
      // Current stable Chrome is around 131-132, anything above 135 is suspicious
      if (!isBotDetected) {
        const chromeVersionMatch = userAgent.match(/Chrome\/(\d+)\./);
        if (chromeVersionMatch) {
          const chromeVersion = parseInt(chromeVersionMatch[1], 10);
          if (chromeVersion > 135) {
            isBotDetected = true;
            failReason = `fake_chrome_version:${chromeVersion}`;
            console.log(`[Cloak] BOT DETECTED - Fake Chrome version: ${chromeVersion} (versions above 135 don't exist yet)`);
          }
        }
      }
      
      // 3c. Detect User-Agent typos (bots often have "Bulid" instead of "Build")
      if (!isBotDetected && userAgent.includes('Bulid')) {
        isBotDetected = true;
        failReason = 'ua_typo:Bulid';
        console.log(`[Cloak] BOT DETECTED - User-Agent typo: "Bulid" instead of "Build"`);
      }
      
      if (offer.platform === "tiktok") {
        // ==========================================
        // TIKTOK 2 - SIMPLIFIED VALIDATION (NO JS CHALLENGE)
        // ==========================================
        // Required params: ttclid, adname, adset, cname, xcode
        // No advanced bot detection, no JS challenge - direct redirect
        // Only validates: params + country + device filters
        
        const adname = fixedQuery.adname || rawQuery.adname;
        const adset = fixedQuery.adset || rawQuery.adset;
        
        // Check for unresolved macros (basic bot detection)
        const tiktok2Macros = ['__CLICKID__', '__AID_NAME__', '__AID__', '__CAMPAIGN_NAME__'];
        let hasUnresolvedMacro = false;
        let failedParam = "";
        
        for (const macro of tiktok2Macros) {
          if ((ttclid && ttclid.includes(macro)) ||
              (adname && adname.includes(macro)) ||
              (adset && adset.includes(macro)) ||
              (cname && cname.includes(macro))) {
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
        } else if (!adname) {
          failReason = "missing_adname";
          paramsValid = false;
        } else if (!adset) {
          failReason = "missing_adset";
          paramsValid = false;
        } else if (!cname) {
          failReason = "missing_cname";
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
        
        console.log(`[TikTok2] Param validation: ttclid=${!!ttclid}, adname=${!!adname}, adset=${!!adset}, cname=${!!cname}, xcode=${xcode === offer.xcode ? 'match' : 'mismatch'} → ${paramsValid ? 'VALID' : failReason}`);
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
        country = await getCountryFromIP(ip);
        countryAllowed = offer.allowedCountries.includes(country) || country === 'XX';
      }

      // Determine redirect type
      const shouldRedirectToBlack = paramsValid && deviceAllowed && countryAllowed;
      const redirectType = shouldRedirectToBlack ? "black" : "white";
      const targetUrl = shouldRedirectToBlack ? offer.blackPageUrl : offer.whitePageUrl;

      // Calculate response time before logging
      const duration = Date.now() - startTime;

      // Build full request URL for logging
      const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

      // If going to WHITE page - log and redirect directly (no challenge needed)
      if (!shouldRedirectToBlack) {
        // Log the click with response time
        await storage.createClickLog({
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
            failReason: failReason || `device:${!deviceAllowed};country:${!countryAllowed}`,
            isBotDetected,
          },
        });

        await storage.incrementOfferClicks(offer.id, false);
        console.log(`[Cloak] WHITE redirect for ${slug} (${duration}ms) - device:${deviceType}, country:${country}, bot:${isBotDetected}, params:${failReason}`);
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
        
        tiktok2BaitTokens.set(baitToken, {
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
        // Log the click
        await storage.createClickLog({
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
          },
        });

        await storage.incrementOfferClicks(offer.id, true);
        
        // Append UTM parameters to black page URL
        const finalUrl = appendUTMParams(targetUrl, req.query as Record<string, any>);
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
      
      // Generate challenge token and store challenge data
      const challengeToken = generateChallengeToken();
      const honeypotId = `hp_${randomBytes(4).toString('hex')}`;
      
      challengeTokens.set(challengeToken, {
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
        // Data for logging after challenge
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
    const skipPaths = ["api", "assets", "src", "@", "node_modules", "favicon.ico", "robots.txt"];
    if (skipPaths.some(p => slug.startsWith(p)) || slug.includes(".")) {
      console.log(`[CLOAK /:slug] Skipping - matches skip pattern`);
      return next();
    }
    
    // Use the same helper function to extract domain from request headers
    const domainToCheck = extractDomainFromRequest(req);
    
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
      if (isSuspended) {
        console.log(`[Cloak] User suspended: ${offer.userId}`);
        return res.redirect(302, offer.whitePageUrl);
      }

      // Check click limits
      const plan = owner.planId ? await storage.getPlan(owner.planId) : null;
      if (plan && !plan.isUnlimited) {
        const userOffers = await storage.getOffersByUserId(offer.userId);
        const totalClicks = userOffers.reduce((sum, o) => sum + (o.totalClicks || 0), 0);
        
        if (totalClicks >= plan.maxClicks) {
          const gracePeriodEnd = owner.subscriptionEndDate 
            ? new Date(new Date(owner.subscriptionEndDate).getTime() + 3 * 24 * 60 * 60 * 1000)
            : null;
          
          if (!gracePeriodEnd || new Date() > gracePeriodEnd) {
            console.log(`[Cloak] User over click limit: ${offer.userId} (${totalClicks}/${plan.maxClicks})`);
            return res.redirect(302, offer.whitePageUrl);
          }
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
      
      let paramsValid = false;
      let failReason = "";

      if (offer.platform === "tiktok") {
        // ==========================================
        // TIKTOK 2 - SIMPLIFIED VALIDATION (NO JS CHALLENGE)
        // ==========================================
        const adname2 = fixedQuery2.adname || rawQuery2.adname;
        const adset2 = fixedQuery2.adset || rawQuery2.adset;
        
        const tiktok2Macros = ['__CLICKID__', '__AID_NAME__', '__AID__', '__CAMPAIGN_NAME__'];
        let hasUnresolvedMacro = false;
        let failedParam = "";
        
        for (const macro of tiktok2Macros) {
          if ((ttclid && ttclid.includes(macro)) ||
              (adname2 && adname2.includes(macro)) ||
              (adset2 && adset2.includes(macro)) ||
              (cname && cname.includes(macro))) {
            hasUnresolvedMacro = true;
            failedParam = `macro:${macro}`;
            break;
          }
        }
        
        if (hasUnresolvedMacro) {
          failReason = `unresolved_${failedParam}`;
        } else if (!ttclid) {
          failReason = "missing_ttclid";
        } else if (!adname2) {
          failReason = "missing_adname";
        } else if (!adset2) {
          failReason = "missing_adset";
        } else if (!cname) {
          failReason = "missing_cname";
        } else if (!xcode) {
          failReason = "missing_xcode";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          paramsValid = true;
        }
        
        console.log(`[TikTok2] Param validation: ttclid=${!!ttclid}, adname=${!!adname2}, adset=${!!adset2}, cname=${!!cname}, xcode=${xcode === offer.xcode ? 'match' : 'mismatch'} → ${paramsValid ? 'VALID' : failReason}`);
      } else if (offer.platform === "facebook") {
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
        country = await getCountryFromIP(ip);
        countryAllowed = offer.allowedCountries.includes(country) || country === 'XX';
      }

      const shouldRedirectToBlack = paramsValid && deviceAllowed && countryAllowed;
      const redirectType = shouldRedirectToBlack ? "black" : "white";
      const targetUrl = shouldRedirectToBlack ? offer.blackPageUrl : offer.whitePageUrl;

      // Calculate response time before logging
      const duration = Date.now() - startTime;

      // Build full request URL for logging
      const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

      // If going to WHITE page - log and redirect directly (no challenge needed)
      if (!shouldRedirectToBlack) {
        await storage.createClickLog({
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
            failReason: failReason || `device:${!deviceAllowed};country:${!countryAllowed}`,
          },
        });

        await storage.incrementOfferClicks(offer.id, false);
        console.log(`[Cloak] WHITE redirect for ${slug} (${duration}ms) - device:${deviceType}, country:${country}, params:${failReason}`);
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
        
        tiktok2BaitTokens.set(baitToken, {
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
        // Log the click
        await storage.createClickLog({
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
          },
        });

        await storage.incrementOfferClicks(offer.id, true);
        
        // Append UTM parameters to black page URL
        const finalUrl = appendUTMParams(targetUrl, req.query as Record<string, any>);
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
      
      challengeTokens.set(challengeToken, {
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
        // Data for logging after challenge
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

  return httpServer;
}
