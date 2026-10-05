import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeCoinpaprikaHtxIdentity} from '../files/src/coinpaprika-htx-identity.mjs';
import {collectHtxAssetIdentity,collectHtxBoundSupplementalContext} from '../files/src/htx-asset-identity.mjs';
import {createUnifiedHttpBudget} from '../files/src/unified-budget.mjs';

const ADDRESS='0x'+'a'.repeat(40),NOW=Date.now();
const row=(base,id,url='https://www.htx.com/trade/br_usdt')=>({pair:`${base}/USDT`,base_currency_id:id,base_currency_name:base,quote_currency_id:'usdt-tether',quote_currency_name:'Tether',market_url:url,category:'Spot'});
const metadata=(id='br-project',symbol='BR',contracts=[{platform:'eth-ethereum',contract:ADDRESS}])=>({id,symbol,is_active:true,contracts});
class D1{
 constructor(){this.sql=new DatabaseSync(':memory:');}
 prepare(sql){const db=this;const stmt=args=>({bind:(...next)=>stmt(next),async run(){const r=db.sql.prepare(sql).run(...args);return{meta:{changes:r.changes}};},async first(){return db.sql.prepare(sql).get(...args)||null;},async all(){return{results:db.sql.prepare(sql).all(...args)}}});return stmt([]);}
 async batch(rows){const out=[];for(const row of rows)out.push(await row.run());return out;}
}

test('exact HTX market plus one exact chain address closes identity without ticker substitution',()=>{
 const closed=normalizeCoinpaprikaHtxIdentity({contract:'BR-USDT',markets:[row('BR','br-project')],metadata:metadata()});
 assert.equal(closed.status,'CLOSED');assert.deepEqual(closed.identity,{chain:'ethereum',contract_or_mint:ADDRESS});
 assert.equal(normalizeCoinpaprikaHtxIdentity({contract:'BOHR-USDT',markets:[row('BR','br-project')],metadata:metadata()}).status,'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA');
 assert.equal(normalizeCoinpaprikaHtxIdentity({contract:'BR-USDT',markets:[row('BR','br-project','https://evil.example/trade/br_usdt')],metadata:metadata()}).status,'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA');
});

test('ambiguous provider IDs, symbols and supported chain addresses stay closed',()=>{
 assert.equal(normalizeCoinpaprikaHtxIdentity({contract:'BR-USDT',markets:[row('BR','br-project'),row('BR','br-other')],metadata:metadata()}).status,'AMBIGUOUS_COINPAPRIKA_HTX_MARKET_IDENTITY');
 assert.equal(normalizeCoinpaprikaHtxIdentity({contract:'BR-USDT',markets:[row('BR','br-project')],metadata:metadata('br-project','BOHR')}).status,'COINPAPRIKA_ASSET_METADATA_MISMATCH');
 assert.equal(normalizeCoinpaprikaHtxIdentity({contract:'BR-USDT',markets:[row('BR','br-project')],metadata:metadata('br-project','BR',[{platform:'eth-ethereum',contract:ADDRESS},{platform:'sol-solana',contract:'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'}])}).status,'AMBIGUOUS_COINPAPRIKA_CHAIN_ADDRESSES');
});

test('one shared fallback catalog is cached and the exact identity reaches the supplemental consumer',async()=>{
 const db=new D1(),budget=createUnifiedHttpBudget();let calls=0;
 const fetch_impl=async url=>{calls++;if(String(url).includes('/v2/reference/currencies'))return new Response(JSON.stringify({code:200,data:[]}));if(String(url).includes('/exchanges/htx/markets'))return new Response(JSON.stringify([row('BR','br-project')]));if(String(url).includes('/coins/br-project'))return new Response(JSON.stringify(metadata()));throw Error(`unexpected ${url}`);};
 const params={db,request_admit:budget.reserve,run_id:'GENERAL',now:NOW,clock:()=>NOW,fetch_impl};
 const first=await collectHtxAssetIdentity({...params,contract:'BR-USDT'}),second=await collectHtxAssetIdentity({...params,contract:'BR-USDT',now:NOW+1000});
 assert.equal(first.status,'CLOSED');assert.equal(first.identity_method,'COINPAPRIKA_EXACT_HTX_SPOT_MARKET_AND_CHAIN_ADDRESS');assert.equal(first.htx_asset_reference_status,'HTX_CURRENCY_NOT_FOUND');assert.equal(first.network_calls,3);
 assert.equal(second.status,'CLOSED');assert.equal(second.network_calls,0);assert.equal(calls,3);
 let captured;
 const context=await collectHtxBoundSupplementalContext({...params,contract:'BR-USDT',now:NOW+2000,registry:{},supplemental_collect:async input=>{captured=input;return{status:'CLOSED',network_calls:0,asset_identity:input.registry.BR,asset_metadata:{}};}});
 assert.equal(captured.registry.BR.contract_or_mint,ADDRESS);assert.equal(captured.registry.BR.coinpaprika_id,'br-project');assert.equal(context.identity_method,'COINPAPRIKA_EXACT_HTX_SPOT_MARKET_AND_CHAIN_ADDRESS');assert.equal(calls,3);
});
