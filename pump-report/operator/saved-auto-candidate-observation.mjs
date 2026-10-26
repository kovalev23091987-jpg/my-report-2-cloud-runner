import {createHash} from 'node:crypto';
import {assertInstrument,ownerInstrumentExcluded} from '../contracts/index.mjs';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const time=n=>Number.isSafeInteger(n)&&n>=0;
const instrumentValid=instrument=>{try{assertInstrument(instrument);return !ownerInstrumentExcluded(instrument);}catch{return false;}};

// One original from the latest saved AUTO, including an honest NOT_READY.
// Source/analytics reviewers receive this same input without another market run.
export async function readSavedAutoCandidateObservation({store,observation,implementation_sha256,clock=Date.now}){
  if(!/^[a-f0-9]{64}$/.test(implementation_sha256??''))throw Error('EXACT_CANDIDATE_IMPLEMENTATION_REQUIRED');
  const run=observation?.private_evidence?.run,run_id=observation?.latest_run_id;
  const result={schema:'PUMP_SAVED_AUTO_CANDIDATE_OBSERVATION_V1',status:'NO_SAVED_AUTO_CANDIDATE_IN_LATEST_RUN',
    saved_original_bound:false,market_HTTP:0,Telegram:0,independent_strategy_validation:false,
    scope:{maximum_selected_originals:1,whole_history_claimed:false,whole_market_claimed:false},private_evidence:{original:null}};
  if(!run||run.run_id!==run_id||!Array.isArray(run.checked))return result;
  const selected=run.checked.find(row=>row?.analysis?.mode==='AUTO'&&row.analysis.run_purpose==='PRODUCTION'&&row.analysis.run_id===run_id);
  if(!selected)return result;
  if(!/^pump:analysis:[a-f0-9]{64}$/.test(selected.analysis_key??'')||selected.analysis_key!=='pump:analysis:'+sha(selected.analysis)){
    result.status='SAVED_RUN_CANDIDATE_REFERENCE_MISMATCH';return result;
  }
  const original=await store.get(selected.analysis_key),at=clock();result.observed_ts=at;result.analysis_key=selected.analysis_key;result.private_evidence.original=original;
  if(original?.implementation_sha256!==implementation_sha256){result.status='CANDIDATE_OTHER_IMPLEMENTATION_NOT_CURRENT_PROOF';return result;}
  const a=original?.analysis,i=original?.input;
  const bound=Boolean(a&&i&&original.evidence_class==='OBSERVED'&&equal(a,selected.analysis)&&
    a.mode==='AUTO'&&i.mode==='AUTO'&&a.run_purpose==='PRODUCTION'&&i.run_purpose==='PRODUCTION'&&
    a.run_id===run_id&&i.run_id===run_id&&instrumentValid(a.instrument)&&equal(a.instrument,i.instrument)&&a.analysis_ts===i.analysis_ts&&
    typeof a.ready==='boolean'&&
    time(a.analysis_ts)&&time(original.saved_ts)&&a.analysis_ts<=original.saved_ts&&original.saved_ts<=at);
  result.saved_original_bound=bound;result.status=bound?'BOUND_SAVED_AUTO_CANDIDATE_ORIGINAL':'SAVED_AUTO_CANDIDATE_ORIGINAL_BINDING_MISMATCH';
  if(bound){result.instrument_id=a.instrument.instrument_id;result.ready=a.ready;result.analysis_ts=a.analysis_ts;
    result.mandatory_fact_metadata=Object.fromEntries(['price','candles','orderbook'].map(k=>{const f=i.facts?.[k];return[k,f?Object.fromEntries(['status','unit','reason','event_ts','received_ts','expires_ts'].map(p=>[p,f[p]??null])):null];}));}
  return result;
}
