import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiquidationVenueCatalog} from '../files/src/liquidation-extension/venue-catalog-cache.mjs';
class DB{constructor(){this.rows=new Map();}prepare(sql){const self=this;return{bind(...args){return{async all(){return{results:[...self.rows.values()].filter(x=>x.expires_ts>=args[0])};},async run(){if(sql.includes('INSERT INTO'))self.rows.set(args[0],{source:args[0],observed_ts:args[1],expires_ts:args[2],payload_json:args[3]});return{};}};},async run(){return{};}}}}
const response=x=>({ok:true,status:200,json:async()=>x});
test('official Lighter and GMX catalogs build exact venue identities once per day',async()=>{
 const db=new DB();let calls=0;const fetch_impl=async url=>{calls++;if(String(url).includes('lighter'))return response({code:200,order_books:[{symbol:'FIL',market_id:103,market_type:'perp',status:'active'},{symbol:'OLD',market_id:2,market_type:'perp',status:'inactive'}]});return response([{name:'FIL/USD [WETH-USDC]',market_token:'0x1111111111111111111111111111111111111111'}]);};
 const first=await loadLiquidationVenueCatalog({db,fetch_impl,now:1000});assert.equal(first.network_calls,2);assert.equal(first.entries.FIL.lighter_market_id,103);assert.equal(first.entries.FIL.gmx_market_address,'0x1111111111111111111111111111111111111111');assert.equal(first.entries.OLD,undefined);
 const second=await loadLiquidationVenueCatalog({db,fetch_impl,now:2000});assert.equal(second.network_calls,0);assert.equal(calls,2);assert.ok(second.receipts.every(x=>x.status==='CACHE_HIT'));
});

test('structural gTrade hints are returned separately from exact Lighter/GMX market identities',async()=>{
 const db=new DB();db.rows.set('GTRADE_ROUTING',{source:'GTRADE_ROUTING',observed_ts:1000,expires_ts:10000,payload_json:JSON.stringify({schema:'GTRADE_STRUCTURAL_ROUTING_CATALOG_V1',markets:[{contract:'FIL-USDT',pair_index:3}]})});
 const catalog=await loadLiquidationVenueCatalog({db,now:2000,fetch_impl:async()=>response([])});assert.equal(catalog.gtrade_routing_catalog.markets[0].contract,'FIL-USDT');assert.deepEqual(catalog.entries,{});
});
