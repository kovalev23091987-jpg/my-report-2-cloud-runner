/**
 * TZ 10.1 HTX fee receipt boundary.
 *
 * A fee schedule can be sealed from either an authenticated account-effective
 * HTX rate (preferred) or an explicitly verified current official HTX
 * conservative taker rate for unknown-account market analysis. Generic public
 * base-tier assumptions are rejected. The adapter never stores credentials.
 */
import { immutableReceipt } from './upstream-proof-utils.mjs';
export const TZ101_FEE_SOURCE_VERSION='tz101-htx-fee-source-r9';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;
function out(status,reason,extra={}){return {version:TZ101_FEE_SOURCE_VERSION,status,reason,fee_schedule:null,credentials_stored:false,automatic_trade:false,...extra};}
export function buildHtxFeeScheduleReceipt({contract_code:contract,source_record:src,observed_ts:now=Date.now()}={}){
  if(!text(contract)||!/^[A-Z0-9]{1,24}-USDT$/.test(contract)) return out('NOT_CLOSED','CONTRACT_IDENTITY_INVALID');
  if(!obj(src)) return out('NOT_CLOSED','FACTUAL_FEE_SOURCE_MISSING');
  if(src.venue!=='HTX'||src.market_type!=='USDT_PERP'||src.contract_code!==contract||src.fee_role!=='TAKER')
    return out('NOT_CLOSED','FEE_SOURCE_IDENTITY_NOT_PROVEN');
  const sourceKind=String(src.source_kind||'');
  if(!['ACCOUNT_EFFECTIVE_RATE','OFFICIAL_CONSERVATIVE_RATE'].includes(sourceKind)) return out('NOT_CLOSED','FACTUAL_FEE_SOURCE_NOT_PROVEN');
  if(!text(src.source_receipt_id)||!stamp(src.source_ts)||!stamp(src.valid_until_ts)||!stamp(now)||src.source_ts>now||src.valid_until_ts<now)
    return out('NOT_CLOSED','FEE_PROVENANCE_OR_FRESHNESS_INVALID');
  if(!finite(src.entry_rate)||!finite(src.exit_rate)||src.entry_rate<0||src.exit_rate<0||src.entry_rate>0.05||src.exit_rate>0.05)
    return out('NOT_CLOSED','FEE_RATE_INVALID');
  // Secrets/tokens/private API signatures are forbidden in the factual record.
  const forbidden=['api_key','secret','token','signature','password','cookie','authorization'];
  const keys=Object.keys(src).map(k=>k.toLowerCase());
  if(forbidden.some(k=>keys.some(x=>x.includes(k)))) return out('NOT_CLOSED','SECRET_BEARING_FEE_RECORD_FORBIDDEN');
  let accountScope=null, sourceAuthority=null, conservative=false;
  if(sourceKind==='ACCOUNT_EFFECTIVE_RATE') {
    if(!text(src.account_scope_fingerprint)||src.account_scope_fingerprint.length<8) return out('NOT_CLOSED','ACCOUNT_EFFECTIVE_FEE_SCOPE_NOT_PROVEN');
    accountScope=src.account_scope_fingerprint;
  } else {
    if(src.source_authority!=='HTX_OFFICIAL'||src.conservative_for_unknown_account!==true||!text(src.source_url)||!/^https:\/\/(www\.)?htx\.com\//i.test(src.source_url))
      return out('NOT_CLOSED','OFFICIAL_CONSERVATIVE_FEE_SOURCE_NOT_PROVEN');
    sourceAuthority='HTX_OFFICIAL'; conservative=true;
  }
  const material={schema_version:'tz101-htx-fee-schedule-v1',status:'CLOSED',venue:'HTX',market_type:'USDT_PERP',contract_code:contract,fee_role:'TAKER',entry_rate:src.entry_rate,exit_rate:src.exit_rate,
    source_kind:sourceKind,source_receipt_id:src.source_receipt_id,source_ts:src.source_ts,valid_until_ts:src.valid_until_ts,
    ...(accountScope?{account_scope_fingerprint:accountScope}:{}),...(sourceAuthority?{source_authority:sourceAuthority,source_url:src.source_url,conservative_for_unknown_account:conservative}:{}),};
  const receipt=immutableReceipt(material,`FEE:${contract}:${src.source_receipt_id}`,src.source_ts);
  return out('CLOSED',null,{fee_schedule:receipt});
}

// Backward-compatible export used by R8/R9 call sites.
export const buildHtxAccountFeeScheduleReceipt=buildHtxFeeScheduleReceipt;
