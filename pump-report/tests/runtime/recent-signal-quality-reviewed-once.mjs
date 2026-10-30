import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SourceTextModule} from 'node:vm';
import {readRecentSignalQuality} from '../../operator/recent-signal-quality.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),now=10000,pin='a'.repeat(64),recipient='test-recipient',rows=[],data=new Map();
new SourceTextModule(readFileSync(new URL('../../operator/recent-signal-quality-once.mjs',import.meta.url),'utf8'));
function add(n,{badReceipt=false,wave='W'+n}={}){
  const instrument={instrument_id:'I',base:'TEST'},a={ready:true,automatic_eligible:true,mode:'AUTO',run_purpose:'PRODUCTION',run_id:'R'+n,instrument,analysis_ts:1000+n,wave_id:wave,card_text:'card'+n};
  const input={mode:'AUTO',run_purpose:'PRODUCTION',run_id:a.run_id,instrument,analysis_ts:a.analysis_ts,facts:Object.fromEntries(['price','candles','orderbook'].map(k=>[k,{expires_ts:9000}]))};
  const key='pump:analysis:'+sha(JSON.stringify(a)),id='PUMP:'+sha('card'+n),card={state:'SENT',mode:'AUTO',card_id:id,analysis:{...a,source_input_key:key},text:a.card_text,text_hash:sha(a.card_text),recipient,created_ts:2000+n,expires_ts:9000,send_started_ts:3000+n,message_id:String(n),receipt:{card_id:id,text_hash:sha(a.card_text),recipient,message_id:String(n),http_started_ts:3100+n,http_ack_received_ts:3200+n,confirmed_ts:4000+n,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'}};
  if(badReceipt)card.receipt.text_hash='b'.repeat(64);
  rows.push({key:'pump:card:'+id,value:card});data.set('pump:card:'+id,card);data.set(key,{analysis:a,input,saved_ts:1500+n,implementation_sha256:pin,evidence_class:'OBSERVED'});data.set('pump:delivery-wave:I:'+wave,{primary_card_id:id,card_by_hash:{[card.text_hash]:id}});
}
add(1);add(2,{wave:'W2'});add(3,{wave:'W2'});add(4,{badReceipt:true});
let gets=0,scans=0;
const store={scanPrefix:async(prefix,o)=>{assert.equal(prefix,'pump:card:');assert.equal(o.limit,20);scans++;return rows;},get:async key=>{gets++;return data.get(key)??null;}};
const out=await readRecentSignalQuality({store,implementation_sha256:pin,expected_recipient_sha256:sha(recipient),confirmed_not_before_ts:0,clock:()=>now});
assert.equal(scans,1);assert.equal(gets,9);assert.equal(out.observations.length,3);assert.deepEqual(out.observations.map(x=>x.observation.private_evidence.card.message_id),['4','3','2']);assert.equal(out.observations[0].observation.first_genuine_same_original_SENT_observed,false);assert.equal(out.observations[1].observation.first_genuine_same_original_SENT_observed,true);assert.equal(out.duplicate_same_wave_groups.length,1);assert.equal(out.market_HTTP,0);assert.equal(out.Telegram,0);assert.equal(out.reanalysis,false);assert.equal(out.scope.whole_history_claimed,false);
await assert.rejects(()=>readRecentSignalQuality({store:{...store,scanPrefix:async()=>Array(21).fill(rows[0])},implementation_sha256:pin,expected_recipient_sha256:sha(recipient),confirmed_not_before_ts:0,clock:()=>now}),/CARD_PAGE_BOUND/);
console.log(JSON.stringify({one_affected_case:'RECENT_SAVED_3_ORIGINALS_BOUNDED_SELECTOR_AND_SAME_ORIGINAL_RECEIPT',pass:true,scan:scans,PK_reads:gets,bad_receipt_not_promoted:true,duplicate_wave_detected:true,market_HTTP:0,SQL:0,Telegram:0,engine:0}));
