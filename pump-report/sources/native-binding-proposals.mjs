// Proposal/review boundary only. No IO, crypto classification or live admission.
import {assertInstrument, ownerInstrumentExcluded} from '../contracts/index.mjs';
import {createNativeRelativeCandleQualification} from './native-relative-qualification.mjs';

const clone = x => structuredClone(x);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 1024;
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/i.test(x);
const stable = x => Array.isArray(x) ? '['+x.map(stable).join(',')+']' : object(x)
  ? '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}' : JSON.stringify(x);
const id = x => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? String(x)
  : typeof x === 'string' && /^\d{1,80}$/.test(x) ? x : null;
const group = (rows, key) => {
  const map = new Map();
  for (const r of rows) { const k = key(r); if (k === null) continue; const xs = map.get(k) ?? []; xs.push(r); map.set(k, xs); }
  return map;
};
const tupleKeys = ['instrument_id','asset_id','venue','native_symbol','market_type','base','quote','settle','margin'];
const forbiddenAsset = base => ['PAXG','XAUT'].includes(String(base).toUpperCase()) || ownerInstrumentExcluded(base);

export function generateSavedNativeBindingProposals({native_rows, scope_rows, expected_symbols, evidence, sha256} = {}) {
  if (!Array.isArray(native_rows) || native_rows.length > 20000 || !Array.isArray(scope_rows) || scope_rows.length > 20000
    || !Array.isArray(expected_symbols) || !expected_symbols.length || expected_symbols.length > 20000 || new Set(expected_symbols).size !== expected_symbols.length
    || expected_symbols.some(s=>!text(s)||/\s/.test(s)) || typeof sha256 !== 'function') throw Error('BOUNDED_EXACT_BINDING_INPUTS_REQUIRED');
  if (!object(evidence) || !['catalog_file_sha256','economic_scope_file_sha256','selected_symbols_file_sha256'].every(k=>hex(evidence[k]))
    || !text(evidence.contract_semantics_evidence_ref)) throw Error('EXPLICIT_SAVED_INPUT_PROOFS_REQUIRED');
  const native = native_rows.filter(object), scopes = scope_rows.filter(object);
  const bySymbol = group(native,r=>typeof r.symbol==='string'?r.symbol:null), byId = group(native,r=>id(r.contractId));
  const scopeBySymbol = group(scopes,r=>typeof r.symbol==='string'?r.symbol:null);
  const proposals = expected_symbols.map(symbol=>{
    const ns=bySymbol.get(symbol)??[],ss=scopeBySymbol.get(symbol)??[],issues=[];
    const n=ns.length===1?ns[0]:null,s=ss.length===1?ss[0]:null;
    if(ns.length!==1)issues.push(ns.length?'AMBIGUOUS_NATIVE_SYMBOL':'NATIVE_SYMBOL_MISSING');
    if(ss.length!==1)issues.push(ss.length?'AMBIGUOUS_ECONOMIC_SCOPE_ROW':'ECONOMIC_SCOPE_ROW_MISSING');
    const contractId=n?id(n.contractId):null;
    if(n&&(contractId===null||(byId.get(contractId)??[]).length!==1))issues.push('NATIVE_CONTRACT_ID_MISSING_OR_DUPLICATE');
    if(n&&(n.status!==1||n.currency!=='USDT'))issues.push('SAVED_NATIVE_STATUS_OR_USDT_CURRENCY_MISMATCH');
    if(n&&(!text(n.asset)||symbol!==n.asset+'-USDT'))issues.push('NATIVE_ASSET_SYMBOL_RELATION_MISMATCH');
    if(!/^[^\s/?&#]{1,120}-USDT$/.test(symbol))issues.push('NATIVE_SYMBOL_UNSUPPORTED_BY_EXISTING_SOURCE_SEAM');
    if(n&&forbiddenAsset(n.asset))issues.push('OWNER_EXCLUDED_ASSET');
    if(s&&(s.selected_for_report_scope!==true||s.scope_reason!=='INCLUDE_CRYPTO_SCOPE'
      ||s.crypto_economic_scope_before_owner_exclusion!==true))issues.push('EXPLICIT_SELECTED_ECONOMIC_PROOF_REQUIRED');
    if(n&&s&&(s.contract_id!==contractId||s.native_asset!==n.asset||s.metadata_coin_name!==n.asset))issues.push('EXACT_NATIVE_TO_SELECTED_PROOF_MISMATCH');
    if(s&&!text(s.classification_basis))issues.push('ECONOMIC_INFERENCE_BASIS_REQUIRED');
    const tuple=n&&contractId!==null?{instrument_id:`BINGX:USDT_M:${contractId}:${symbol}`,asset_id:`BINGX_UNDERLYING:${n.asset}`,
      venue:'BINGX',native_symbol:symbol,market_type:'PERPETUAL',base:n.asset,quote:'USDT',settle:'USDT',margin:'USDT'}:null;
    const proof={native_contract_id:contractId,selected_economic_basis:s?.classification_basis??null,
      metadata_coin_id:s?.metadata_coin_id??null,metadata_coinName:s?.metadata_coin_name??null,
      contractId_coinId_same_namespace:false,coinId_numeric_equality_required:false,...clone(evidence)};
    const h=sha256(stable({tuple,proof}));if(!hex(h))throw Error('SYNCHRONOUS_SHA256_REQUIRED');
    return {proposal_id:'F552:'+h.toLowerCase(),native_symbol:symbol,status:issues.length?'BLOCKED_SAVED_BINDING':'PROPOSED_SAVED_NATIVE_BINDING',
      reason_codes:issues,tuple,proposed_instrument:tuple?{...tuple,classification_status:'PROPOSED_ECONOMIC_SCOPE',
        identity_evidence_ref:null,price_tick:null,quantity_step:null,contract_multiplier:null,
        canonical_cross_venue_identity_qualified:false}:null,
      native_contract_id:contractId,native_status_at_capture:n?.status??null,current_membership:'NOT_CHECKED_HISTORICAL_CAPTURE',
      display_name:s?.metadata_display_name??null,display_name_used_as_identity:false,proof,
      review_required:'ROOT explicit per-tuple identity classification decision before VERIFIED_CRYPTO/resolver activation; this proposal is not that decision',
      price_plan:{native_quote:'USDT',native_price_base:n?.asset??null,normalize_numeric_prefix:false,
        live_price_requires:'Exact native identity + actual response symbol/positiveprice/original source clock/freshness',runtime_price_qualification_token_created:false},
      candle_plan:{factory:'createNativeRelativeCandleQualification',interval_ms:60000,scope:'EXACT_NATIVE_INSTRUMENT_ROUTE_FIELD_INTERVAL_ONLY',
        time_basis:'OWNER_ACCEPTED_CCXT_CONSUMER_OPEN_TIME_NOT_VENDOR_GUARANTEE',volume_unit:'UNKNOWN_NATIVE_REPORTED_QUANTITY',
        absolute_BASE_qualified:false,absolute_USDT_qualified:false,materialize_only_after_reviewed_instrument:true},
      execution_units:{base_quantity:null,quantity_step:null,contract_multiplier:null,price_tick:null,
        orderbook_qualified:false,native_size_used_as_multiplier:false,numeric_prefix_used_as_multiplier:false},
      full_CORE_qualified:false,provider_SQL_runtime_admission:false};
  });
  return {schema:'F552_SAVED_NATIVE_BINDING_PROPOSALS_V1',expected:expected_symbols.length,proposed:proposals.filter(p=>p.status==='PROPOSED_SAVED_NATIVE_BINDING').length,
    blocked:proposals.filter(p=>p.status!=='PROPOSED_SAVED_NATIVE_BINDING').length,auto_VERIFIED_CRYPTO:0,
    economic_scope_not_current_operational_coverage:true,evidence:clone(evidence),proposals};
}

function reviewedCandlePatch(proposal,instrument) {
  if(proposal?.status!=='PROPOSED_SAVED_NATIVE_BINDING')throw Error('UNBLOCKED_NATIVE_PROPOSAL_REQUIRED');
  assertInstrument(instrument); // Consumes an existing ROOT decision; never creates it.
  if(tupleKeys.some(k=>instrument[k]!==proposal.tuple[k])||!text(instrument.identity_evidence_ref))throw Error('REVIEWED_IDENTITY_MUST_MATCH_EXACT_PROPOSAL_TUPLE');
  if(['price_tick','quantity_step','contract_multiplier'].some(k=>instrument[k]!=null)
    ||instrument.canonical_cross_venue_identity_qualified===true)throw Error('EXECUTION_OR_CROSS_VENUE_UNITS_OUTSIDE_THIS_REVIEW_SCOPE');
  return createNativeRelativeCandleQualification(instrument,60000);
}
export function proposeReviewedRelativeCandlePatch({proposal, reviewed_instrument} = {}) {
  return {schema:'F552_REVIEWED_BINDING_RELATIVE_CANDLE_PATCH_PROPOSAL_V1',proposal_id:proposal?.proposal_id,
    instrument_id:reviewed_instrument?.instrument_id,candles:reviewedCandlePatch(proposal,reviewed_instrument),
    identity_classification_created:false,execution_qualifications_added:false,current_native_data_or_IO_admission:false};
}

export function createProposalAwareIdentityResolver({existing_entries=[],proposal_bundle,reviewed_entries=[]} = {}) {
  if(!Array.isArray(existing_entries)||!Array.isArray(reviewed_entries)||proposal_bundle?.schema!=='F552_SAVED_NATIVE_BINDING_PROPOSALS_V1'
    ||!Array.isArray(proposal_bundle.proposals)||proposal_bundle.proposals.length>20000)throw Error('PROPOSAL_RESOLVER_INPUTS_REQUIRED');
  const originals=clone(existing_entries),accepted=clone(existing_entries),proposals=clone(proposal_bundle.proposals);
  const proposalById=new Map(proposals.map(p=>[p.proposal_id,p]));
  if(proposalById.size!==proposals.length)throw Error('DUPLICATE_PROPOSAL_ID');
  for(const entry of originals)assertInstrument(entry.instrument??entry);
  for(const entry of reviewed_entries){
    const review=entry?.binding_review,p=proposalById.get(review?.proposal_id),instrument=entry?.instrument;
    if(review?.decision!=='ROOT_REVIEWED_NATIVE_SCOPE_PRICE_RELATIVE_ONLY'||!text(review.decision_ref)
      ||!text(review.classification_evidence_ref)||review.classification_evidence_ref!==instrument?.identity_evidence_ref
      ||review.economic_scope_file_sha256!==proposal_bundle.evidence?.economic_scope_file_sha256
      ||review.catalog_file_sha256!==proposal_bundle.evidence?.catalog_file_sha256)throw Error('EXPLICIT_TUPLE_BOUND_ROOT_REVIEW_REQUIRED');
    const candles=reviewedCandlePatch(p,instrument);
    if(entry.native_contract_id!==undefined&&String(entry.native_contract_id)!==p.native_contract_id)throw Error('REVIEWED_NATIVE_CONTRACT_ID_MISMATCH');
    if(Object.keys(entry.qualifications??{}).some(k=>k!=='candles')||(entry.liquidations?.routes??[]).length)throw Error('EXECUTION_OR_OPTIONAL_QUALIFICATIONS_NOT_IN_REVIEW_SCOPE');
    const prior=originals.find(e=>(e.instrument??e).instrument_id===instrument.instrument_id);
    if(prior)throw Error('EXISTING_RETAINED_ENTRY_MUST_NOT_BE_REPLACED');
    // New price/relative-only entries get no copied SOL execution/OI/map proof.
    accepted.push({instrument:clone(instrument),native_contract_id:p.native_contract_id,native_base:instrument.base,family:'USDT_M',
      qualifications:{candles},liquidations:{routes:[]},binding_review:clone(review),
      limitations:['SAVED_NATIVE_MEMBERSHIP_NOT_CURRENT','PRICE_AND_RELATIVE_CANDLE_SCOPE_ONLY','EXECUTION_QUANTITY_AND_MULTIPLIER_UNKNOWN','CORE_NOT_QUALIFIED','ROOT_LIVE_ADMISSIONS_SEPARATE']});
  }
  const seenId=new Set(),seenSymbol=new Set();
  for(const e of accepted){const i=e.instrument??e;if(seenId.has(i.instrument_id)||seenSymbol.has(i.native_symbol))throw Error('AMBIGUOUS_REVIEWED_OR_EXISTING_IDENTITY');seenId.add(i.instrument_id);seenSymbol.add(i.native_symbol);}
  const matches=(p,q)=>object(q)&&(text(q.instrument_id)||text(q.native_symbol))
    && tupleKeys.every(k=>q[k]===undefined||q[k]===(k==='native_symbol'?p.native_symbol:p.tuple?.[k])) && (q.family===undefined||q.family==='USDT_M')
    && (q.native_contract_id===undefined||String(q.native_contract_id)===p.native_contract_id);
  return {
    resolve(query){
      if(!object(query)||!text(query.instrument_id)&&!text(query.native_symbol))return null;
      const xs=accepted.filter(e=>{const i=e.instrument??e;return tupleKeys.every(k=>query[k]===undefined||query[k]===i[k]) && (query.family===undefined||query.family==='USDT_M')
        &&(query.native_contract_id===undefined||String(query.native_contract_id)===String(e.native_contract_id??i.native_contract_id));});
      return xs.length===1?clone(xs[0]):null;
    },
    resolveProposal(query){const xs=proposals.filter(p=>matches(p,query));return xs.length===1?clone(xs[0]):null;},
    summary(){return {existing_entries:originals.length,explicit_reviewed_added:reviewed_entries.length,proposal_records:proposals.length,
      proposals_without_resolved_entry:proposals.filter(p=>!accepted.some(e=>(e.instrument??e).instrument_id===p.tuple?.instrument_id)).length,
      default_auto_promotions:0,operational_native_coverage_measured:false};}
  };
}
