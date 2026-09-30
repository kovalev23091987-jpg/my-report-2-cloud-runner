import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const runtime=path.resolve(process.argv[2]||'runtime'),out=path.resolve(process.argv[3]||'audit-output');
fs.mkdirSync(out,{recursive:true});
const load=file=>import(pathToFileURL(path.join(runtime,'src',file)).href);
const {collectCrossExchangeRiskContext}=await load('cross-exchange-risk-context.mjs');
const {collectGateLiquidationHistory,formatLiquidationHistoryFacts}=await load('gate-liquidation-history.mjs');
const {installProviderMinuteLedger}=await load('provider-minute-ledger.mjs');
const sql=new DatabaseSync(':memory:'),db={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};
await installProviderMinuteLedger(db);
let calls=0;
const fetch_impl=(url,options)=>{assert.ok(!String(url).includes('telegram'));assert.ok(++calls<=10,'LIVE_HTTP_ENVELOPE_EXCEEDED');return fetch(url,options);};
const params={db,fetch_impl,contract:'BTW-USDT',coinalyze_api_key:process.env.COINALYZE_API_KEY||'',lane_override:'HISTORY',allowed_lanes:['HISTORY'],include_htx_realized:true},cycles=[];
for(let i=0;i<3;i++){const risk=await collectCrossExchangeRiskContext({...params,run_id:`LIVE_${process.env.GITHUB_RUN_ID||'LOCAL'}_${i}`,now:Date.now()});assert.ok(risk.network_calls<=3);cycles.push(risk);if(risk.sources.GATE_LIQUIDATION_HISTORY?.history?.complete_window)break;}
let gate=cycles.at(-1).sources.GATE_LIQUIDATION_HISTORY;
if(!gate){gate=await collectGateLiquidationHistory({db,fetch_impl,contract:params.contract,run_id:`LIVE_GATE_${process.env.GITHUB_RUN_ID||'LOCAL'}`,now:Date.now(),max_http:2});}
const facts=formatLiquidationHistoryFacts({sources:{...cycles.at(-1).sources,GATE_LIQUIDATION_HISTORY:gate}});
const result={schema:'report2-liquidation-source-data-live-acceptance-v1',head:process.env.GITHUB_SHA||null,contract:params.contract,status:gate.status==='CLOSED'&&gate.history?.complete_window?'CLOSED':'NOT_CLOSED',gate,cycles,facts,network_calls:calls,htx_realized:cycles.at(-1).sources.HTX_REALIZED_LIQUIDATIONS??null,production_d1_writes:0,telegram_network_calls:0,keys_included:false,provider_zone_count:null,projected_clusters_claimed:false,observed_at:new Date().toISOString()};
fs.writeFileSync(path.join(out,'liquidation-source-live.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,contract:params.contract,gate_status:gate.status,closed_buckets:gate.history?.observed_buckets,coinalyze_status:cycles.at(-1).sources.COINALYZE?.status??cycles.at(-1).receipts.find(r=>r.source==='COINALYZE')?.status,network_calls:calls,facts}));
assert.equal(result.htx_realized?.status,'CLOSED','HTX_PUBLIC_V3_EVENTS_NOT_CLOSED');sql.close();assert.equal(result.status,'CLOSED','EXACT_GATE_120_MINUTE_HISTORY_NOT_CLOSED');
