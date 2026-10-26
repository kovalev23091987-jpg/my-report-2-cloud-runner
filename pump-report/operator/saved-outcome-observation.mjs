import {createHash} from 'node:crypto';

const sha=text=>createHash('sha256').update(text).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Read the already persisted result; never collect prices or evaluate a strategy.
export async function readSavedOutcomeObservation({store,observation}){
  const result={schema:'PUMP_SAVED_SELECTED_OUTCOME_OBSERVATION_V1',status:'DELIVERY_NOT_BOUND',
    saved_outcome_bound:false,underlying_market_history_independently_verified:false,
    strategy_recomputed:false,market_HTTP:0,Telegram:0,private_evidence:{journal:null,signal:null,outcome:null}};
  if(observation?.first_genuine_same_original_SENT_observed!==true||observation.checks?.same_original!==true||observation.checks?.receipt_bound!==true)return result;
  const a=observation.private_evidence?.original?.analysis,id=a?.instrument?.instrument_id,wave=a?.wave_id;
  if(typeof id!=='string'||!id||id.length>180||typeof wave!=='string'||!wave||wave.length>180){result.status='SIGNAL_IDENTITY_UNBOUND';return result;}
  const signal_key='pump:signal:'+id+':'+wave,journal_key='pump:journal:'+id+':'+wave;
  result.signal_key=signal_key;result.journal_key=journal_key;
  const journal=await store.get(journal_key),signal=await store.get(signal_key);
  result.private_evidence.journal=journal;result.private_evidence.signal=signal;
  if(!journal||!signal){result.status='ORIGINAL_SIGNAL_NOT_YET_PERSISTED';return result;}
  const anchor=journal.frozen_anchor,origin=signal.origin;
  const same=Boolean(anchor?.analysis_id===observation.analysis_key&&anchor.analysis_sha256===sha(JSON.stringify(a))&&
    anchor.immutable===true&&equal(anchor.origin,origin)&&signal.analysis_key===observation.analysis_key&&
    signal.original_card_id===observation.card_id&&signal.signal_id===signal_key&&origin?.signal_id===signal_key&&
    signal.wave_id===wave&&origin.wave_id===wave&&origin.instrument_id===id&&origin.asset_id===a.instrument.asset_id&&
    origin.evidence_class==='OBSERVED'&&origin.run_purpose==='PRODUCTION'&&origin.ready===true&&
    origin.mode==='AUTO'&&signal.mode==='AUTO'&&origin.t0===a.analysis_ts&&signal.t0===origin.t0&&
    origin.reference_price===a.reference_price&&signal.reference_price===origin.reference_price&&
    origin.rules_version===a.rules_version&&signal.rules_version===origin.rules_version&&
    equal(signal.instrument,a.instrument)&&signal.deadline_ts===origin.t0+14400000);
  if(!same){result.status='SAVED_SIGNAL_ORIGINAL_BINDING_MISMATCH';return result;}
  const outcome_key='pump:outcome:'+signal_key,outcome=await store.get(outcome_key);
  result.outcome_key=outcome_key;result.private_evidence.outcome=outcome;
  if(!outcome){result.status='NO_SAVED_OUTCOME_YET';return result;}
  const bound=outcome.signal_id===signal_key&&outcome.wave_id===wave&&outcome.t0===origin.t0&&
    outcome.reference_price===origin.reference_price&&outcome.rules_version===origin.rules_version&&
    outcome.mode===signal.mode&&outcome.map_mode===signal.map_mode&&outcome.deadline_ts===signal.deadline_ts&&
    ['HIT','MISS','UNKNOWN'].includes(outcome.status);
  result.saved_outcome_bound=bound;
  result.status=bound?'BOUND_SAVED_OUTCOME_'+outcome.status:'SAVED_OUTCOME_ORIGINAL_BINDING_MISMATCH';
  result.outcome_sha256=sha(JSON.stringify(outcome));
  return result;
}
