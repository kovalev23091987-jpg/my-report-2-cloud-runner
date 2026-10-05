import fs from 'node:fs';import zlib from 'node:zlib';import crypto from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {collectEvidenceRouteBlock} from '../runtime/src/candidate-evidence-v2-runtime.mjs';
import {collectCoinpaprikaSectorEvidence} from '../runtime/src/coinpaprika-sector-evidence.mjs';
import {consumeBlockResultContext} from '../runtime/src/block-result-context.mjs';
import {consumeSectorContext} from '../runtime/src/sector-context.mjs';
import {coinpaprikaHtxMarketRows} from '../runtime/src/coinpaprika-htx-identity.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),reservation={rows_read:1400,rows_written:160},id=`CP_MARKET_PROOF:${process.env.GITHUB_RUN_ID}:${now}`;
const original=db._request.bind(db);
db._request=async p=>{const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>=1250||u.rows_written>=150)throw Error('PROBE_D1_ENVELOPE_STOP');return original(p);};
const daily=await loadDailyUsageAggregate(db,now),admission=evaluateDailyReservationBudget({daily,nextReservation:reservation});
if(!admission.allowed){fs.writeFileSync('audit-output/provider-market-actual.json',JSON.stringify({status:admission.status,admission,sourceHTTP:0,MAIN:0,Telegram:0}));process.exit(0);}
await reserveRunBudget(db,{reservationId:id,now,reservation});
let calls=0,catalog=null;const captures=[],results=[];
try{
 const actual=JSON.parse(zlib.gunzipSync(fs.readFileSync('checkpoints/actual-scheduled-source-result-37375551922.json.gz')));
 const contracts=[...new Set((actual.candidate_selection_audit?.qualified_candidates||[]).filter(c=>c.rank===1||c.rank===2).map(c=>c.contract))].filter(c=>/^[^\s-]+-USDT$/u.test(c)).slice(0,2);
 const logical=new Set(),fetch_impl=async(url,init)=>{
  if(calls>=6)throw Error('SOURCE_HTTP_ENVELOPE_STOP');calls++;
  const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='api.coinpaprika.com')throw Error('UNEXPECTED_PROVIDER_ROUTE');
  const response=await fetch(url,init),body=await response.clone().text();
  if(body.length<=6*1024*1024){captures.push({url,http_status:response.status,received_ts:Date.now(),body_sha256:crypto.createHash('sha256').update(body).digest('hex'),body});if(u.pathname==='/v1/exchanges/htx/markets'&&response.ok)try{catalog=JSON.parse(body);}catch{}}
  return response;
 };
 const request_admit=r=>{if(!Number.isSafeInteger(r?.attempts)||r.attempts!==1||logical.has(r.logical_request_id)||logical.size>=6)return{allowed:false,status:'PROBE_HTTP_ADMISSION_DENIED'};logical.add(r.logical_request_id);return{allowed:true};};
 const sourceResults=await collectEvidenceRouteBlock({routes:contracts.map(contract=>({name:contract})),collectors:Object.fromEntries(contracts.map(contract=>[contract,p=>collectCoinpaprikaSectorEvidence({...p,contract})])),max_requests:6,params:{db,fetch_impl,request_admit,run_id:id,now}});
 const cutoff=Date.now();
 for(const contract of contracts){const source=sourceResults.results[contract],supply=consumeBlockResultContext({evidence:source.evidence,contract,now:cutoff}),sector=consumeSectorContext({evidence:source.evidence,contract,now:cutoff});results.push({contract,source,supply_consumer:supply,sector_consumer:sector,actual_facts:[...supply.facts,...sector.facts],primary_chain_closed:false,same_fresh_joint_report:false});}
 const data={schema:'GENERAL_EXACT_PROVIDER_MARKET_ACTUAL_PROOF_V1',observed_ts:cutoff,source_run:id,sourceHTTP:calls,MAIN:0,Telegram:0,nansen_calls:0,results,captures,admission};
 fs.writeFileSync('audit-output/provider-market-actual.json',JSON.stringify(data,null,2));
 console.log(JSON.stringify({status:'ACTUAL_PROVIDER_READ_COMPLETE',sourceHTTP:calls,MAIN:0,Telegram:0,results:results.map(r=>({contract:r.contract,status:r.source.status,supply:r.source.supply_status,sector:r.source.sector_status,actual_facts:r.actual_facts.map(f=>f.block_id),http:r.source.network_calls}))}));
}catch(error){fs.writeFileSync('audit-output/provider-market-actual-error.json',JSON.stringify({error:String(error.message),sourceHTTP:calls,MAIN:0,Telegram:0,captures,results}));}
const usage=db.usageSnapshot();await finalizeRunUsage(db,{reservationId:id,sourceRunId:id,now:Date.now(),usage});fs.writeFileSync('audit-output/provider-market-usage.json',JSON.stringify({usage_before_finalization:usage,usage_final:db.usageSnapshot(),sourceHTTP:calls,MAIN:0,Telegram:0}));
