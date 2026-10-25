// Coordinator-owned bounded qualification. Internal limits are not claims
// about an external free quota. Production remains disabled until evidence.
export const PROVIDER_STAGE = 'MANUAL_ACCEPTANCE';
export const PROVIDER_POLICY_VERSION = 'pump-manual-native-relative-acceptance-20261025-v1';
export const MANUAL_ACCEPTANCE_ID='pump-native-relative-manual-btc-20261025-one';
export const MANUAL_ACCEPTANCE_SYMBOL='BTC';
export const MAP_DIAGNOSTIC_ID='pump-swole-btc-20261025-one';
export const PROVIDER_POLICIES = Object.freeze({
  BINGX: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/MANUAL_RELATIVE_MAP_ADMISSION.json',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/v2/server/time','/openApi/swap/v2/quote/contracts','/openApi/swap/v2/quote/ticker','/openApi/swap/v1/ticker/price','/openApi/swap/v3/quote/klines','/openApi/swap/v2/quote/depth','/openApi/swap/v2/quote/openInterest','/openApi/swap/v2/quote/premiumIndex'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1,qualification_attempt_cap:24,external_quota_status:'BOUNDED_MANUAL_ACCEPTANCE_ONLY_NOT_PRODUCTION'},
  TELEGRAM: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/MANUAL_RELATIVE_MAP_ADMISSION.json',allowed_hosts:['api.telegram.org'],allowed_paths:['/bot*'],project_daily_cap:2,project_monthly_cap:2,per_minute_cap:1,qualification_attempt_cap:1,manual_acceptance_only:true,outcome_source:false},
  SWOLECHARTS: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/MANUAL_RELATIVE_MAP_ADMISSION.json',allowed_hosts:['swolecharts.com'],allowed_paths:['/api/liquidation-levels/BTC'],project_daily_cap:1,project_monthly_cap:1,per_minute_cap:1,qualification_attempt_cap:1,outcome_source:false,delivery_source:false}
});
export const QUALIFICATION_EXPIRES_TS = Date.parse('2026-10-25T14:20:00Z');
export const PROTECTED_HTTP = Object.freeze({http_by_provider:{BINGX:102,TELEGRAM:6,SWOLECHARTS:0},delivery_http:24,outcomes_http:24});
export const TELEGRAM_DIAGNOSTIC_ID='pump-delivery-qualification-20261025-one';
