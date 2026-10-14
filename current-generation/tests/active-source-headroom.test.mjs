import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {installEvidenceSourceStore,reserveEvidenceSourceAttempts,evidenceSourceAttemptHeadroom}=await import(modulePath('evidence-source-store.mjs'));
const {installProviderMinuteLedger,reserveProviderMinuteUnits}=await import(modulePath('provider-minute-ledger.mjs'));
const {collectHtxAssetIdentity}=await import(modulePath('htx-asset-identity.mjs'));
const {collectFinalizedChainEvents}=await import(modulePath('finalized-chain-events.mjs'));
const {collectNativeEvmFinalizedContext}=await import(modulePath('native-evm-finalized-context.mjs'));
const {collectHtxLargeTradesEvidence}=await import(modulePath('htx-large-trades-evidence.mjs'));
const {SOURCE_POLICIES}=await import(modulePath('evidence-source-adapters.mjs'));
const {createUnifiedHttpBudget}=await import(modulePath('unified-budget.mjs'));
const NOW=Date.now(),mint='pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn';
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(q){return{bind(...args){this.args=args;return this;},async run(){return sql.prepare(q).run(...(this.args||[]));},async first(){return sql.prepare(q).get(...(this.args||[]))||null;},async all(){return{results:sql.prepare(q).all(...(this.args||[]))};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
async function used(d,source,attempts,cap=SOURCE_POLICIES[source]?.daily_cap){await installEvidenceSourceStore(d);assert.equal((await reserveEvidenceSourceAttempts(d,{source,reservation_id:'used:'+source,attempts,daily_cap:cap,now:NOW})).allowed,true);}
test('native and token Solana insufficient whole-chain source headroom consumes no common HTTP reservation',async()=>{
 for(const [contract,identity,prior]of [['PUMP-USDT',{chain:'solana',contract_or_mint:mint},719],['SOL-USDT',{chain:'solana',asset_kind:'NATIVE',native_asset_id:'solana:mainnet',contract_or_mint:null},717]]){const d=database(),whole=createUnifiedHttpBudget();let admissions=0,calls=0;try{await used(d,'CHAIN_RPC',prior);const r=await collectFinalizedChainEvents({db:d,contract,asset_identity:identity,run_id:'controlled:'+contract,now:NOW,clock:()=>NOW,request_admit:x=>{admissions++;return whole.reserve(x);},fetch_impl:async()=>{calls++;throw Error('NO_HTTP');}});assert.equal(r.status,'SOURCE_DAILY_CAP_REACHED');assert.equal(r.network_calls,0);assert.equal(admissions,0);assert.equal(calls,0);assert.equal(whole.summary().total,0);assert.equal(d.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='CHAIN_RPC'").get().attempts,prior);assert.deepEqual(r.evidence,[]);}finally{d.sql.close();}}
});
test('native EVM day and minute refusals preserve both common slots and existing daily reservations',async()=>{
 for(const guard of ['day','minute']){const d=database(),whole=createUnifiedHttpBudget();let admissions=0,calls=0;try{await installEvidenceSourceStore(d);if(guard==='day')await used(d,'CHAIN_RPC',719);else{await installProviderMinuteLedger(d);assert.equal((await reserveProviderMinuteUnits(d,{provider:'PUBLICNODE_NATIVE_EVM',reservation_id:'minute-exhausted',units:6,cap:6,now:NOW})).allowed,true);}
  const r=await collectNativeEvmFinalizedContext({db:d,contract:'ETH-USDT',asset_identity:{chain:'ethereum',asset_kind:'NATIVE',native_asset_id:'ethereum:mainnet',contract_or_mint:null},run_id:'controlled:'+guard,now:NOW,clock:()=>NOW,request_admit:x=>{admissions++;return whole.reserve(x);},fetch_impl:async()=>{calls++;throw Error('NO_HTTP');}});
  assert.equal(r.status,guard==='day'?'SOURCE_DAILY_CAP_REACHED':'ROLLING_60S_CAP_REACHED');assert.equal(r.network_calls,0);assert.equal(admissions,0);assert.equal(calls,0);assert.equal(whole.summary().total,0);assert.equal(d.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='CHAIN_RPC'").get()?.attempts||0,guard==='day'?719:0);
 }finally{d.sql.close();}}
});
test('HTX identity exhaustion goes directly to exact provider fallback within unchanged slots',async t=>{
 t.mock.method(Date,'now',()=>NOW);const d=database(),whole=createUnifiedHttpBudget(),urls=[];try{await used(d,'HTX_ASSET_REFERENCE',8,8);const address='0x'+'a'.repeat(40),r=await collectHtxAssetIdentity({db:d,contract:'BR-USDT',run_id:'controlled_fallback',now:NOW,clock:()=>NOW,request_admit:whole.reserve,fetch_impl:async url=>{urls.push(url);assert.equal(url.includes('/v2/reference/currencies'),false);return new Response(JSON.stringify(url.includes('/exchanges/htx/markets')?[{pair:'BR/USDT',base_currency_id:'br-project',base_currency_name:'BR',quote_currency_id:'usdt-tether',market_url:'https://www.htx.com/trade/br_usdt',category:'Spot'}]:{id:'br-project',symbol:'BR',is_active:true,contracts:[{platform:'eth-ethereum',contract:address}]}));}});
  assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,2);assert.equal(r.htx_asset_reference_status,'SOURCE_DAILY_CAP_REACHED');assert.equal(r.identity_method,'COINPAPRIKA_EXACT_HTX_SPOT_MARKET_AND_CHAIN_ADDRESS');assert.equal(r.identity.contract_or_mint,address);assert.equal(urls.length,2);assert.equal(whole.summary().total,2);assert.equal(d.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='HTX_ASSET_REFERENCE'").get().attempts,8);
 }finally{d.sql.close();}
});
test('an exhausted identity fallback cannot burn a common slot or fabricate a binding',async()=>{
 const d=database(),whole=createUnifiedHttpBudget();let admissions=0,calls=0;try{await used(d,'HTX_ASSET_REFERENCE',8,8);await used(d,'COINPAPRIKA_HTX_IDENTITY',12);const r=await collectHtxAssetIdentity({db:d,contract:'BR-USDT',run_id:'controlled_both_exhausted',now:NOW,request_admit:x=>{admissions++;return whole.reserve(x);},fetch_impl:async()=>{calls++;throw Error('NO_HTTP');}});assert.equal(r.identity,null);assert.equal(r.network_calls,0);assert.equal(admissions,0);assert.equal(calls,0);assert.equal(whole.summary().total,0);}finally{d.sql.close();}
});
test('headroom is indexed advisory state, never reservation/refund or authorization after a race',async()=>{
 const d=database();try{await used(d,'CHAIN_RPC',718);const before=d.sql.prepare('SELECT * FROM report2_evidence_source_daily').all(),q=await evidenceSourceAttemptHeadroom(d,{source:'CHAIN_RPC',attempts:2,daily_cap:720,now:NOW});assert.equal(q.allowed,true);assert.deepEqual(d.sql.prepare('SELECT * FROM report2_evidence_source_daily').all(),before);
  await reserveEvidenceSourceAttempts(d,{source:'CHAIN_RPC',reservation_id:'racing_other',attempts:2,daily_cap:720,now:NOW});const grant=await reserveEvidenceSourceAttempts(d,{source:'CHAIN_RPC',reservation_id:'losing_race',attempts:2,daily_cap:720,now:NOW});assert.equal(grant.allowed,false);assert.equal(d.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='CHAIN_RPC'").get().attempts,720);
  const plan=d.sql.prepare('EXPLAIN QUERY PLAN SELECT attempts FROM report2_evidence_source_daily WHERE source=? AND day_utc=?').all('CHAIN_RPC',new Date(NOW).toISOString().slice(0,10));assert.ok(plan.every(r=>r.detail.includes('SEARCH')&&!r.detail.includes('SCAN')));
  for(const attempts of [0,NaN,-1,1.2])assert.equal((await evidenceSourceAttemptHeadroom(d,{source:'CHAIN_RPC',attempts,daily_cap:720,now:NOW})).allowed,false);
 }finally{d.sql.close();}
});
test('exhausted N12 recent-trade source preserves the common envelope for sector or another admitted source',async()=>{
 const d=database(),whole=createUnifiedHttpBudget();let admissions=0,calls=0;try{await used(d,'HTX_LARGE_TRADES',144);const r=await collectHtxLargeTradesEvidence({db:d,contract:'ZEC-USDT',run_id:'controlled_n12_exhausted',now:NOW,request_admit:x=>{admissions++;return whole.reserve(x);},fetch_impl:async()=>{calls++;throw Error('NO_HTTP');}});assert.equal(r.status,'SOURCE_DAILY_CAP_REACHED');assert.equal(r.network_calls,0);assert.equal(admissions,0);assert.equal(calls,0);assert.equal(whole.summary().total,0);assert.equal(d.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='HTX_LARGE_TRADES'").get().attempts,144);assert.equal(whole.reserve({logical_request_id:'next_useful_source',lane:'background',attempts:4}).allowed,true);}finally{d.sql.close();}
});
