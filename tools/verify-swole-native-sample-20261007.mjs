import {parseSwoleAccountDiscovery} from '../current-generation/files/src/liquidation-extension/swole-account-discovery.mjs';
import {selectNativeAccountSample} from '../current-generation/files/src/liquidation-extension/select-native-account-sample.mjs';
import {gunzipSync} from 'node:zlib';
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../current-generation/files/src/liquidation-extension/d1-source-admission.mjs';
import {normalizeNativeHL} from '../current-generation/files/src/liquidation-extension/providers.mjs';
import {LIQUIDATION_ALLOWANCE_GENERATION} from '../current-generation/files/src/liquidation-extension/install-source-allowances.mjs';
import {readJson} from '../current-generation/files/src/liquidation-extension/io.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),started=Date.now(),run_id=`SWOLE_DISCOVERY:${process.env.GITHUB_RUN_ID}:${started}`,reservation={rows_read:1250,rows_written:100};
const proof={schema:'SWOLE_NATIVE_DISCOVERY_RESEARCH_V1',head:process.env.GITHUB_SHA,run_id,started_ts:started,source_cap:1,sourceHTTP:0,MAIN:0,Telegram:0,enabled_for_decisions:false,reason:'Initial largest account has no native liquidation price; reuse exact retained discovery page, exclude null liquidation hints and verify one balanced nearest account with one new native read',rows:[]};
const raw=[];fs.mkdirSync('audit-output',{recursive:true});
try{
 const day=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});proof.day_admission=day;
 if(!day.allowed){proof.status='D1_ADMISSION_BLOCKED';}
 else{
  await reserveRunBudget(db,{reservationId:run_id,now:started,reservation});
  try{
   const month=new Date(started).toISOString().slice(0,7).replace('-',''),date=new Date(started),window_start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1),window_end=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1),scope_id=`SWOLE_RESEARCH_V1:${month}:SWOLE_DISCOVERY`,config_fingerprint=createHash('sha256').update('SWOLE_RESEARCH_V1|PUBLIC_KEYLESS|10_REQUESTS_MONTH|NO_OTHER_CONSUMERS').digest('hex');
   // Dedicated research scope, keyless public reads, at most10/month; INSERT
   // only, no reset, top-up, migration or production decision activation.
   await db.prepare(`INSERT OR IGNORE INTO report2_liq_source_allowance_shadow(scope_id,provider,unit,window_start_ts,window_end_ts,allowance_units,used_units,version,config_fingerprint,shared_quota_reviewed,active,schema_version) VALUES(?1,'SWOLE_DISCOVERY','REQUEST',?2,?3,10,0,0,?4,1,1,1)`).bind(scope_id,window_start,window_end,config_fingerprint).run();
   const nativeScope=`${LIQUIDATION_ALLOWANCE_GENERATION}:${month}:HYPERLIQUID`,native=await db.prepare('SELECT * FROM report2_liq_source_allowance_shadow WHERE scope_id=?1 LIMIT 1').bind(nativeScope).first();
   if(native?.active!==1||native.allowance_units>10000)throw Error('EXISTING_NATIVE_SCOPE_REQUIRED');
   const admit=createD1SourceAdmission({db,scope_bindings:{SWOLE_DISCOVERY:{scope_id,config_fingerprint},HYPERLIQUID:{scope_id:nativeScope,config_fingerprint:native.config_fingerprint}},within_run_budget:e=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+e.extraRowsRead+4<=reservation.rows_read&&u.rows_written+e.extraRowsWritten+4<=reservation.rows_written};}});
   const grant=await admit({reservation_id:run_id,contract:'FIL-USDT',run_id,requests:{HYPERLIQUID:1},max_requests:1,deadline_ts:started+45000});proof.provider_admission=grant;
   if(grant.allowed!==true||grant.new_reservation!==true)throw Error('DURABLE_PROVIDER_ADMISSION_BLOCKED');
   const saved=JSON.parse(gunzipSync(fs.readFileSync('retained-discovery/swole-native-discovery-raw.json.gz'))),page=saved.raw.find(x=>x.provider==='SWOLE_DISCOVERY'),prior=saved.raw.find(x=>x.provider==='HYPERLIQUID');
   if(saved.head!=='f384d23f32deda2ebbbc37b4df55a514ad63ab52'||!page||createHash('sha256').update(page.body).digest('hex')!==page.receipt.sha256)throw Error('ORIGINAL_DISCOVERY_BODY_NOT_CLOSED');
   const parsed=parseSwoleAccountDiscovery(page.body,{symbol:'FIL'}),position=prior.payload.assetPositions.find(x=>x.position.coin==='FIL')?.position,mark=position?Number(position.positionValue)/Math.abs(Number(position.szi)):null,selected=parsed.ok?selectNativeAccountSample(parsed.payload.positions,{mark_price:mark,max_accounts:1}).selected:[];
   const wallets=selected.map(x=>x.address);proof.discovery={coin:'FIL',account_count:parsed.payload?.positions.length??0,selected:wallets,original_page_receipt:page.receipt,only_discovery_not_levels:true,selection_policy:'NEAR_AND_LARGE_BALANCED_V1',prior_null_native_level_excluded:true};
   if(parsed.ok&&wallets.length){
    proof.sourceHTTP++;const state=await readJson('https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'clearinghouseState',user:wallets[0]},timeout_ms:12000,max_bytes:2000000});raw.push({provider:'HYPERLIQUID',address:wallets[0],...state});
    const normalized=state.ok?normalizeNativeHL({accounts:[{address:wallets[0],state:state.payload}],selection_bias:'SWOLE_POSITIVE_LIQUIDATION_HINT_NEAR_AND_LARGE_SAMPLE'},{symbol:'FIL',route_symbol:'FIL',run_id,snapshot_id:'RESEARCH:FIL:'+state.receipt.received_ts,as_of_ms:Date.now(),received_at_ms:state.receipt.received_ts,max_age_ms:120000}):null;
    proof.rows.push({provider:'HYPERLIQUID',receipt:state.receipt,normalization_status:normalized?.status??state.reason,usable_for_context:normalized?.usable_for_context??false,numeric_level_count:normalized?.zones?.length??0,source_ts:normalized?.source_ts??null,normalized});
    proof.native_account_coins=state.payload?.assetPositions?.map(x=>x?.position?.coin)??[];
   }
   proof.status='ACTUAL_BOUNDED_BATCH_RESPONSES_RETAINED_FOR_VALIDATION';
  }catch(e){proof.status='BATCH_RESEARCH_NOT_CLOSED';proof.reason=String(e.message).slice(0,180);}
  finally{proof.finalized_usage=await finalizeRunUsage(db,{reservationId:run_id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
 }
}catch(e){proof.status='RESEARCH_PREACTION_NOT_CLOSED';proof.reason=String(e.message).slice(0,180);}
proof.completed_ts=Date.now();proof.d1_usage=db.usageSnapshot();
const gz=gzipSync(Buffer.from(JSON.stringify({run_id,head:process.env.GITHUB_SHA,raw})));proof.raw_gzip_sha256=createHash('sha256').update(gz).digest('hex');
fs.writeFileSync('audit-output/swole-native-discovery-raw.json.gz',gz);fs.writeFileSync('audit-output/swole-native-discovery-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
