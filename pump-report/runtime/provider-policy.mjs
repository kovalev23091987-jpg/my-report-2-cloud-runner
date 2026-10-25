// Coordinator-owned bounded qualification. Internal limits are not claims
// about an external free quota. Production remains disabled until evidence.
export const PROVIDER_STAGE = 'SOURCE_FEASIBILITY_SINGLE';
export const PROVIDER_POLICY_VERSION = 'pump-manual-native-relative-acceptance-20261025-v1';
export const MANUAL_ACCEPTANCE_ID='pump-native-relative-manual-btc-20261025-one';
export const MANUAL_ACCEPTANCE_SYMBOL='BTC';
export const MAP_DIAGNOSTIC_ID='pump-swole-btc-20261025-one';
export const DAY_DIAGNOSTIC_ID='pump-day-window-btc-20261025-one';
export const J_DIAGNOSTIC_ID='pump-j-integration-sol-20261025-one';
export const J_DIAGNOSTIC_SYMBOL='SOL';
export const METADATA_DIAGNOSTIC_ID='pump-bingx-crypto-metadata-20261025-one';
export const CORRECTED_METADATA_ID='pump-bingx-crypto-metadata-signed-20261025-one';
export const SUMMARY_INDEX_ACCEPTANCE_ID='pump-summary-index-20261025-one';
// One fixed additional CONTROL operation directly approved by the owner.
// No other CONTROL operation, production, delivery or schedule is admitted.
export const SOURCE_FEASIBILITY_ID='pump-f550-source-feasibility-20261025-one';
export const METADATA_DIAGNOSTIC_URL='https://api-app.acc-de.com/api/coin/v1/display-info/list';
export const PROVIDER_POLICIES = Object.freeze({
  // Two separately fixed operations cumulatively: original bare1 SPENT plus
  // corrected public-client1. Same provider/version/counters, never a reset.
  BINGX_WEB_METADATA: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/CORRECTED_METADATA_SINGLE_ADMISSION.json',allowed_hosts:['api-app.acc-de.com'],allowed_paths:['/api/coin/v1/display-info/list'],project_daily_cap:2,project_monthly_cap:2,per_minute_cap:1,per_second_cap:1,qualification_attempt_cap:2,outcome_source:false,delivery_source:false},
  BINGX: {version:PROVIDER_POLICY_VERSION,evidence_ref:PROVIDER_STAGE==='SOURCE_FEASIBILITY_SINGLE'?'checkpoints/pump-report-20261025/F550_SOURCE_SINGLE_ADMISSION.json':'checkpoints/pump-report-20261025/DAY_WINDOW_NATIVE_ADMISSION.json',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/v2/server/time','/openApi/swap/v2/quote/contracts','/openApi/swap/v2/quote/ticker','/openApi/swap/v1/ticker/price','/openApi/swap/v3/quote/klines','/openApi/swap/v2/quote/depth','/openApi/swap/v2/quote/openInterest','/openApi/swap/v2/quote/premiumIndex',...(PROVIDER_STAGE==='SOURCE_FEASIBILITY_SINGLE'?['/openApi/swap/v2/quote/trades']:[])],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1,qualification_attempt_cap:24,external_quota_status:'BOUNDED_MANUAL_ACCEPTANCE_ONLY_NOT_PRODUCTION'},
  TELEGRAM: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/MANUAL_RELATIVE_MAP_ADMISSION.json',allowed_hosts:['api.telegram.org'],allowed_paths:['/bot*'],project_daily_cap:2,project_monthly_cap:2,per_minute_cap:1,qualification_attempt_cap:1,manual_acceptance_only:true,outcome_source:false},
  SWOLECHARTS: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/MANUAL_RELATIVE_MAP_ADMISSION.json',allowed_hosts:['swolecharts.com'],allowed_paths:['/api/liquidation-levels/BTC'],project_daily_cap:1,project_monthly_cap:1,per_minute_cap:1,qualification_attempt_cap:1,outcome_source:false,delivery_source:false}
});
export const QUALIFICATION_EXPIRES_TS = Date.parse('2026-10-25T20:16:00Z');
export const PROTECTED_HTTP = Object.freeze({http_by_provider:{BINGX:102,TELEGRAM:6,SWOLECHARTS:0,BINGX_WEB_METADATA:0},delivery_http:24,outcomes_http:24});
export const TELEGRAM_DIAGNOSTIC_ID='pump-delivery-qualification-20261025-one';
