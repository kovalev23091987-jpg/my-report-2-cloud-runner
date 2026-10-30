// Proposed exact saved negative decisions; no prefix/ticker/coinType classifier.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0;
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x);
const id=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?String(x):typeof x==='string'&&/^\d{1,80}$/.test(x)?x:null;
const reasons=new Set(['EXCLUDE_TRADFI_STOCK_OR_ETF','EXCLUDE_TRADFI_INDEX_OR_INDEX_ETF','EXCLUDE_TRADFI_COMMODITY_OR_METAL','EXCLUDE_TRADFI_FX']);
const tuple=row=>object(row)&&id(row.contractId)!==null&&text(row.symbol)&&text(row.asset)&&text(row.currency)&&Number.isInteger(row.status)
  ?{native_contract_id:id(row.contractId),symbol:row.symbol,asset:row.asset,currency:row.currency,status:row.status}:null;
const key=t=>t?JSON.stringify([t.native_contract_id,t.symbol,t.asset,t.currency,t.status]):null;

export function generateSavedNonTargetDecisions({native_rows,scope_rows,evidence,sha256}={}){
  if(!Array.isArray(native_rows)||native_rows.length>20000||!Array.isArray(scope_rows)||scope_rows.length>20000
    ||!hash(evidence?.catalog_file_sha256)||!hash(evidence?.economic_scope_file_sha256)||typeof sha256!=='function')throw Error('PINNED_NON_TARGET_INPUTS_REQUIRED');
  const native=native_rows.filter(object),selected=scope_rows.filter(r=>object(r)&&r.selected_for_report_scope===false&&reasons.has(r.scope_reason));
  const decisions=[],blocked=[];
  for(const s of selected){
    const matches=native.filter(n=>n.symbol===s.symbol),n=matches.length===1?matches[0]:null,t=tuple(n),issues=[];
    if(matches.length!==1)issues.push('NATIVE_SYMBOL_MISSING_OR_DUPLICATE');
    if(!t||t.native_contract_id!==s.contract_id||t.asset!==s.native_asset||s.metadata_coin_name!==s.native_asset)issues.push('EXACT_NATIVE_TO_SCOPE_TUPLE_MISMATCH');
    if(t&&(t.currency!=='USDT'||t.status!==1))issues.push('SAVED_CURRENCY_OR_STATUS_MISMATCH');
    if(t&&native.filter(r=>id(r.contractId)===t.native_contract_id).length!==1)issues.push('DUPLICATE_NATIVE_CONTRACT_ID');
    if(selected.filter(r=>r.symbol===s.symbol||r.contract_id===s.contract_id).length!==1)issues.push('DUPLICATE_SCOPE_DECISION');
    if(!text(s.classification_basis))issues.push('ORIGINAL_ECONOMIC_BASIS_REQUIRED');
    if(issues.length){blocked.push({native_symbol:s.symbol,reason_codes:issues});continue;}
    const proof={catalog_file_sha256:evidence.catalog_file_sha256,economic_scope_file_sha256:evidence.economic_scope_file_sha256,
      catalog_original_received_ts:evidence.catalog_original_received_ts??null,original_scope_reason:s.scope_reason,
      original_classification_basis:s.classification_basis,classification_inference_preserved:true};
    const digest=sha256(JSON.stringify({tuple:t,proof}));if(!hash(digest))throw Error('NON_TARGET_SHA256_REQUIRED');
    decisions.push({decision_id:'F552N:'+digest,decision:'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE',native_tuple:t,
      scope_reason:s.scope_reason,proof,current_membership_proven:false,crypto_enum_inferred:false,IO_admission:false});
  }
  return {schema:'F552_EXACT_SAVED_NON_TARGET_DECISIONS_V1',evidence:structuredClone(evidence),decisions,blocked,
    count:decisions.length,classification_rule:'EXPLICIT_FROZEN_NEGATIVE_PROOF_AND_EXACT5FIELD_TUPLE_ONLY',
    owner_gold_and_BTCETH_rules_replaced:false,new_native_IO:0};
}

export function isExactSavedNonTargetDecision(decision,row){
  const t=tuple(row),d=decision;
  return Boolean(t&&t.currency==='USDT'&&t.status===1&&object(d)&&d.decision==='KNOWN_NON_TARGET_EXACT_SAVED_TUPLE'&&reasons.has(d.scope_reason)
    &&text(d.decision_id)&&hash(d.proof?.catalog_file_sha256)&&hash(d.proof?.economic_scope_file_sha256)
    &&text(d.proof?.original_classification_basis)&&d.proof.original_scope_reason===d.scope_reason
    &&key(d.native_tuple)===key(t));
}

export function createExactSavedNonTargetClassifier({decision_bundle}={}){
  if(decision_bundle?.schema!=='F552_EXACT_SAVED_NON_TARGET_DECISIONS_V1'||!Array.isArray(decision_bundle.decisions))throw Error('EXACT_SAVED_NEGATIVE_BUNDLE_REQUIRED');
  const map=new Map();
  for(const raw of decision_bundle.decisions){
    const d=structuredClone(raw),t=d.native_tuple;
    const row={contractId:t?.native_contract_id,symbol:t?.symbol,asset:t?.asset,currency:t?.currency,status:t?.status};
    if(!isExactSavedNonTargetDecision(d,row)||map.has(key(t))
      ||d.proof.catalog_file_sha256!==decision_bundle.evidence?.catalog_file_sha256
      ||d.proof.economic_scope_file_sha256!==decision_bundle.evidence?.economic_scope_file_sha256)throw Error('INVALID_OR_DUPLICATE_SAVED_NEGATIVE_DECISION');
    map.set(key(t),d);
  }
  return {resolveCatalogDecision(row){const t=tuple(row),d=t?map.get(key(t)):null;return d?structuredClone(d):null;},
    summary(){return {known_saved_non_target_decisions:map.size,changed_or_new_tuple_result:'UNKNOWN',name_or_coinType_default:false,active_source_index_patch_applied:false};}};
}
