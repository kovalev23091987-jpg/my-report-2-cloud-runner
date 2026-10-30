import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readSavedAutoCandidateObservation} from '../../operator/saved-auto-candidate-observation.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const instrument={instrument_id:'BINGX:USDT_M:测试币-USDT',asset_id:'CRYPTO:测试币',native_symbol:'测试币-USDT',base:'测试币',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'};

test('ARTIFICIAL latest AUTO refusal exposes exactly its saved input without promoting it to a signal or replaying a manual run',async()=>{
  const pin='a'.repeat(64),a={run_id:'FIXTURE_AUTO',mode:'AUTO',run_purpose:'PRODUCTION',analysis_ts:1000,ready:false,instrument,reasons:['FIXTURE_NOT_READY']};
  const key='pump:analysis:'+hash(a),original={implementation_sha256:pin,evidence_class:'OBSERVED',analysis:a,saved_ts:1100,input:{...a,facts:{price:{status:'USABLE',unit:'FIXTURE_UNIT',expires_ts:1500}}}};
  let reads=0,returned=original;
  const store={async get(k){reads++;assert.equal(k,key);return structuredClone(returned);}};
  const observation={latest_run_id:a.run_id,private_evidence:{run:{run_id:a.run_id,checked:[{analysis_key:key,analysis:a}],manual:[]}}};
  const read=()=>readSavedAutoCandidateObservation({store,observation,implementation_sha256:pin,clock:()=>2000});
  const good=await read();assert.equal(good.saved_original_bound,true);assert.equal(good.ready,false);assert.equal(reads,1);
  assert.equal(good.independent_strategy_validation,false);assert.equal(good.mandatory_fact_metadata.price.expires_ts,1500);
  assert.equal(good.market_HTTP,0);assert.equal(good.Telegram,0);assert.equal(good.scope.whole_market_claimed,false);
  returned={...original,input:{...original.input,instrument:{instrument_id:'OTHER'}}};assert.equal((await read()).saved_original_bound,false);
  returned={...original,implementation_sha256:'b'.repeat(64)};assert.equal((await read()).status,'CANDIDATE_OTHER_IMPLEMENTATION_NOT_CURRENT_PROOF');
  observation.private_evidence.run.checked[0]={analysis_key:'pump:analysis:'+'c'.repeat(64),analysis:a};reads=0;
  assert.equal((await read()).status,'SAVED_RUN_CANDIDATE_REFERENCE_MISMATCH');assert.equal(reads,0);
  observation.private_evidence.run={run_id:a.run_id,checked:[],manual:[{analysis_key:key,analysis:{...a,mode:'MANUAL'}}]};
  assert.equal((await read()).status,'NO_SAVED_AUTO_CANDIDATE_IN_LATEST_RUN');assert.equal(reads,0);
});

test('ARTIFICIAL equal incomplete identities never bind; a complete multilingual crypto identity does',async()=>{
  const pin='a'.repeat(64);
  for(const id of [{base:'测试币'}, {}, {...instrument,instrument_id:null}, {...instrument,asset_id:''}, {...instrument,venue:'OTHER'}, {...instrument,settle:'USD'}, {...instrument,classification_status:'UNKNOWN'}, {...instrument,base:'BTC'}, {...instrument,native_symbol:'ETH-USDT'},instrument]){
    const analysis={run_id:'FIXTURE_AUTO_IDENTITY',mode:'AUTO',run_purpose:'PRODUCTION',analysis_ts:1000,ready:false,instrument:id};
    const analysis_key='pump:analysis:'+hash(analysis);
    const original={implementation_sha256:pin,evidence_class:'OBSERVED',analysis,input:{...analysis},saved_ts:1100};
    let reads=0;
    const result=await readSavedAutoCandidateObservation({store:{async get(k){reads++;assert.equal(k,analysis_key);return structuredClone(original);}},observation:{latest_run_id:analysis.run_id,private_evidence:{run:{run_id:analysis.run_id,checked:[{analysis_key,analysis}]}}},implementation_sha256:pin,clock:()=>2000});
    assert.equal(reads,1);assert.equal(result.saved_original_bound,id===instrument);
    if(id===instrument)assert.equal(result.instrument_id,instrument.instrument_id);
    else assert.equal(result.instrument_id,undefined);
  }
});
