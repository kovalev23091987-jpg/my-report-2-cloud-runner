// Coordinator-owned bounded qualification. Internal limits are not claims
// about an external free quota. Production remains disabled until evidence.
export const PROVIDER_STAGE = 'QUALIFICATION_ONLY';
export const PROVIDER_POLICY_VERSION = 'pump-provider-qualification-20261025-v1';
export const PROVIDER_POLICIES = Object.freeze({
  BINGX: {version:PROVIDER_POLICY_VERSION,evidence_ref:'checkpoints/pump-report-20261025/PROVIDER_QUALIFICATION_ADMISSION.json',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/v2/server/time','/openApi/swap/v2/quote/contracts','/openApi/swap/v2/quote/ticker','/openApi/swap/v1/ticker/price','/openApi/swap/v3/quote/klines','/openApi/swap/v2/quote/depth','/openApi/swap/v2/quote/openInterest','/openApi/swap/v2/quote/premiumIndex'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1,qualification_attempt_cap:5,external_quota_status:'NOT_YET_PROVEN_FOR_PRODUCTION'},
  TELEGRAM: {version:PROVIDER_POLICY_VERSION,evidence_ref:'NOT_ADMITTED_YET',allowed_hosts:['api.telegram.org'],allowed_paths:[],project_daily_cap:0,project_monthly_cap:0,per_minute_cap:0}
});
export const QUALIFICATION_EXPIRES_TS = 1792935093000;
export const PROTECTED_HTTP = Object.freeze({http_by_provider:{BINGX:102,TELEGRAM:6},delivery_http:24,outcomes_http:24});
