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
const [binance,bybit]=await Promise.all([get('https://fapi.binance.com/fapi/v1/exchangeInfo'),get('https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=QNTUSDT')]);
const now=Date.now();db.sql.exec('CREATE TABLE report2_cross_exchange_catalog(catalog_id TEXT,expires_ts INTEGER,payload_json TEXT)');db.sql.prepare('INSERT INTO report2_cross_exchange_catalog VALUES(?,?,?)').run('CEX_V2',now+86400000,JSON.stringify({entries:normalizeCrossExchangeCatalogs({binance,bybit})}));
const budget=createUnifiedHttpBudget(),args={contract:'QNT-USDT',run_id:'VOLUME_LIVE_ONCE',request_admit:budget.reserve};
const htx=await collectReadyHtxVolumeProfile(args),peers=await collectCrossVenueVolumeProfiles({...args,db});
const price=htx.last_closed_bars?.at(-1)?.close,consensus=selectComparableVolumeProfiles({contract:args.contract,now:Date.now(),reference_price:price,direction:'LONG',peer_sources:peers.sources}),evidence=buildSupplementalScoreEvidence({direction:'LONG',contract:args.contract,observed_ts:Date.now(),reference_price:price,volume_profile:consensus.primary,volume_consensus:consensus});
console.log(JSON.stringify({status:'BOUNDED_VOLUME_PROFILE_ACCEPTANCE',now:new Date().toISOString(),htx:{status:htx.status,reason:htx.reason,window_minutes:htx.window_minutes,unique_trades:htx.unique_trades,poc:htx.poc,val:htx.val,vah:htx.vah,receipts:htx.receipts,fallback_reasons:htx.fallback_reasons},peers:Object.fromEntries(Object.entries(peers.sources).map(([k,v])=>[k,{status:v.status,reason:v.reason,windows:v.profiles?.map(p=>({minutes:p.window_minutes,poc:p.poc})),failures:v.failures}])),catalog_receipts:receipts,peer_receipts:peers.receipts,consensus:{status:consensus.status,confirmations:consensus.confirmations,conflicts:consensus.conflicts,skipped:consensus.skipped},score_control:applySupplementalScoreAdjustment(70,evidence),total_http:2+htx.network_calls+peers.network_calls,maximum_http:9,production_database_writes:0,history_accumulated:false,telegram_calls:0,orders:0},null,2));
if(2+htx.network_calls+peers.network_calls>9)throw Error('BOUNDED_HTTP_EXCEEDED');db.sql.close();
