import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {N05_N12_PUBLIC_SOURCE_DAILY_CAP,publicVenueDailyDemand} from '../files/src/public-venue-source-budget.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts} from '../files/src/evidence-source-store.mjs';
import {n05SourceHasHeadroom} from '../files/src/n05-source-headroom.mjs';
import {collectN05VenueRoutes} from '../files/src/external-n05-flow-collector.mjs';
import {HTTP_LIMITS,D1_DAILY_LIMITS} from '../files/src/unified-budget.mjs';

const makeDb=()=>{const s=new DatabaseSync(':memory:');return{prepare(sql){const st=s.prepare(sql);return{bind(...a){this.a=a;return this;},async run(){return st.run(...this.a||[]);},async first(){return st.get(...this.a||[])||null;}};},async batch(a){return Promise.all(a.map(x=>x.run()));}};};
test('all-cold public routes cover 36 full cycles plus conservative manual and burst reserve',()=>{
 assert.equal(publicVenueDailyDemand(),500);assert.equal(N05_N12_PUBLIC_SOURCE_DAILY_CAP,512);
 assert.equal(HTTP_LIMITS.whole_job,164);assert.equal(D1_DAILY_LIMITS.rows_read,3500000);assert.equal(D1_DAILY_LIMITS.rows_written,70000);
});
test('512 is a durable daily ceiling; prior reservations are preserved and another venue is independent',async()=>{
 const db=makeDb(),now=1791900000000,source='N05_OFFICIAL_FLOW:GATE';await installEvidenceSourceStore(db);
 const reserve=(id,attempts=1,s=source)=>reserveEvidenceSourceAttempts(db,{source:s,reservation_id:id,attempts,daily_cap:N05_N12_PUBLIC_SOURCE_DAILY_CAP,now});
 assert.equal((await reserve('OLD_DAY_USAGE',16)).allowed,true);assert.equal(await n05SourceHasHeadroom(db,source,512,now),true);
 assert.equal((await reserve('REMAINING',496)).allowed,true);assert.equal(await n05SourceHasHeadroom(db,source,512,now),false);
 assert.equal((await reserve('EXCESS')).allowed,false);assert.equal((await reserve('FALLBACK',1,'N05_OFFICIAL_FLOW:BITGET')).allowed,true);
 assert.equal((await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1').bind(source).first()).attempts,512);
});
test('larger daily headroom does not multiply the five shared requests across fallback venues',async()=>{
 let admitted=0,actual=0;const route=async p=>{let calls=0;for(let i=0;i<5;i++){const a=p.request_admit({attempts:1,logical_request_id:String(actual)+':'+i});if(a.allowed){calls++;actual++;}}return{network_calls:calls,components:[],evidence:[]};};
 const result=await collectN05VenueRoutes({request_admit:()=>{admitted++;return{allowed:true};}},[['GATE',route],['BITGET',route],['KUCOIN',route]]);
 assert.equal(admitted,5);assert.equal(actual,5);assert.equal(result.caller_reserved_requests,5);assert.equal(result.network_calls,5);
});
