import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';
import {collectOfficialEventsEvidence} from '../../current-generation/files/src/official-events-evidence.mjs';
import {compileOfficialSourceRegistry} from '../../current-generation/files/src/official-source-registry.mjs';
import {consumeBlockResultContext} from '../../current-generation/files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../../current-generation/files/src/evidence-v2.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`OFFICIAL_NATIVE_ACTUAL:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
const out={schema:'OFFICIAL_NATIVE_FEEDS_CONNECTED_ACTUAL_20261007_V1',head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,MAIN:0,Telegram:0,trading:0,sourceHTTP:0,maximum_sourceHTTP:2,responses:[],status:'NOT_STARTED',new_fresh_SENT:false};
const hash=b=>createHash('sha256').update(b).digest('hex');
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:1600,rows_written:240},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:1600,rows_written:240}});
 try{
  const registry=compileOfficialSourceRegistry(JSON.parse(await fs.readFile('current-generation/files/main-official-event-sources.json','utf8')),{now}).registry;out.components=[];
  for(const [symbol,chain] of [['SOL','solana'],['ADA','cardano']]){
   const spec=registry[symbol].official_feed_specs.find(r=>r.parser_id==='FIXED_GITHUB_RELEASES_V1'),metadata={...registry[symbol],official_feeds:[spec.url],official_feed_specs:[spec]};
   const result=await collectOfficialEventsEvidence({db,contract:symbol+'-USDT',asset_identity:{chain,asset_kind:'NATIVE',native_asset_id:chain+':mainnet',contract_or_mint:null},asset_metadata:metadata,run_id:id+':'+symbol,now,request_admit:r=>({allowed:r.attempts===1,status:'BOUNDED_ACTUAL_SOURCE_COMPONENT_NOT_MAIN'}),fetch_impl:async(url,init)=>{
    if(url!==spec.url||out.sourceHTTP>=2)throw Error('EXACT_RESEARCH_TRANSPORT_REQUIRED');out.sourceHTTP++;
    const r=await fetch(url,init),body=await r.text(),ts=Date.now();if(Buffer.byteLength(body)>512*1024)throw Error('BOUNDED_BODY_EXCEEDED');let payload;try{payload=JSON.parse(body);}catch{payload=null;}
    out.responses.push({contract:symbol+'-USDT',url,received_ts:ts,http_status:r.status,body_sha256:hash(body),payload});return new Response(body,{status:r.status,headers:r.headers});
   }});
   const decision_ts=Date.now(),consumer=consumeBlockResultContext({contract:symbol+'-USDT',evidence:result.evidence,now:decision_ts}),score_check=consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts});
   if(score_check.adjustment!==0)throw Error('OFFICIAL_CONTEXT_ASSIGNED_UNAUTHORIZED_SCORE');
   out.components.push({contract:symbol+'-USDT',identity:{chain,asset_kind:'NATIVE',native_asset_id:chain+':mainnet',contract_or_mint:null},metadata,result,decision_ts,consumer,score_check});
  }
  out.status=out.components.every(c=>c.result.status.startsWith('CLOSED')&&c.consumer.facts.length)?'ACTUAL_PRIMARY_COMPONENT_SOURCE_TO_CONSUMER_CLOSED_NOT_FULL_REPORT_OR_SENT':'ACTUAL_PRIMARY_COMPONENT_MISSING_FACT_RETAINED';
  const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>1400||u.rows_written>220||u.requests>60)throw Error('BOUNDED_D1_USAGE_EXCEEDED');
 }catch(e){out.status='CONNECTED_COMPONENT_FAILED';out.error=String(e?.message||e).slice(0,240);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();await fs.mkdir('audit-output',{recursive:true});const bytes=Buffer.from(JSON.stringify(out));await fs.writeFile('audit-output/official-native-actual-connected.json.gz',gzipSync(bytes,{mtime:0}));await fs.writeFile('audit-output/official-native-actual-connected-summary.json',JSON.stringify({...out,responses:out.responses.map(r=>({...r,payload:undefined})),components:out.components?.map(c=>({...c,metadata:undefined,result:{status:c.result.status,events:c.result.events?.length||0,evidence:c.result.evidence.map(e=>({block_id:e.block_id,metric_family:e.metric_family,source_ts:e.source_ts,observed_ts:e.observed_ts}))}})),result:out.result?{status:out.result.status,network_calls:out.result.network_calls,evidence:out.result.evidence.map(r=>({block_id:r.block_id,metric_family:r.metric_family,source_ts:r.source_ts,observed_ts:r.observed_ts,upstream_id:r.upstream_id}))}:null},null,2)+'\n');
console.log(JSON.stringify({status:out.status,sourceHTTP:out.sourceHTTP,d1_usage:out.d1_usage,consumer_facts:out.components?.map(c=>({contract:c.contract,count:c.consumer.facts.length}))||[],MAIN:0,Telegram:0}));if(out.status==='CONNECTED_COMPONENT_FAILED')process.exitCode=1;
