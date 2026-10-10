import fs from 'node:fs/promises';import vm from 'node:vm';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
import {SOURCE_POLICIES} from '../current-generation/files/src/evidence-source-adapters.mjs';
import {HTX_CATALOG_URLS,HTX_LINEAR_MARGIN_CATALOG_URLS,mergeHtxLinearCatalogModes,buildHtxCryptoUniverse} from '../current-generation/files/src/htx-crypto-universe.mjs';
const root='audit-output/htx-universe-refresh',sha=b=>createHash('sha256').update(b).digest('hex'),started=Date.now();
const old=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
const worker=await fs.readFile('current-generation/files/src/worker.js','utf8'),a=worker.indexOf('function classifyHtxInstrumentScope('),b=worker.indexOf('function symbolFingerprint(',a);if(a<0||b<a)throw Error('PRIMARY_CLASSIFIER_MISSING');
const classify=vm.runInNewContext(worker.slice(a,b)+';classifyHtxInstrumentScope',{}),db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const id='HTX_UNIVERSE_REFRESH:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,reservation={rows_read:4000,rows_written:160},budget=createUnifiedHttpBudget();
const out={schema:'HTX_CURRENT_CRYPTO_FUTURES_UNIVERSE_REFRESH_V1',run:Number(process.env.GITHUB_RUN_ID),head:process.env.GITHUB_SHA,started_ts:started,owner_request_local:'2026-10-10T20:17:04+03:00',sourceHTTP:0,receipts:[],MAIN:0,Telegram:0,source_caps_reset:false,production_enabled:false,classification_is_not_market_or_flow_evidence:true};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,url){
 if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
 const request_id=id+':'+name,whole=budget.reserve({logical_request_id:request_id,lane:'background',attempts:1});if(!whole.allowed||whole.duplicate)throw Error('WHOLE_HTTP_DENIED');
 const daily=await reserveEvidenceSourceAttempts(db,{source:'HTX_PUBLIC_RISK',reservation_id:request_id,attempts:1,daily_cap:SOURCE_POLICIES.HTX_PUBLIC_RISK.daily_cap,now:Date.now()});if(!daily.allowed)throw Error('EXISTING_HTX_PUBLIC_RISK_DAILY_CAP_DENIED');
 const minute=await reserveProviderMinuteUnits(db,{provider:'HTX',reservation_id:request_id,units:1,cap:6,now:Date.now()});if(!minute.allowed)throw Error('HTX_PROVIDER_MINUTE_DENIED');
 const receipt={name,url,sourceHTTP:1,whole_admission:whole,daily_admission:daily,minute_admission:minute,file:name+'.json.gz'};out.receipts.push(receipt);out.sourceHTTP++;
 const response=await fetch(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});receipt.http_status=response.status;
 const parts=[];let size=0;for await(const p of response.body){size+=p.length;if(size>8388608)throw Error('BODY_LIMIT');parts.push(p);}
 const raw=Buffer.concat(parts),gz=gzipSync(raw);receipt.received_ts=Date.now();receipt.body_sha256=sha(raw);receipt.gzip_sha256=sha(gz);receipt.bytes=raw.length;await fs.writeFile(root+'/'+receipt.file,gz);
 if(response.status!==200)throw Error('HTTP_'+response.status);const payload=JSON.parse(raw);receipt.source_ts=payload.ts;return payload;
}
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await reserveRunBudget(db,{reservationId:id,now:started,reservation});admitted=true;
 const base=await get('linear-default',HTX_CATALOG_URLS.linear),modes={};
 for(const[mode,url]of Object.entries(HTX_LINEAR_MARGIN_CATALOG_URLS))modes[mode]=await get('linear-'+mode,url);
 const coin_swap=await get('coin-swap',HTX_CATALOG_URLS.coin_swap),coin_delivery=await get('coin-delivery',HTX_CATALOG_URLS.coin_delivery),observed_ts=Date.now();
 const merged=mergeHtxLinearCatalogModes({base,modes,observed_ts});out.margin_modes={status:merged.status,counts:merged.counts,empty_modes:merged.empty_modes,failures:merged.failures,new_contracts_vs_default:merged.new_contracts_vs_default};if(merged.status!=='CLOSED')throw Error('MARGIN_CATALOG_NOT_CLOSED');
 const universe=buildHtxCryptoUniverse({catalogs:{linear:merged.payload,coin_swap,coin_delivery},classify_linear:classify,observed_ts});
 out.counts=universe.counts;out.failures=universe.failures;out.original_observed_ts=observed_ts;if(universe.status!=='CLOSED')throw Error('PRIMARY_CRYPTO_SCOPE_NOT_CLOSED');
 const oldAssets=new Set(old.assets.map(r=>r.symbol)),newAssets=new Set(universe.assets.map(r=>r.symbol)),key=r=>r.family+':'+r.contract_code,oldContracts=new Set(old.contracts.map(key)),newContracts=new Set(universe.contracts.map(key));
 out.added_assets=[...newAssets].filter(s=>!oldAssets.has(s));out.removed_assets=[...oldAssets].filter(s=>!newAssets.has(s));out.added_contracts=universe.contracts.filter(r=>!oldContracts.has(key(r)));out.removed_contracts=old.contracts.filter(r=>!newContracts.has(key(r)));
 out.analysis_contracts=universe.assets.filter(r=>r.asset_analysis_contract).map(r=>({contract_code:r.asset_analysis_contract,asset_symbol:r.symbol}));out.unsupported_exact_contracts=universe.contracts.filter(r=>!r.production_market_adapter_supported).map(r=>({family:r.family,contract_code:r.contract_code}));
 out.noncrypto_excluded=universe.excluded.map(r=>({family:r.family,contract_code:r.contract_code,asset_symbol:r.asset_symbol,reasons:r.scope.reasons,evidence:r.scope.evidence}));
 const bytes=Buffer.from(JSON.stringify(universe,null,2)+'\n'),gz=gzipSync(bytes);await fs.writeFile(root+'/htx-current-crypto-futures-universe.json.gz',gz);out.manifest={file:'htx-current-crypto-futures-universe.json.gz',body_sha256:sha(bytes),gzip_sha256:sha(gz),bytes:bytes.length};
 out.status='CURRENT_PRIMARY_ALL_MARGIN_MODES_CRYPTO_FUTURES_UNIVERSE_CLOSED';
}catch(e){out.status='UNIVERSE_REFRESH_NOT_CLOSED';out.reason=e.message;}
finally{
 if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();out.whole_http=budget.summary();out.completed_ts=Date.now();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written){out.status='D1_ENVELOPE_NOT_CLOSED';out.reason='D1_ENVELOPE_NOT_CLOSED';}
 await fs.writeFile(root+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,analysis_contracts:out.analysis_contracts?.length,noncrypto_excluded:out.noncrypto_excluded?.length,added_contracts:out.added_contracts?.map(r=>r.contract_code),removed_contracts:out.removed_contracts?.map(r=>r.contract_code),unsupported_exact_contracts:out.unsupported_exact_contracts?.length}));if(out.status!=='CURRENT_PRIMARY_ALL_MARGIN_MODES_CRYPTO_FUTURES_UNIVERSE_CLOSED')process.exitCode=1;
}
