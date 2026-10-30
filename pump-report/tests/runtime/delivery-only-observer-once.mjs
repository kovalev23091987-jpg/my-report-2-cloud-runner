import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex'),a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json')).lease;
assert(a.status==='ADMITTED_ONE_DELIVERY_ONLY_SCOPE_CASE'&&Date.now()<a.expires_ts&&own.owner===a.own_lease.owner&&!own.released);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),real_IO:0}),{flag:'wx',mode:0o600});
const {readSavedAutoObservation}=await import('../../operator/saved-auto-observation.mjs');
globalThis.fetch=()=>{throw Error('NO_NETWORK');};
const T=1800000000000,pin='2'.repeat(64),recipient='-123456',analysis={ready:true,automatic_eligible:true,mode:'AUTO',run_purpose:'PRODUCTION',run_id:'ARTIFICIAL_DELIVERY_ONLY',instrument:{base:'ARTIFICIAL_TEST'},analysis_ts:T,card_text:'ARTIFICIAL_SCOPE_ONLY_NOT_SENT'};
const key='pump:analysis:'+sha(JSON.stringify(analysis)),text_hash=sha(analysis.card_text),card_id='PUMP:'+'3'.repeat(64);
const original={analysis,input:{mode:'AUTO',run_purpose:'PRODUCTION',run_id:analysis.run_id,instrument:analysis.instrument,analysis_ts:T,facts:Object.fromEntries(['price','candles','orderbook'].map(k=>[k,{expires_ts:T+15000}]))},implementation_sha256:pin,evidence_class:'OBSERVED',saved_ts:T+1};
const card={card_id,mode:'AUTO',state:'SENT',analysis:{...analysis,source_input_key:key},text:analysis.card_text,text_hash,recipient,created_ts:T+2,send_started_ts:T+3,expires_ts:T+15000,message_id:1,
 receipt:{card_id,text_hash,recipient,message_id:1,http_started_ts:T+4,http_ack_received_ts:T+5,confirmed_ts:T+6,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'}};
let reads=[];const store={get:async k=>{reads.push(k);if(k==='pump:card:'+card_id)return structuredClone(card);if(k===key)return structuredClone(original);throw Error('DELIVERY_ONLY_FORBIDS_EXECUTOR_RUN_OR_UNRELATED_READ:'+k);},
 scanPrefix:async(prefix,opts)=>{reads.push('PAGE');assert.equal(prefix,'pump:card:');assert.equal(opts.limit,20);return [{key:'pump:card:'+card_id,value:structuredClone(card)}];}};
const yes=await readSavedAutoObservation({store,implementation_sha256:pin,expected_recipient_sha256:sha(recipient),clock:()=>T+10,include_executor:false,confirmed_not_before_ts:T});
assert.equal(yes.first_genuine_same_original_SENT_observed,true);assert.equal(yes.latest_executor_status,'NOT_READ_DELIVERY_ONLY');assert.equal(yes.latest_run_id,null);assert.equal(reads.length,3);assert.equal(yes.scope.executor_context_requested,false);
reads=[];const none=await readSavedAutoObservation({store,implementation_sha256:pin,expected_recipient_sha256:sha(recipient),clock:()=>T+20,include_executor:false,confirmed_not_before_ts:T+7});
assert.equal(none.first_genuine_same_original_SENT_observed,false);assert.equal(none.status,'NO_PRODUCTION_AUTO_SENT_IN_READ_SCOPE');assert.deepEqual(reads,['PAGE']);
const wrapper=fs.readFileSync('pump-report/operator/delivery-only-observation-once.mjs','utf8'),native=fs.readFileSync('pump-report/runtime/native-budget.mjs','utf8');
assert(wrapper.includes("mode:'DELIVERY_CHECK',run_purpose:'PRODUCTION'"));assert(wrapper.includes('include_executor:false'));
assert(!wrapper.includes("native.store.get('pump:run:"));assert(!wrapper.includes("native.store.get('pump:candidate-queue'"));assert(!wrapper.includes("native.store.get('pump:resources'"));
assert(native.includes('delivery_check_count<1'));assert(native.includes('lookup_count<?17'));
assert(wrapper.includes('original_never_reduced:true'));assert(wrapper.includes('max_rows_read:500,max_rows_written:30,max_requests:16'));
const proof={schema:'ROOT_DELIVERY_ONLY_OBSERVER_SCOPE_CASE_V1',status:'PASS',cases:1,query_scope:{with_current_mock_card:3,without_current_mock_card:1,executor_run_queue_catalog_resources:0},
 new_scope_only_not_old_battery:true,current_mock_same_original_receipt_accepted:true,old_card_time_excluded:true,shared_native_policy_unchanged:true,existing_DELIVERY_CHECK_daycap:1,ordinary_LOOKUP_cap_unchanged:10,
 wrapper_runtime_not_executed:true,actual_native_SQL:0,market_HTTP:0,Telegram:0,engine:0,build:0,real_AUTO_delivery_proven:false};
fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
