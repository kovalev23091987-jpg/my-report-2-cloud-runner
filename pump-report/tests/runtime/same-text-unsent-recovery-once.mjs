import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery as proposed} from '../../runtime/delivery.mjs';
import {createDelivery as baseline} from '../../.private/same-text-recovery-20261027/baseline/runtime/delivery.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_NEW_SAME_TEXT_RECOVERY_CASE');
assert.ok(Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts&&own.owner===a.own_lease.owner&&!own.released);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const bytes=fs.readFileSync(a.cached_baseline);assert.equal(sha(bytes),a.cached_baseline_sha256);
const cached=JSON.parse(bytes).cases.find(c=>c.case_id==='AIN_AUTO_20261026_READY_STALE');
assert(cached?.baseline_analysis.ready&&cached.baseline_analysis.automatic_eligible);
const originalFactsJSON=JSON.stringify(cached.input.facts),T=cached.baseline_analysis.analysis_ts;
const originalExpiry=Math.min(...['price','candles','orderbook'].map(k=>cached.input.facts[k].expires_ts));
assert(originalExpiry>T+200);
fs.writeFileSync(a.proof_path+'.attempt',JSON.stringify({started_ts:Date.now(),kind:'ARTIFICIAL_DELIVERY_BOUNDARY_WITH_CACHED_HISTORICAL_PLAN',real_IO:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};

async function arm(make,initial,{sameOriginal=false,race=false}={}){
 const store=new MemoryStore();let now=T,sends=0,recheckFail=initial==='ERROR',loseAck=initial==='UNKNOWN';
 async function original(label){
  const analysis=structuredClone(cached.baseline_analysis);
  if(label!=='A'){analysis.analysis_ts=T+200;analysis.run_id='ARTIFICIAL_RECOVERY_'+label;}
  const key='pump:analysis:'+sha(JSON.stringify(analysis));
  const input={...structuredClone(cached.input),analysis_ts:analysis.analysis_ts,run_id:analysis.run_id};
  assert.equal(JSON.stringify(input.facts),originalFactsJSON,'historical source clocks and facts never retimed');
  await store.set(key,{analysis,input,saved_ts:now,evidence_class:'ARTIFICIAL_CONTROLLED_DELIVERY_FIXTURE'});
  return {...analysis,source_input_key:key};
 }
 const firstOriginal=await original('A');
 const delivery=make({store,recipient:'ARTIFICIAL_RECOVERY_RECIPIENT',clock:()=>now,
  revalidate:async card=>{if(recheckFail)throw Error('ARTIFICIAL_PRE_HTTP_RECHECK_FAILURE');const row=await store.get(card.analysis.source_input_key);return {valid:Boolean(row&&JSON.stringify(row.input.facts)===originalFactsJSON&&originalExpiry>now)};},
  send:async({text})=>{sends++;if(loseAck)throw Error('ARTIFICIAL_LOST_ACK');return {ok:true,status:200,body:{ok:true,result:{message_id:991,chat:{id:'ARTIFICIAL_RECOVERY_RECIPIENT'},text}}};}});
 // This conservative shorter card deadline is an explicit artificial boundary.
 // It never extends or changes any historical source-fact expiry.
 const first=await delivery.enqueue(firstOriginal,{mode:'AUTO',expires_ts:initial==='STALE'?T+100:originalExpiry});
 if(initial==='STALE')now=T+200;
 if(initial!=='READY'){
  assert.equal((await delivery.dispatch(first.card_id)).state,initial);
  await delivery.acknowledge(first.card_id);
 }
 const oldCard=await store.get('pump:card:'+first.card_id);
 now=T+200;recheckFail=false;loseAck=false;
 const nextOriginal=sameOriginal?firstOriginal:await original('B');
 assert.equal(nextOriginal.card_text,firstOriginal.card_text,'same exact historical card text and plan');
 assert.deepEqual(nextOriginal.plan,firstOriginal.plan);
 const replacements=race?await Promise.all([
  delivery.enqueue(nextOriginal,{mode:'AUTO',expires_ts:originalExpiry}),
  delivery.enqueue(await original('C'),{mode:'AUTO',expires_ts:originalExpiry})
 ]):[await delivery.enqueue(nextOriginal,{mode:'AUTO',expires_ts:originalExpiry})];
 const outcomes=await Promise.all(replacements.map(c=>delivery.dispatch(c.card_id)));
 const selected=await store.get('pump:card:'+replacements[0].card_id);
 const preserved=await store.get('pump:card:'+first.card_id);
 if(initial!=='READY')assert.deepEqual(preserved,oldCard,'old terminal card and original reference remain immutable');
 if(selected.state==='SENT'){
  const beforeCount=[...store.rows.keys()].filter(k=>k.startsWith('pump:card:')).length;
  const repeated=await delivery.enqueue(await original('D'),{mode:'AUTO',expires_ts:originalExpiry});
  assert.equal(repeated.card_id,selected.card_id,'later same-text original deduplicates the actual SENT generation');
  await delivery.dispatch(repeated.card_id);
  assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:card:')).length,beforeCount,'no new card per already sent same-text analysis');
 }
 return {initial,first:first.card_id,next:replacements.map(c=>c.card_id),states:outcomes.map(x=>x.state),selected_state:selected.state,sends,selected,store};
}

const old=await arm(baseline,'STALE');assert.equal(old.selected_state,'STALE');assert.equal(old.sends,0);assert.equal(old.next[0],old.first);
const recovered=await arm(proposed,'STALE');assert.equal(recovered.selected_state,'SENT');assert.notEqual(recovered.next[0],recovered.first);assert.equal(recovered.sends,1);
const error=await arm(proposed,'ERROR');assert.equal(error.selected_state,'SENT');assert.equal(error.sends,1);
const sent=await arm(proposed,'SENT');assert.equal(sent.next[0],sent.first);assert.equal(sent.sends,1);
const unknown=await arm(proposed,'UNKNOWN');assert.equal(unknown.next[0],unknown.first);assert.equal(unknown.sends,1);assert.equal(unknown.selected_state,'UNKNOWN');
const same=await arm(proposed,'STALE',{sameOriginal:true});assert.equal(same.next[0],same.first);assert.equal(same.sends,0);assert.equal(same.selected_state,'STALE');
const ready=await arm(proposed,'READY');assert.equal(ready.next[0],ready.first);assert.equal(ready.sends,1);
const raced=await arm(proposed,'STALE',{race:true});assert.equal(new Set(raced.next).size,1);assert.equal(raced.sends,1);assert.equal(raced.selected_state,'SENT');
assert.equal(JSON.stringify(cached.input.facts),originalFactsJSON);
const proof={schema:'ROOT_SAME_TEXT_UNSENT_RECOVERY_AFFECTED_CASE_V1',status:'PASS',case_count:1,arms:8,
 cached_historical_case:'AIN_AUTO_20261026_READY_STALE',cached_baseline_sha256:a.cached_baseline_sha256,card_text_sha256:sha(cached.baseline_analysis.card_text),
 baseline_same_text_fresh_original:'OLD_STALE_NO_SEND',proposed_same_text_fresh_original:'NEW_CARD_MOCK_SENT',
 known_ERROR_before_HTTP_recoverable:true,SENT_UNKNOWN_READY_and_same_expired_original_protected:true,
 concurrent_fresh_generations_send_once:true,old_terminal_cards_originals_and_source_clocks_unchanged:true,
 already_sent_duplicates_create_no_new_card_rows:true,all_market_values_and_plan_geometry_unchanged:true,
 test_class:'CACHED_GENUINE_PLAN_WITH_EXPLICIT_ARTIFICIAL_DELIVERY_GENERATIONS_AND_SHORTER_CONSERVATIVE_CARD_EXPIRY',
 engine_calls:0,real_HTTP:0,native_SQL:0,Telegram:0,actual_current_AUTO_SENT:false,production_deployed:false};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
