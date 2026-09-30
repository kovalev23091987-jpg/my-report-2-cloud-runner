import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(process.argv[2]||'runtime');
const {collectCoingeckoSectorEvidence}=await import(pathToFileURL(path.join(root,'src/coingecko-sector-evidence.mjs')));
const {collectCoinpaprikaSectorEvidence}=await import(pathToFileURL(path.join(root,'src/coinpaprika-sector-evidence.mjs')));
const {buildRuntimeCanonicalBundle}=await import(pathToFileURL(path.join(root,'src/canonical-runtime-adapter.mjs')));
const sqlite=new DatabaseSync(':memory:');
const db={prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};
const output='audit-output/ready-sectors';fs.mkdirSync(output,{recursive:true});
const receipts=[];let calls=0;
const fetch_impl=async(url,opts)=>{assert.ok(++calls<=6,'PUBLIC_ACCEPTANCE_CAP');assert.match(url,/^https:\/\/api\.(coingecko\.com|coinpaprika\.com)\//);const response=await fetch(url,opts),body=await response.text(),file=`response-${calls}.json`;fs.writeFileSync(path.join(output,file),body);receipts.push({url,http_status:response.status,file,sha256:createHash('sha256').update(body).digest('hex')});return new Response(body,{status:response.status,headers:response.headers});};
const checks=[{contract:'LINK-USDT',asset_identity:{chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'},asset_metadata:{},collect:collectCoingeckoSectorEvidence},{contract:'JUP-USDT',asset_identity:{chain:'solana',contract_or_mint:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'},asset_metadata:{coinpaprika_id:'jup-jupiter-exchange-token',sector_tag:'exchange'},collect:collectCoinpaprikaSectorEvidence}];
const rows=[];
for(const {collect,...p} of checks){const now=Date.now(),source=await collect({...p,db,fetch_impl,request_admit:()=>({allowed:true}),run_id:'SECTOR_ACCEPTANCE:'+p.contract,now}),input={contract:p.contract,run_id:'sector-acceptance',snapshot_id:'sector-acceptance',observed_ts:Date.now(),discovery_row:{current_price:10},publication_shadow:{entry_signal:{state:'REJECTED',direction:'LONG'}}},before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:source,candidate_context:{asset_identity:p.asset_identity}}});
 assert.deepEqual(before.canonical.scores,after.canonical.scores);assert.equal(before.canonical.state,after.canonical.state);
 const context=after.canonical.metadata.supporting_context.blocks.sector_comparison;
 if(source.status==='CLOSED'){assert.equal(context.status,'CLOSED');assert.match(after.manual.text,/Сектор/);}
 fs.writeFileSync(path.join(output,p.contract+'-report.txt'),after.manual.text);
 const cached=await collect({...p,db,fetch_impl,request_admit:()=>{throw Error('CACHE_MUST_NOT_RESERVE');},run_id:'CACHED:'+p.contract,now:Date.now()});assert.equal(cached.network_calls,0);
 rows.push({contract:p.contract,status:source.status,context_status:context.status,network_calls:source.network_calls,summary:source.summary,cache_status:cached.cache_status,scores_unchanged:true});
}
const result={status:rows.every(r=>r.status==='CLOSED'&&r.context_status==='CLOSED')?'READY_SECTOR_LIVE_PASS':'READY_SECTOR_SOURCE_LIMITATION',commit:process.env.GITHUB_SHA,actual_http:calls,max_http:6,production_writes:0,telegram_calls:0,orders:0,history_accumulation:false,rows,receipts};
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('READY_SECTOR_ACCEPTANCE '+JSON.stringify(result));sqlite.close();
