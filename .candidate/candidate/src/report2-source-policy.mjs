export const REPORT2_SOURCE_POLICY_VERSION = 'report2-source-policy-v1';
export const REPORT2_PROJECT_SCOPE = 'MY_REPORT_2';

// Runtime/autonomous sources embedded in the Worker. These are the only source
// labels allowed to be produced directly by the current Worker code.
export const REPORT2_RUNTIME_SOURCE_ALLOWLIST = Object.freeze(new Set([
  'HTX_OFFICIAL_VIA_REPORT2_HUB',
  'Bybit Public V5',
  'OKX Public V5',
  'Binance USD-M Public',
  'OKX Spot Public V5',
  'EXTERNAL_EVIDENCE_REQUIRED',
  'HTX_TIMING_EXISTING_ONLY',
  'ByKaranteli Smart Money Public API',
]));

// Sources approved for the wider Report 2 orchestration layer. Presence in this
// list does NOT automatically make a source independent or eligible for chain
// closure; normal identity/freshness/coverage/conflict rules still apply.
export const REPORT2_ORCHESTRATION_SOURCE_ALLOWLIST = Object.freeze(new Set([
  'Report 2 HUB Final v2',
  'HTX official public API',
  'Bybit',
  'OKX',
  'Binance',
  'Gate Market Data',
  'Coinfuty Derivatives',
  'CryptoStruct Market Data',
  'TRADER.PRO',
  'Buildix',
  'ByKaranteli Market Data',
  '0xArchive',
  'Coinversa Pulse',
  'CoinLobster Whale Flow',
  'Santiment',
  'Token Economics',
  'Token Terminal',
  'CoinGecko',
  'CoinMarketCap',
  'DefiLlama',
  'Dune',
  'Blockscout',
  'VYX Order Flow',
]));

// Cross-project tools that must never be routed into Report 2 unless the user
// explicitly changes this policy in a future dedicated engineering stage.
export const REPORT2_DENYLIST = Object.freeze(new Set([
  'TinyFish',
  'Kwork',
  'Figma',
  'Canva',
  'Gmail',
  'Google Calendar',
  'Google Drive',
  'Slack',
  'Notion',
  'Shopify',
  'Webflow',
  'Resume.io',
]));

export function isReport2RuntimeSourceAllowed(source) {
  return REPORT2_RUNTIME_SOURCE_ALLOWLIST.has(String(source ?? '').trim());
}

export function isReport2OrchestrationSourceAllowed(source) {
  const s = String(source ?? '').trim();
  return REPORT2_RUNTIME_SOURCE_ALLOWLIST.has(s) || REPORT2_ORCHESTRATION_SOURCE_ALLOWLIST.has(s);
}

export function sourcePolicyDecision(source, { runtime = false } = {}) {
  const s = String(source ?? '').trim();
  if (!s) return { allowed: false, reason: 'SOURCE_MISSING', project_scope: REPORT2_PROJECT_SCOPE };
  if (REPORT2_DENYLIST.has(s)) return { allowed: false, reason: 'CROSS_PROJECT_SOURCE_DENIED', project_scope: REPORT2_PROJECT_SCOPE };
  const allowed = runtime ? isReport2RuntimeSourceAllowed(s) : isReport2OrchestrationSourceAllowed(s);
  return {
    allowed,
    reason: allowed ? null : 'SOURCE_NOT_ALLOWLISTED',
    project_scope: REPORT2_PROJECT_SCOPE,
  };
}
