/**
 * server/botDetection.ts
 *
 * Centralized bot / crawler detection used by ALL cloaking routes.
 * Import `checkIPRateLimit` and `detectBotTraffic` wherever needed.
 */

// ──────────────────────────────────────────────────────────────
// RATE LIMITING  (shared across /r/:slug and /:slug)
// ──────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS   = 180_000;  // 3-minute rolling window
const RATE_LIMIT_MAX_CLICKS  = 15;       // max clicks per IP per window
const RATE_LIMIT_CLEANUP_MS  = 300_000;  // cleanup stale entries every 5 min

interface IPTracker {
  count: number;
  firstClick: number;
  lastClick: number;
}

const ipClickTracker = new Map<string, IPTracker>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipClickTracker.entries()) {
    if (now - data.lastClick > RATE_LIMIT_WINDOW_MS * 2) {
      ipClickTracker.delete(ip);
    }
  }
}, RATE_LIMIT_CLEANUP_MS);

export function checkIPRateLimit(ip: string): { isRateLimited: boolean; clickCount: number } {
  const now     = Date.now();
  const tracker = ipClickTracker.get(ip);

  if (!tracker) {
    ipClickTracker.set(ip, { count: 1, firstClick: now, lastClick: now });
    return { isRateLimited: false, clickCount: 1 };
  }

  if (now - tracker.firstClick > RATE_LIMIT_WINDOW_MS) {
    ipClickTracker.set(ip, { count: 1, firstClick: now, lastClick: now });
    return { isRateLimited: false, clickCount: 1 };
  }

  tracker.count++;
  tracker.lastClick = now;
  return { isRateLimited: tracker.count > RATE_LIMIT_MAX_CLICKS, clickCount: tracker.count };
}

// ──────────────────────────────────────────────────────────────
// UA PATTERN LISTS
// ──────────────────────────────────────────────────────────────

/** Known bot / crawler / automation User-Agent strings (case-insensitive substring match). */
const BOT_UA_PATTERNS: string[] = [
  // ── Meta / Facebook crawlers ───────────────────────────────
  'facebookexternalhit',
  'Facebot',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  // ── TikTok / ByteDance ─────────────────────────────────────
  'thirdLandingPageFeInfra',
  'TikTokBot',
  'bytespider',
  'Bytespider',
  // ── Search engine crawlers ─────────────────────────────────
  'Googlebot',
  'Google-InspectionTool',
  'GoogleOther',
  'bingbot',
  'BingPreview',
  'Slurp',
  'DuckDuckBot',
  'Baiduspider',
  'YandexBot',
  'PetalBot',
  'Sogou',
  'Exabot',
  'ia_archiver',
  'archive.org_bot',
  // ── Social link-preview crawlers ───────────────────────────
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'TelegramBot',
  'Discordbot',
  'Applebot',
  'Viber',
  // ── WhatsApp / Instagram crawlers ─────────────────────────
  'WhatsApp',
  'InstagramBot',
  // ── Headless browsers ─────────────────────────────────────
  'HeadlessChrome',
  'PhantomJS',
  'SlimerJS',
  // ── Automation frameworks ─────────────────────────────────
  'Puppeteer',
  'Playwright',
  'Selenium',
  'webdriver',
  // ── HTTP client libraries (programmatic access) ───────────
  'python-requests',
  'python-urllib',
  'Python/',
  'Go-http-client',
  'Java/',
  'okhttp',
  'PostmanRuntime',
  'axios/',
  'node-fetch',
  'node-http',
  'undici',
  'libwww-perl',
  'LWP::Simple',
  'curl/',
  'wget/',
  'HTTPie',
  'httpx',
  'scrapy',
  'aiohttp',
  'got/',
  'superagent',
  'requests/',
  'RestSharp',
  'Apache-HttpClient',
  // ── Security scanners / data harvesters ───────────────────
  'Nuclei',
  'sqlmap',
  'Nikto',
  'zgrab',
  'nmap',
  'masscan',
  'censys',
  'shodan',
  'SemrushBot',
  'AhrefsBot',
  'MJ12bot',
  'DotBot',
  'BLEXBot',
  'DataForSeoBot',
  // ── AI crawlers ────────────────────────────────────────────
  'GPTBot',
  'ChatGPT-User',
  'CCBot',
  'anthropic-ai',
  'ClaudeBot',
  'PerplexityBot',
  'Amazonbot',
  'cohere-ai',
];

/** UA substrings that are typos or raw SDK identifiers real browsers never emit. */
const UA_TYPO_PATTERNS: string[] = [
  'Bulid',   // "Build" misspelled — documented bot fingerprint
  'Dalvik',  // Android SDK raw HTTP stack (not a browser navigation)
];

/** Template macro placeholders that appear when bots scan un-expanded ad URLs. */
const UNRESOLVED_MACRO_PATTERNS: string[] = [
  '__CLICKID__', '__CID__', '__AID__', '__AID_NAME__',
  '__CAMPAIGN_NAME__', '__CAMPAIGN_ID__', '__DOMAIN__', '__PLACEMENT__',
  '__CALLBACK_PARAM__', '__CID_NAME__', '__CSITE__',
  '{{clickid}}', '{{campaign_name}}', '{{campaign_id}}',
  '${CLICKID}', '${CAMPAIGN}', '${ADID}',
];

/**
 * Highest realistic Chrome major version.
 * Update this when a new stable Chrome ships above 135.
 * Anything higher is a bot spoofing a non-existent version.
 */
const MAX_REAL_CHROME_VERSION = 135;

// ──────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ──────────────────────────────────────────────────────────────

export interface BotDetectionResult {
  isBot: boolean;
  reasons: string[];
  /** Overall confidence in the bot verdict. */
  confidence: 'low' | 'medium' | 'high';
  /** The single most important reason (first detected). */
  primaryReason: string;
}

export interface BotDetectionInput {
  userAgent: string;
  rateLimitResult: { isRateLimited: boolean; clickCount: number };
  ipAnalysis: {
    isDatacenter: boolean;
    isProxy: boolean;
    /** True when the IP belongs to a known corporate Secure Web Gateway (Zscaler, Netskope, etc.)
     *  that confirmed proxy=false — real employee traffic, NOT automated bots. */
    isCorporateProxy: boolean;
    isp: string;
    as: string;
    reason?: string;
  };
  /** TikTok click-id (checked for unresolved macros). */
  ttclid?: string;
  /** TikTok campaign name param (checked for unresolved macros). */
  cname?: string;
  /** Route identifier for logging, e.g. '/r/:slug' or '/:slug'. */
  route: string;
  slug?: string;
  platform?: string;
  /** HTTP Referer header — used to allow "Bulid" typo on confirmed TikTok traffic. */
  referer?: string;
}

// ──────────────────────────────────────────────────────────────
// MAIN DETECTION FUNCTION
// ──────────────────────────────────────────────────────────────

/**
 * Unified bot-traffic detector.
 *
 * Call once per request, before param validation.
 * If `result.isBot === true`, redirect to the WHITE page immediately.
 */
export function detectBotTraffic(input: BotDetectionInput): BotDetectionResult {
  const { userAgent, rateLimitResult, ipAnalysis, ttclid, cname, route, slug, platform } = input;
  const reasons: string[] = [];
  let confidence: 'low' | 'medium' | 'high' = 'low';

  const ua      = userAgent ?? '';
  const uaLower = ua.toLowerCase();

  // 1. Rate limit — high confidence
  if (rateLimitResult.isRateLimited) {
    reasons.push(`rate_limited:${rateLimitResult.clickCount}_clicks_in_3min`);
    confidence = 'high';
  }

  // 2. Datacenter IP — high confidence
  // Exception: corporate Secure Web Gateways (Zscaler, Netskope, etc.) confirmed proxy=false
  // are real employee traffic, NOT automated bots. ip-api may flag them as hosting=true due to
  // their AS registration, but their proxy=false signal takes precedence.
  if (ipAnalysis.isDatacenter && !ipAnalysis.isCorporateProxy) {
    reasons.push(`datacenter_ip:${ipAnalysis.isp.substring(0, 40)}`);
    confidence = 'high';
  }

  // 2b. Corporate security proxy — informational only, NOT a bot signal
  // Log it so operators can see it in server logs, but don't flag as bot.
  if (ipAnalysis.isCorporateProxy) {
    console.log(
      `[BotDetection] CORPORATE_PROXY: ${ipAnalysis.isp.substring(0, 50)} ` +
      `route=${route} slug=${slug ?? '-'} — proxy=false confirmed, not flagged as datacenter`
    );
  }

  // 3. Proxy IP — medium confidence
  if (ipAnalysis.isProxy) {
    reasons.push(`proxy_ip:${ipAnalysis.isp.substring(0, 40)}`);
    if (confidence === 'low') confidence = 'medium';
  }

  // 4. Empty / extremely short UA — high confidence
  if (!ua || ua.trim().length < 10) {
    reasons.push('ua_empty_or_too_short');
    confidence = 'high';
  }

  // 5. Facebook background HTTP client (CFNetwork — not a real browser navigation)
  //    Pattern: "Facebook/376.0.0.11.114 CFNetwork/1492.0.1 Darwin/23.3.0"
  if (/^Facebook\/\d+/.test(ua) && ua.includes('CFNetwork')) {
    reasons.push('bot_ua:facebook_cfnetwork_background');
    confidence = 'high';
  }

  // 6. Known bot UA patterns (case-insensitive substring)
  if (reasons.length === 0 || confidence !== 'high') {
    for (const pattern of BOT_UA_PATTERNS) {
      if (ua.includes(pattern) || uaLower.includes(pattern.toLowerCase())) {
        reasons.push(`bot_ua_pattern:${pattern}`);
        confidence = 'high';
        break;
      }
    }
  }

  // 7. UA typos / raw SDK identifiers
  // "Bulid" appears in some Samsung Galaxy S20/S21 firmware TikTok WebView UAs.
  // When ALL strong signals point to a real user (TikTok platform, valid ttclid,
  // tiktok.com referer, residential IP, no other bot flags), we downgrade it to
  // informational-only to avoid false positives.
  for (const typo of UA_TYPO_PATTERNS) {
    if (!ua.includes(typo)) continue;

    // Special case: "Bulid" on TikTok with clean signals → non-blocking
    if (
      typo === 'Bulid' &&
      platform === 'tiktok' &&
      ttclid &&
      !ttclid.includes('__') &&  // no unresolved macro
      (input.referer ?? '').toLowerCase().includes('tiktok.com') &&
      !ipAnalysis.isDatacenter &&
      !ipAnalysis.isProxy &&
      reasons.length === 0  // no other bot signal already detected
    ) {
      // Check UA looks like a mobile device (not desktop/headless)
      const uaMobile = /android.*mobile|iphone|ipod|musical_ly|bytedancewebview/i.test(ua);
      if (uaMobile) {
        console.log(
          `[BotDetection] suspicious_ua_typo_bulid_non_blocking ` +
          `route=${route} slug=${slug ?? '-'} platform=${platform} ` +
          `referer=${input.referer?.substring(0, 40) ?? '-'} ` +
          `ttclid_present=true datacenter=false proxy=false — NOT flagging as bot`
        );
        continue;  // skip — informational only, not added to reasons
      }
    }

    reasons.push(`ua_typo:${typo}`);
    if (confidence === 'low') confidence = 'medium';
  }

  // 8. Chrome version check — informational only, does NOT block traffic
  // High Chrome versions cause false positives on real smartphones (OS updates
  // ship Chrome faster than MAX_REAL_CHROME_VERSION can be updated).
  // We log it for diagnostics but never add it to `reasons`.
  const chromeMatch = ua.match(/Chrome\/(\d+)\./);
  if (chromeMatch) {
    const ver = parseInt(chromeMatch[1], 10);
    if (ver > MAX_REAL_CHROME_VERSION) {
      console.log(
        `[BotDetection] suspicious_chrome_version:${ver} (informational only, not blocking) ` +
        `slug=${slug ?? '-'} ua="${ua.substring(0, 60)}"`
      );
    }
  }

  // 9. Unresolved template macros in tracking params
  const trackingStr = [ttclid, cname].filter(Boolean).join(' ');
  if (trackingStr) {
    for (const macro of UNRESOLVED_MACRO_PATTERNS) {
      if (trackingStr.includes(macro)) {
        reasons.push(`unresolved_macro:${macro}`);
        confidence = 'high';
        break;
      }
    }
  }

  const isBot         = reasons.length > 0;
  const primaryReason = reasons[0] ?? 'none';

  if (isBot) {
    console.log(
      `[BotDetection] BOT=true confidence=${confidence} route=${route} slug=${slug ?? '-'} ` +
      `platform=${platform ?? '-'} reasons=[${reasons.join(' | ')}] ` +
      `ua="${ua.substring(0, 80)}"`
    );
  }

  return { isBot, reasons, confidence, primaryReason };
}
