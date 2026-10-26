import {createNativeRelativeCandleQualification} from '../sources/native-relative-qualification.mjs';
import {createExactSavedNonTargetClassifier} from '../sources/saved-nontarget-decisions.mjs';
import {assertInstrument,ownerInstrumentExcluded} from '../contracts/index.mjs';
import {REVIEWED_ROWS,REVIEW_REF,CATALOG_SHA,ECONOMIC_SHA} from './native-reviewed550-data.mjs';
import {NON_TARGET_BUNDLE} from './native-nontarget380-data.mjs';
import {REACTIVATED_NEGATIVE_BUNDLE} from './native-reactivated53-data.mjs';
import {USDKRW_NEGATIVE_BUNDLE} from './native-usdkrw1-data.mjs';
import {reviewedNativeExecution} from './native-execution-qualifications.mjs';

// This frozen overlay consumes ROOT's explicit classification decisions. It
// supplies no membership, execution units, native-data receipt or IO admission.
export function createReviewedNativeScopeRegistry(existing_entries){
  if(!Array.isArray(existing_entries)||existing_entries.length!==13||REVIEWED_ROWS.length!==539)throw Error('FROZEN_RETAINED13_AND_REVIEWED539_REQUIRED');
  const byId=new Map(),bySymbol=new Map(),retainedIds=new Set(existing_entries.map(e=>e.instrument.instrument_id));
  const add=raw=>{const e=reviewedNativeExecution(raw);assertInstrument(e.instrument);if(byId.has(e.instrument.instrument_id)||bySymbol.has(e.instrument.native_symbol))throw Error('REVIEWED_NATIVE_SCOPE_CONFLICT');byId.set(e.instrument.instrument_id,e);bySymbol.set(e.instrument.native_symbol,e);};
  for(const e of existing_entries)add(structuredClone(e));
  for(const [native_contract_id,base,native_symbol,proposal_id,decision_sha256] of REVIEWED_ROWS){
    if(native_symbol!==base+'-USDT'||['BTC','ETH','PAXG','XAUT'].includes(base)||!/^[a-f0-9]{64}$/.test(decision_sha256))throw Error('FROZEN_NATIVE_REVIEW_ROW_CONFLICT');
    const identity_evidence_ref='ROOT_F552_NATIVE_SCOPE_REVIEW:sha256:'+decision_sha256;
    const instrument={instrument_id:'BINGX:USDT_M:'+native_contract_id+':'+native_symbol,asset_id:'BINGX_UNDERLYING:'+base,venue:'BINGX',native_symbol,market_type:'PERPETUAL',base,quote:'USDT',settle:'USDT',margin:'USDT',classification_status:'VERIFIED_CRYPTO',identity_evidence_ref,price_tick:null,quantity_step:null,contract_multiplier:null,canonical_cross_venue_identity_qualified:false};
    add({instrument,native_contract_id,native_base:base,family:'USDT_M',qualifications:{candles:createNativeRelativeCandleQualification(instrument)},liquidations:{routes:[]},binding_review:{proposal_id,decision:'ROOT_REVIEWED_NATIVE_SCOPE_PRICE_RELATIVE_ONLY',decision_ref:REVIEW_REF+'#'+decision_sha256,classification_evidence_ref:identity_evidence_ref,catalog_file_sha256:CATALOG_SHA,economic_scope_file_sha256:ECONOMIC_SHA},limitations:['CLASSIFICATION_ECONOMIC_INFERENCE_EXPLICIT','SAVED_MEMBERSHIP_NOT_CURRENT','NEW_PRICE_RELATIVE_CANDLES_ONLY','EXECUTION_QUANTITY_MULTIPLIER_UNKNOWN','CORE_REQUIRES_QUALIFIED_LIQUIDITY','ACTUAL_IO_ADMISSION_SEPARATE']});
  }
  const negative=createExactSavedNonTargetClassifier({decision_bundle:NON_TARGET_BUNDLE});
  const reactivatedNegative=createExactSavedNonTargetClassifier({decision_bundle:REACTIVATED_NEGATIVE_BUNDLE});
  const usdkrwNegative=createExactSavedNonTargetClassifier({decision_bundle:USDKRW_NEGATIVE_BUNDLE});
  return {instruments:structuredClone(existing_entries),resolve(query){
    if(!query||typeof query!=='object'||!query.instrument_id&&!query.native_symbol)return null;
    const entry=query.instrument_id?byId.get(query.instrument_id):bySymbol.get(query.native_symbol);if(!entry)return null;
    for(const [k,v] of Object.entries(query)){
      if(k==='native_contract_id'){if(String(v)!==entry.native_contract_id)return null;}
      else if(k==='family'){if(v!=='USDT_M')return null;}
      else if(v!==undefined&&entry.instrument[k]!==v)return null;
    }
    return structuredClone(entry);
  },resolveCatalogDecision:row=>negative.resolveCatalogDecision(row)??reactivatedNegative.resolveCatalogDecision(row)??usdkrwNegative.resolveCatalogDecision(row),summary:()=>({retained_entries:13,explicit_reviewed_added:539,saved_native_identities:552,owner_selected_scope:550,known_saved_nontargets:434,original_saved_nontargets:380,reactivated_saved_nontargets:53,usdkrw_saved_nontarget:1,current_membership_proven:false,new_execution_units_qualified:false,
    scoped_new_execution_unit_reviews:[...byId.values()].filter(e=>!retainedIds.has(e.instrument.instrument_id)&&e.qualifications.orderbook).length,
    selected_native_coin_unit_semantics_qualified:[...byId.values()].filter(e=>!ownerInstrumentExcluded(e.instrument)&&e.qualifications.orderbook).length,
    selected_native_coin_unit_unknown:[...byId.values()].filter(e=>!ownerInstrumentExcluded(e.instrument)&&!e.qualifications.orderbook).length,
    full_CORE550_qualified:false,review_ref:REVIEW_REF})};
}
