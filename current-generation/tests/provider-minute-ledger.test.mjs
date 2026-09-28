import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../files/src/provider-minute-ledger.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){const out=this.db.sqlite.prepare(this.sql).run(...this.args);return{meta:{changes:Number(out.changes)}};}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)??null;}}
class Db{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}}

test('K28 nine five-unit reservations cannot exceed the rolling thirty-unit minute cap',async()=>{
 const db=new Db(),now=1_800_000_030_000;await installProviderMinuteLedger(db);
 const rows=[];for(let i=0;i<9;i++)rows.push(await reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:`R${i}`,units:5,now:now+i,cap:30}));
 assert.equal(rows.filter(row=>row.allowed).length,6);assert.equal(rows.filter(row=>!row.allowed).length,3);assert.ok(Math.max(...rows.map(row=>row.rolling_units))<=30);
});
test('K27 unavailable ledger fails closed and idempotent reservation never spends twice',async()=>{
 const db=new Db(),now=1_800_000_030_000;await installProviderMinuteLedger(db);
 const a=await reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:'SAME',units:4,now,cap:30}),b=await reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:'SAME',units:4,now:now+1000,cap:30});
 assert.equal(a.allowed,true);assert.equal(b.allowed,true);assert.equal(b.rolling_units,4);
 const broken=await reserveProviderMinuteUnits({prepare(){throw Error('offline');}},{provider:'COINALYZE',reservation_id:'X',units:1,now,cap:30});assert.equal(broken.allowed,false);assert.equal(broken.status,'ADMISSION_LEDGER_UNAVAILABLE');
});
