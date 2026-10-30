import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(a.status!=='ADMITTED_ONE_COMPLETED_AUTO_PACKET_CASE'||a.max_cases!==1||Date.now()>=a.expires_ts||a.expires_ts>own.expires_ts||own.owner!==a.own_lease.owner||own.released)throw Error('CASE_ADMISSION');
for(const [path,digest] of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(path)),digest,path);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_ONLY');};
const {readCompletedAutoPacket}=await import('../../operator/completed-auto-packet.mjs');
const {CATALOG_SNAPSHOT_SERIALIZATION}=await import('../../runtime/catalog-snapshot.mjs');
const T=Date.now()-10000,pin='a'.repeat(64),run='11111111-1111-4111-8111-111111111111',live='22222222-2222-4222-8222-222222222222';
const instrument={instrument_id:'BINGX:USDT_M:999:FIXTURE-USDT',asset_id:'FIXTURE',native_symbol:'FIXTURE-USDT',base:'FIXTURE',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO',identity_evidence_ref:'ARTIFICIAL_ONLY'};
const analysis={run_id:run,analysis_ts:T,mode:'AUTO',run_purpose:'PRODUCTION',instrument,ready:true,automatic_eligible:true,wave_id:'FIXTURE_WAVE',reference_price:1,rules_version:'ARTIFICIAL_NOT_MARKET',card_text:'ARTIFICIAL CARD, NO TELEGRAM SEND'};
const input={run_id:run,analysis_ts:T,mode:'AUTO',run_purpose:'PRODUCTION',instrument,facts:Object.fromEntries(['price','candles','orderbook'].map(kind=>[kind,{expires_ts:T+60000}]))};
const analysisKey='pump:analysis:'+sha(JSON.stringify(analysis)),cardId='PUMP:'+'b'.repeat(64),recipient='12345',textHash=sha(analysis.card_text);
const original={analysis,input,saved_ts:T+1,implementation_sha256:pin,evidence_class:'OBSERVED'};
const card={card_id:cardId,state:'SENT',mode:'AUTO',analysis:{...analysis,source_input_key:analysisKey},text:analysis.card_text,text_hash:textHash,recipient,
  created_ts:T+2,send_started_ts:T+3,expires_ts:T+60000,message_id:'1',receipt:{card_id:cardId,text_hash:textHash,recipient,message_id:'1',http_started_ts:T+4,http_ack_received_ts:T+5,confirmed_ts:T+6,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'}};
const signalKey='pump:signal:'+instrument.instrument_id+':'+analysis.wave_id,journalKey='pump:journal:'+instrument.instrument_id+':'+analysis.wave_id;
const origin={signal_id:signalKey,instrument_id:instrument.instrument_id,asset_id:instrument.asset_id,wave_id:analysis.wave_id,evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true,mode:'AUTO',t0:T,reference_price:1,rules_version:analysis.rules_version};
const signal={signal_id:signalKey,analysis_key:analysisKey,original_card_id:cardId,origin,wave_id:analysis.wave_id,mode:'AUTO',t0:T,reference_price:1,rules_version:analysis.rules_version,instrument,deadline_ts:T+14400000,map_mode:'NO_MAP'};
const body={code:0,data:[{symbol:'中文币-USDT'}]},serialized=JSON.stringify(body);
const catalog={schema:'PUMP_RETAINED_CATALOG_SNAPSHOT_V1',provider:'BINGX',family:'USDT_M',route:'/openApi/swap/v2/quote/contracts',serialization_basis:CATALOG_SNAPSHOT_SERIALIZATION,
  source_event_ts:null,body,row_count:1,body_utf8_bytes:Buffer.byteLength(serialized),body_sha256:sha(serialized),receipt_id:'ARTIFICIAL_CATALOG',received_ts:T,saved_ts:T+1,implementation_sha256:pin,evidence_class:'OBSERVED'};
const rows=new Map([['pump:executor',{owner:'LIVE_OWNER',run_id:live}],['pump:resources',{automatic_surplus_grants:{fixture:{state:'CLOSED',created_ts:T,run_id:run}}}],
  ['pump:run:'+run,{run_id:run,status:'INCOMPLETE',checked:[{analysis,analysis_key:analysisKey,delivery:{state:'SENT',card_id:cardId}}]}],
  [analysisKey,original],['pump:card:'+cardId,card],['pump:candidate-queue',{}],['pump:wave:'+instrument.instrument_id,{wave_id:'LATER_WAVE'}],
  [journalKey,{frozen_anchor:{analysis_id:analysisKey,analysis_sha256:sha(JSON.stringify(analysis)),immutable:true,origin}}],[signalKey,signal],
  ['pump:outcome:'+signalKey,{signal_id:signalKey,wave_id:analysis.wave_id,t0:T,reference_price:1,rules_version:analysis.rules_version,mode:'AUTO',map_mode:'NO_MAP',deadline_ts:T+14400000,status:'UNKNOWN'}],
  ['pump:catalog:last-observed:v1',catalog]]);
const reads=[];const store={async get(key){reads.push(key);return structuredClone(rows.get(key)??null);},async scanPrefix(prefix,{after_key,limit}){reads.push('SCAN:'+prefix);assert.equal(limit,20);return [...rows].filter(([key])=>key.startsWith(prefix)&&key>after_key).sort(([x],[y])=>x.localeCompare(y)).slice(0,limit).map(([key,value])=>({key,value:structuredClone(value)}));}};
const admission={after_install_ts:T-1000,implementation_sha256:pin,expected_recipient_sha256:sha(recipient),candidate_instrument_ids:[instrument.instrument_id,'BINGX:USDT_M:888:OTHER-USDT'],read_retained_wave:true,read_saved_outcome:true,read_catalog_snapshot:true};
const result=await readCompletedAutoPacket({store,admission});
assert.equal(reads.length,12);assert.equal(reads.filter(key=>key===analysisKey).length,1);assert(!reads.includes('pump:run:'+live));
assert.equal(result.known_candidates.length,1);assert.equal(result.known_candidates[0].saved_original_bound,true);
assert.equal(result.observation.first_genuine_same_original_SENT_observed,true,'ARTIFICIAL_VALIDATOR_SHAPE_ONLY');
assert.equal(result.observation.private_evidence.executor.owner,'LIVE_OWNER');assert.equal(result.observation.private_evidence.run,null);
assert.equal(result.observation.scope.live_run_outside_scope_not_read,true);assert.equal(result.known_run_id,run);
assert.equal(result.retained_wave.same_wave_id,false);assert.equal(result.retained_wave.value.wave_id,'LATER_WAVE');
assert.equal(result.saved_outcome.saved_outcome_bound,true);assert.equal(result.catalog_snapshot.native_source_response_bound,true);
assert.equal(result.catalog_snapshot.private_evidence.snapshot.body.data[0].symbol,'中文币-USDT');
const boundReads=reads.length;
rows.set('pump:executor',{owner:null,run_id:run});rows.set('pump:run:'+run,{run_id:run,status:'INCOMPLETE',checked:[{analysis:{...analysis,ready:false},analysis_key:'pump:analysis:'+sha(JSON.stringify({...analysis,ready:false}))}]});
const rejected={...analysis,ready:false},rejectedKey='pump:analysis:'+sha(JSON.stringify(rejected));rows.set(rejectedKey,{...original,analysis:rejected});reads.length=0;
const noSent=await readCompletedAutoPacket({store,admission});assert.equal(noSent.observation.first_genuine_same_original_SENT_observed,false);assert.equal(noSent.saved_outcome.status,'DELIVERY_NOT_BOUND');assert(reads.length<=12);
assert(Date.now()<a.expires_ts);
const proof={schema:'ROOT_COMPLETED_AUTO_PACKET_CASE_V1',status:'PASS',case_count:1,fixture_class:'ARTIFICIAL_VALIDATOR_SHAPES_NO_MARKET_PROOF',
  worst_business_reads:boundReads,reservation_finalization_queries:4,worst_total_queries:16,catalog_flag_honored:true,one_sent_original_priority:true,
  in_flight_executor_not_replaced:true,unread_live_run_explicit:true,retained_wave_not_substituted:true,bound_saved_outcome_read:true,Unicode_catalog_preserved:true,
  no_SENT_scope_honest:true,actual_native_SQL:0,Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,engine_calls:0,builds:0};
fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
