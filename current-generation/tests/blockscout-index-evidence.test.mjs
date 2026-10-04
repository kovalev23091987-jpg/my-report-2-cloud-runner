import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const {normalizeBlockscoutTransfers,collectBlockscoutIndexEvidence}=await import(process.env.REPORT2_BLOCKSCOUT_TEST_MODULE||'../files/src/blockscout-index-evidence.mjs');
import {sourceWasActuallyChecked} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceCredits} from '../files/src/evidence-source-store.mjs';
import {validateEvidenceV2} from '../files/src/evidence-v2.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}
const NOW=Date.parse('2026-09-28T03:00:00Z'),ADDRESS='0x1111111111111111111111111111111111111111',OTHER='0x2222222222222222222222222222222222222222',TX=`0x${'a'.repeat(64)}`,IDENTITY={chain:'ethereum',contract_or_mint:ADDRESS},payload={items:[{token:{address_hash:ADDRESS,decimals:'18'},transaction_hash:TX,from:{hash:OTHER},to:{hash:ADDRESS},block_number:123,log_index:4,total:{value:'1000000000000000000',decimals:'18'},timestamp:'2026-09-28T02:59:00Z'},{token:{address_hash:OTHER},transaction_hash:TX,from:{hash:OTHER},to:{hash:ADDRESS},block_number:123,timestamp:'2026-09-28T02:59:00Z'}],next_page_params:{block_number:122,index:9}};

test('K16 Blockscout keeps exact-token transfers as provisional investigation context',()=>{const out=normalizeBlockscoutTransfers({contract:'ABC-USDT',asset_identity:IDENTITY,payload,observed_ts:NOW});assert.equal(out.status,'CLOSED');assert.equal(out.transfers.length,1);assert.equal(out.evidence[0].block_id,'N04');assert.equal(out.evidence[0].tx_hash,TX);assert.equal(out.evidence[0].directional_strength,null);assert.equal(out.evidence[0].finality_status,'PROVISIONAL');assert.equal(validateEvidenceV2(out.evidence[0],{decision_ts:NOW}).usable,false);assert.deepEqual(out.next_page_params,{block_number:122,index:9});});
test('K16 Blockscout requires exact supported EVM identity and a free key before transport',async()=>{assert.equal(normalizeBlockscoutTransfers({contract:'ABC-USDT',asset_identity:{chain:'solana',contract_or_mint:'mint'},payload,observed_ts:NOW}).status,'EXACT_EVM_IDENTITY_REQUIRED');let calls=0;const out=await collectBlockscoutIndexEvidence({db:new DB(),fetch_impl:async()=>{calls++;throw Error('no');},request_admit:()=>({allowed:true}),contract:'ABC-USDT',run_id:'R',asset_identity:IDENTITY,now:NOW});assert.equal(out.status,'WAITING_FREE_KEY');assert.equal(calls,0);});
test('K16 Blockscout reserves one request and thirty credits, sends key only in authorization header and caches',async()=>{const db=new DB(),seen=[];const fetch_impl=async(url,init)=>{seen.push({url:String(url),authorization:init.headers.authorization});return{ok:true,status:200,headers:{get:name=>name==='x-credits-remaining'?'99970':null},json:async()=>payload};},base={db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'ABC-USDT',run_id:'R',asset_identity:IDENTITY,blockscout_api_key:'secret-key',now:NOW};const first=await collectBlockscoutIndexEvidence(base),second=await collectBlockscoutIndexEvidence({...base,run_id:'R2',now:NOW+1});assert.equal(first.status,'CLOSED');assert.equal(first.route_credit_cost,30);assert.equal(first.network_calls,1);assert.equal(second.network_calls,0);assert.equal(seen.length,1);assert.doesNotMatch(seen[0].url,/secret-key/);assert.equal(seen[0].authorization,'Bearer secret-key');assert.equal(db.sqlite.prepare(`SELECT credits FROM report2_evidence_source_credit_daily WHERE source='BLOCKSCOUT_INDEX'`).get().credits,30);});
test('K16 Blockscout rejects responses without auditable remaining-credit header',async()=>{const out=await collectBlockscoutIndexEvidence({db:new DB(),fetch_impl:async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>payload}),request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'ABC-USDT',run_id:'R',asset_identity:IDENTITY,blockscout_api_key:'secret-key',now:NOW});assert.equal(out.status,'SOURCE_ERROR');assert.equal(out.evidence.length,0);assert.equal(out.receipts[0].error,'CREDIT_HEADER_REQUIRED');});
test('K16 Blockscout credit ledger is atomic, idempotent and fails closed at its internal cap',async()=>{const db=new DB();await installEvidenceSourceStore(db);const first=await reserveEvidenceSourceCredits(db,{source:'BLOCKSCOUT_INDEX',reservation_id:'A',credits:30,daily_credit_cap:50,now:NOW}),repeat=await reserveEvidenceSourceCredits(db,{source:'BLOCKSCOUT_INDEX',reservation_id:'A',credits:30,daily_credit_cap:50,now:NOW}),blocked=await reserveEvidenceSourceCredits(db,{source:'BLOCKSCOUT_INDEX',reservation_id:'B',credits:30,daily_credit_cap:50,now:NOW});assert.equal(first.allowed,true);assert.equal(repeat.allowed,true);assert.equal(blocked.allowed,false);assert.equal(db.sqlite.prepare(`SELECT credits FROM report2_evidence_source_credit_daily WHERE source='BLOCKSCOUT_INDEX'`).get().credits,30);});

test('main exact-route 404 backoff saves repeated requests and credits without a closed source check',async()=>{
 const db=new DB();let calls=0,grants=0;const now=Date.now();
 const base={db,fetch_impl:async()=>{calls++;return{ok:false,status:404,headers:{get:()=>null},json:async()=>null};},request_admit:()=>{grants++;return{allowed:true};},contract:'BTW-USDT',run_id:'FAIL-1',asset_identity:{chain:'bsc',contract_or_mint:ADDRESS},blockscout_api_key:'secret',main_index_failure_backoff:true,now};
 const first=await collectBlockscoutIndexEvidence(base);
 assert.equal(first.status,'SOURCE_ERROR');assert.equal(first.network_calls,1);assert.equal(first.failure_cache_status,'STORED_EXACT_ROUTE');
 const second=await collectBlockscoutIndexEvidence({...base,run_id:'FAIL-2',now:now+40*60_000});
 assert.equal(second.status,'SOURCE_ERROR_BACKOFF');assert.equal(second.network_calls,0);assert.equal(second.route_credit_cost,0);assert.equal(second.evidence.length,0);assert.equal(second.receipts[0].prior_http_status,404);assert.equal(sourceWasActuallyChecked(second),false);
 assert.equal(calls,1);assert.equal(grants,1);assert.equal(db.sqlite.prepare("SELECT credits FROM report2_evidence_source_credit_daily WHERE source='BLOCKSCOUT_INDEX'").get().credits,30);
 const retry=await collectBlockscoutIndexEvidence({...base,run_id:'FAIL-3',now:first.retry_after_ts});
 assert.equal(retry.network_calls,1);assert.equal(calls,2);
});

test('failure backoff stays scoped to one chain/address and fresh manual analysis bypasses it',async()=>{
 const db=new DB();let calls=0;const now=Date.now();
 const base={db,fetch_impl:async()=>{calls++;return{ok:false,status:410,headers:{get:()=>null},json:async()=>null};},request_admit:()=>({allowed:true}),contract:'BTW-USDT',run_id:'A',asset_identity:{chain:'bsc',contract_or_mint:ADDRESS},blockscout_api_key:'secret',main_index_failure_backoff:true,now};
 await collectBlockscoutIndexEvidence(base);
 for(const [run_id,asset_identity,strict_fresh_manual] of [['B',{chain:'bsc',contract_or_mint:OTHER},false],['C',IDENTITY,false],['D',base.asset_identity,true]]){
  const result=await collectBlockscoutIndexEvidence({...base,run_id,asset_identity,strict_fresh_manual,now:now+1});assert.equal(result.network_calls,1);
 }
 assert.equal(calls,4);
});

test('liquidation/default path keeps prior attempts and transient or unaudited replies never create backoff',async()=>{
 for(const status of [401,403,429,500,503,200]){
  const db=new DB();let calls=0;const now=Date.now(),base={db,fetch_impl:async()=>{calls++;return{ok:status===200,status,headers:{get:()=>null},json:async()=>payload};},request_admit:()=>({allowed:true}),contract:'ABC-USDT',run_id:'A',asset_identity:IDENTITY,blockscout_api_key:'secret',main_index_failure_backoff:true,now};
  await collectBlockscoutIndexEvidence(base);await collectBlockscoutIndexEvidence({...base,run_id:'B',now:now+1});assert.equal(calls,2);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM report2_evidence_source_cache WHERE source='BLOCKSCOUT_INDEX_HTTP_FAILURE_V1'").get().n,0);
 }
 const db=new DB();let calls=0;const now=Date.now(),base={db,fetch_impl:async()=>{calls++;return{ok:false,status:404,headers:{get:()=>null},json:async()=>null};},request_admit:()=>({allowed:true}),contract:'ABC-USDT',run_id:'A',asset_identity:IDENTITY,blockscout_api_key:'secret',now};
 await collectBlockscoutIndexEvidence(base);await collectBlockscoutIndexEvidence({...base,run_id:'B',now:now+1});assert.equal(calls,2);
});

test('malformed/future failure entries cannot suppress a request',async()=>{
 const db=new DB();await installEvidenceSourceStore(db);const now=Date.now();let calls=0;
 await db.prepare("INSERT INTO report2_evidence_source_cache VALUES(?1,?2,?3,?4,?5)").bind('BLOCKSCOUT_INDEX_HTTP_FAILURE_V1',`TOKEN_TRANSFERS_PAGE_1:1:${ADDRESS}`,now+1,now+21_600_001,JSON.stringify({contract_key:`1:${ADDRESS}`,http_status:404,observed_ts:now+1,expires_ts:now+21_600_001})).run();
 const result=await collectBlockscoutIndexEvidence({db,fetch_impl:async()=>{calls++;throw Error('test unavailable');},request_admit:()=>({allowed:true}),contract:'ABC-USDT',run_id:'FUTURE',asset_identity:IDENTITY,blockscout_api_key:'secret',main_index_failure_backoff:true,now});assert.equal(calls,1);assert.equal(result.network_calls,1);
});
