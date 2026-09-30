// Bounded public REST verification; isolated SQLite; no production writes,
// no tape accumulation, no Telegram and no trading APIs.
import {DatabaseSync} from 'node:sqlite';
import {installProviderMinuteLedger} from '../../current-generation/files/src/provider-minute-ledger.mjs';
import {createUnifiedHttpBudget} from '../../current-generation/files/src/unified-budget.mjs';
import {normalizeCrossExchangeCatalogs} from '../../current-generation/files/src/cross-exchange-risk-context.mjs';
import {collectReadyHtxVolumeProfile} from '../../current-generation/files/src/htx-volume-profile-collector.mjs';
import {collectCrossVenueVolumeProfiles,selectComparableVolumeProfiles} from '../../current-generation/files/src/cross-venue-volume-profile.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from '../../current-generation/files/src/supplemental-score-evidence.mjs';
class DB{constructor(){this.sql=new DatabaseSync(':memory:');}prepare(sql){const raw=this.sql;return {async run(){return raw.prepare(sql).run();},bind(...xs){return {async run(){return raw.prepare(sql).run(...xs);},async first(){return raw.prepare(sql).get(...xs)||null;},async all(){return {results:raw.prepare(sql).all(...xs)};}};}};}}
const db=new DB();await installProviderMinuteLedger(db);const receipts=[];
async function get(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});receipts.push({url:new URL(url).pathname,http_status:r.status});return r.ok?await r.json():null;}catch{return null;}}
const okx=await get('https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=QNT-USDT-SWAP');
const now=Date.now();db.sql.exec('CREATE TABLE report2_cross_exchange_catalog(catalog_id TEXT,expires_ts INTEGER,payload_json TEXT)');db.sql.prepare('INSERT INTO report2_cross_exchange_catalog VALUES(?,?,?)').run('CEX_V2',now+86400000,JSON.stringify({entries:normalizeCrossExchangeCatalogs({okx})}));
const budget=createUnifiedHttpBudget(),peers=await collectCrossVenueVolumeProfiles({contract:'QNT-USDT',run_id:'OKX_VOLUME_LIVE_ONCE',request_admit:budget.reserve,db});
console.log(JSON.stringify({status:'BOUNDED_OKX_VOLUME_PROFILE_ACCEPTANCE',prior_htx_acceptance_run:36739805083,now:new Date().toISOString(),catalog_receipts:receipts,peers:Object.fromEntries(Object.entries(peers.sources).map(([k,v])=>[k,{status:v.status,reason:v.reason,windows:v.profiles?.map(p=>({minutes:p.window_minutes,trades:p.unique_trades,poc:p.poc,val:p.val,vah:p.vah})),failures:v.failures}])),peer_receipts:peers.receipts,total_http:1+peers.network_calls,maximum_http:3,production_database_writes:0,history_accumulated:false,telegram_calls:0,orders:0},null,2));
if(1+peers.network_calls>3)throw Error('BOUNDED_HTTP_EXCEEDED');db.sql.close();
