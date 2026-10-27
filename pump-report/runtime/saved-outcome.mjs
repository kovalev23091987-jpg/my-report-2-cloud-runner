import {textHash} from './text-hash.mjs';
import {productionRecord} from '../contracts/run-purpose.mjs';
import {plusTenPrice} from '../analytics/math.mjs';

export const SAVED_OUTCOME_READ_BOUND=4;
export const validOutcomeAnalysisKey=key=>typeof key==='string'&&/^pump:analysis:[a-f0-9]{64}$/.test(key);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const time=n=>Number.isSafeInteger(n)&&n>=0;

// This view reads existing records only. It neither selects a new anchor nor
// evaluates prices, updates statistics, collects market data or sends a card.
export async function readSavedOutcome({store,analysis_key,clock=Date.now}){
  if(typeof store?.get!=='function'||!validOutcomeAnalysisKey(analysis_key))throw Error('EXACT_SAVED_OUTCOME_ORIGINAL_REQUIRED');
  const observed_ts=clock();if(!time(observed_ts))throw Error('SAVED_OUTCOME_CLOCK_REQUIRED');
  let reads=0;
  const get=async key=>{if(++reads>SAVED_OUTCOME_READ_BOUND)throw Error('SAVED_OUTCOME_READ_BOUND');return store.get(key);};
  const finish=(status,reason,extra={})=>({schema:'PUMP_SAVED_OUTCOME_VIEW_V1',status,reason,analysis_key,
    anchor_analysis_key:null,origin:null,outcome:null,observed_ts,stored_only:true,read_only:true,
    native_PK_reads:reads,market_HTTP:0,Telegram:0,...extra});
  const quarantine=reason=>finish('QUARANTINED',reason);
  const saved=await get(analysis_key);if(!saved)return finish('NOT_FOUND','ORIGINAL_NOT_SAVED');
  const a=saved.analysis,input=saved.input;
  if(!a||!input||analysis_key!=='pump:analysis:'+await textHash(JSON.stringify(a))||
    a.instrument?.instrument_id!==input.instrument?.instrument_id||a.instrument?.asset_id!==input.instrument?.asset_id||
    a.mode!==input.mode||a.run_id!==input.run_id||a.analysis_ts!==input.analysis_ts)return quarantine('ORIGINAL_BINDING_CONFLICT');
  if(!a.ready)return finish('NOT_READY','ORIGINAL_WAS_NOT_A_READY_IDEA');
  if(!time(a.analysis_ts)||a.analysis_ts>observed_ts||typeof a.wave_id!=='string'||!a.wave_id||a.wave_id.length>512||
    typeof a.instrument?.instrument_id!=='string'||!a.instrument.instrument_id||a.instrument.instrument_id.length>512||
    /[\u0000-\u001f]/.test(a.wave_id+a.instrument.instrument_id))return quarantine('ORIGINAL_IDENTITY_OR_CLOCK_UNBOUND');
  const signal_id='pump:signal:'+a.instrument.instrument_id+':'+a.wave_id;
  const journal=await get('pump:journal:'+a.instrument.instrument_id+':'+a.wave_id);
  const signal=await get(signal_id),anchor=journal?.frozen_anchor;
  if(!anchor||!signal)return finish('ANCHOR_PENDING','SAVED_FROZEN_OUTCOME_ANCHOR_NOT_AVAILABLE',{
    anchor_analysis_key:validOutcomeAnalysisKey(anchor?.analysis_id)?anchor.analysis_id:null});
  if(!validOutcomeAnalysisKey(anchor.analysis_id)||signal.analysis_key!==anchor.analysis_id||!same(signal.origin,anchor.origin))return quarantine('FROZEN_ANCHOR_SIGNAL_CONFLICT');
  if(anchor.analysis_id!==analysis_key)return finish('OTHER_ANCHOR','THIS_WAVE_IS_MEASURED_FROM_ANOTHER_SAVED_ORIGINAL',{anchor_analysis_key:anchor.analysis_id});
  const o=signal.origin,expected={instrument_id:a.instrument.instrument_id,asset_id:a.instrument.asset_id,wave_id:a.wave_id,
    signal_id,t0:a.analysis_ts,reference_price:a.reference_price,rules_version:a.rules_version,profile_version:a.profile_version,mode:a.mode};
  const originalMap=a.liquidations?.map_mode==='WITHOUT_MAP'?'NO_MAP':a.liquidations?.status==='PARTIAL'?'PARTIAL_MAP':'MAP';
  if(anchor.analysis_sha256!==analysis_key.slice(-64)||!productionRecord(signal)||saved.evidence_class!=='OBSERVED'||
    o.run_purpose!==(input.run_purpose??a.run_purpose)||!Object.entries(expected).every(([k,v])=>o[k]===v)||
    o.ready!==true||o.map_mode!==originalMap||signal.map_mode!==(o.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP')||
    signal.signal_id!==signal_id||signal.wave_id!==o.wave_id||signal.t0!==o.t0||signal.reference_price!==o.reference_price||
    signal.instrument?.instrument_id!==o.instrument_id||signal.instrument?.asset_id!==o.asset_id||signal.mode!==o.mode||signal.deadline_ts!==o.t0+14400000||
    !Number.isFinite(o.reference_price)||o.reference_price<=0)return quarantine('SAVED_PRODUCTION_ORIGIN_CONFLICT');
  const details={anchor_analysis_key:analysis_key,origin:structuredClone(o),deadline_ts:signal.deadline_ts};
  const outcome=await get('pump:outcome:'+signal_id);
  if(!outcome)return finish(observed_ts<signal.deadline_ts?'PENDING':'NOT_CHECKED',
    observed_ts<signal.deadline_ts?'FOUR_HOUR_WINDOW_NOT_FINISHED':'OUTCOME_NOT_YET_SAVED',details);
  if(!['HIT','MISS','UNKNOWN'].includes(outcome.status)||outcome.signal_id!==signal_id||outcome.wave_id!==o.wave_id||
    outcome.t0!==o.t0||outcome.reference_price!==o.reference_price||outcome.deadline_ts!==signal.deadline_ts||
    outcome.rules_version!==o.rules_version||outcome.mode!==o.mode||outcome.map_mode!==signal.map_mode||
    outcome.target_price!==plusTenPrice(o.reference_price)||!Array.isArray(outcome.reasons)||
    !time(outcome.coverage?.covered_until_ts)||outcome.coverage.covered_until_ts>Math.min(observed_ts,signal.deadline_ts))return quarantine('SAVED_OUTCOME_ORIGIN_OR_CLOCK_CONFLICT');
  const noHitProof=outcome.coverage.no_hit_period_covered===true&&outcome.coverage.no_hit_basis==='ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET';
  if(outcome.status==='MISS'&&(observed_ts<signal.deadline_ts||outcome.coverage.covered_until_ts!==signal.deadline_ts||
    !(outcome.coverage.complete===true||noHitProof)))return quarantine('SAVED_MISS_WITHOUT_PERIOD_COVERAGE');
  const exactHit=time(outcome.hit_ts)&&outcome.hit_ts>=o.t0&&outcome.hit_ts<=Math.min(observed_ts,signal.deadline_ts);
  const interval=outcome.hit_interval,intervalHit=time(interval?.start_ts)&&time(interval?.end_ts)&&
    interval.start_ts>=o.t0&&interval.end_ts>interval.start_ts&&interval.end_ts<=Math.min(observed_ts,signal.deadline_ts);
  if(outcome.status==='HIT'&&!exactHit&&!intervalHit)return quarantine('SAVED_HIT_WITHOUT_BOUND_TIME');
  return finish('RESULT','SAVED_OUTCOME_ONLY',{...details,outcome:structuredClone(outcome)});
}
