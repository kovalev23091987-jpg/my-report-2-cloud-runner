import test from 'node:test';import assert from 'node:assert/strict';
import {parseSupplementalIdentityRegistry,chooseSupplementalLane,collectSupplementalCandidateContext,resolveDiscoveredIdentity} from '../files/src/supplemental-candidate-context.mjs';
class DB{constructor(){this.rows=new Map();this.identities=new Map();}prepare(sql){const self=this;return{bind(...args){return{async first(){const row=self.identities.get(args[0]);return row&&row.expires_ts>=args[1]?row:null;},async run(){if(sql.includes('INSERT INTO report2_candidate_source_cache'))self.rows.set(`${args[0]}|${args[1]}`,{source:args[1],observed_ts:args[2],expires_ts:args[3],payload_json:args[4]});if(sql.includes('INSERT INTO report2_supplemental_identity_cache'))self.identities.set(args[0],{observed_ts:args[1],expires_ts:args[2],payload_json:args[3]});return{};},async all(){return{results:[...self.rows.entries()].filter(([k,v])=>k.startsWith(`${args[0]}|`)&&v.expires_ts>=args[1]).map(([,v])=>v)}}};},async run(){return{};}}}}
const addr='0x1111111111111111111111111111111111111111';
test('bad or missing contract identity never opens DEX lane',()=>{
 const registry=parseSupplementalIdentityRegistry({ABC:{chain:'ethereum',contract_or_mint:'ABC'}});
 assert.equal(registry.entries.ABC.identity,null);
 assert.notEqual(chooseSupplementalLane({run_id:'1',contract:'ABC-USDT',entry:registry.entries.ABC,derivatives_venues:2}),'DEX_RISK');
});
test('liquidation venue identities are accepted only in exact native formats',()=>{
 const parsed=parseSupplementalIdentityRegistry({ABC:{lighter_market_id:103,gmx_market_address:addr},BAD:{lighter_market_id:'x',gmx_market_address:'ABC'}});
 assert.equal(parsed.entries.ABC.lighter_market_id,103);assert.equal(parsed.entries.ABC.gmx_market_address,addr);
 assert.equal(parsed.entries.BAD.lighter_market_id,null);assert.equal(parsed.entries.BAD.gmx_market_address,null);
});
test('one selected lane never exceeds five network calls and caches exact identities',async()=>{
 const db=new DB(),seen=[];
 const fetch_impl=async url=>{seen.push(String(url));let body=[];
  if(String(url).includes('geckoterminal'))body={data:[]};
  else if(String(url).includes('goplus'))body={result:{[addr]:{is_honeypot:'0'}}};
  return{ok:true,status:200,json:async()=>body};};
 let chosen=null;for(let i=0;i<100;i++){const lane=chooseSupplementalLane({run_id:String(i),contract:'ABC-USDT',entry:{identity:{chain:'ethereum',contract_or_mint:addr}},derivatives_venues:2});if(lane==='DEX_RISK'){chosen=String(i);break;}}
 const result=await collectSupplementalCandidateContext({db,fetch_impl,registry:{ABC:{chain:'ethereum',contract_or_mint:addr}},contract:'ABC-USDT',run_id:chosen,derivatives_venues:2,now:1_800_000_000_000});
 assert.equal(result.lane,'DEX_RISK');assert.ok(result.network_calls<=5);assert.equal(seen.length,result.network_calls);assert.equal(result.sources.GOPLUS.exact_identity,true);
});
test('without registry only conditional Bitget can run and other identity sources make zero calls',()=>{
 const lane=chooseSupplementalLane({run_id:'x',contract:'ABC-USDT',entry:null,derivatives_venues:2,critical_conflict:false});
 assert.equal(lane,null);
});
test('strong move or manual coin reserves the entire five-call lane for native liquidations',async()=>{
 const db=new DB();let calls=0;
 const result=await collectSupplementalCandidateContext({db,fetch_impl:async()=>{calls++;throw Error('must not call');},registry:{ABC:{chain:'ethereum',contract_or_mint:addr}},contract:'ABC-USDT',run_id:'manual',derivatives_venues:0,reserve_for_liquidations:true,now:1_800_000_000_000});
 assert.equal(result.lane,'RESERVED_FOR_LIQUIDATION_PANEL');assert.equal(result.network_calls,0);assert.equal(result.liquidation_lane_reserved,true);assert.equal(calls,0);
});
test('Gecko JSON:API relationship ids must bind the exact requested token',async()=>{
 const db=new DB(),other='0x2222222222222222222222222222222222222222';
 const fetch_impl=async url=>{
  if(String(url).includes('geckoterminal'))return{ok:true,status:200,json:async()=>({data:[{id:'eth_pool1',attributes:{address:'0x3333333333333333333333333333333333333333',reserve_in_usd:'1000',volume_usd:{h24:'500'},transactions:{h24:{buys:30,sells:10}}},relationships:{base_token:{data:{id:`eth_${addr}`}},quote_token:{data:{id:`eth_${other}`}}}}]})};
  if(String(url).includes('goplus'))return{ok:true,status:200,json:async()=>({result:{[addr]:{is_honeypot:'0'}}})};
  return{ok:true,status:200,json:async()=>[]};
 };
 let run='';for(let i=0;i<100;i++)if(chooseSupplementalLane({run_id:String(i),contract:'ABC-USDT',entry:{identity:{chain:'ethereum',contract_or_mint:addr}},derivatives_venues:2})==='DEX_RISK'){run=String(i);break;}
 const result=await collectSupplementalCandidateContext({db,fetch_impl,registry:{ABC:{chain:'ethereum',contract_or_mint:addr}},contract:'ABC-USDT',run_id:run,derivatives_venues:2,now:1_800_000_000_000});
 assert.equal(result.sources.GECKOTERMINAL.status,'CLOSED');assert.equal(result.sources.GECKOTERMINAL.pools[0].buys_24h,30);
});
test('automatic identity opens only when DEX Screener and GeckoTerminal agree on one dominant exact address',()=>{
 const dex={pairs:[{chainId:'ethereum',baseToken:{symbol:'ABC',address:addr},quoteToken:{symbol:'USDT',address:'0x2222222222222222222222222222222222222222'},liquidity:{usd:600000}}]};
 const gecko={included:[{type:'token',id:`eth_${addr}`,attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'550000'},relationships:{base_token:{data:{id:`eth_${addr}`}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]};
 const closed=resolveDiscoveredIdentity({base:'ABC',dex_payload:dex,gecko_payload:gecko,protocols_payload:[]});
 assert.equal(closed.status,'CLOSED');assert.equal(closed.identity.contract_or_mint,addr);assert.equal(closed.identity_method,'DUAL_PROVIDER_DOMINANT_ADDRESS');
 const mismatch=resolveDiscoveredIdentity({base:'ABC',dex_payload:dex,gecko_payload:{...gecko,included:[{type:'token',id:'eth_0x3333333333333333333333333333333333333333',attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'550000'},relationships:{base_token:{data:{id:'eth_0x3333333333333333333333333333333333333333'}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]}});
 assert.equal(mismatch.identity,null);assert.equal(mismatch.exact_identity,false);
});
test('missing manual registry performs one cached three-call identity discovery, then normal lanes use it',async()=>{
 const db=new DB(),urls=[];
 const fetch_impl=async url=>{urls.push(String(url));if(String(url).includes('dexscreener'))return{ok:true,status:200,json:async()=>({pairs:[{chainId:'ethereum',baseToken:{symbol:'ABC',address:addr},quoteToken:{symbol:'USDT'},liquidity:{usd:500000}}]})};if(String(url).includes('geckoterminal'))return{ok:true,status:200,json:async()=>({included:[{type:'token',id:`eth_${addr}`,attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'500000'},relationships:{base_token:{data:{id:`eth_${addr}`}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]})};if(String(url).includes('llama.fi'))return{ok:true,status:200,json:async()=>[]};return{ok:true,status:200,json:async()=>({})};};
 const first=await collectSupplementalCandidateContext({db,fetch_impl,registry:{},contract:'ABC-USDT',run_id:'r1',derivatives_venues:2,now:1_800_000_000_000});
 assert.equal(first.lane,'IDENTITY_DISCOVERY');assert.equal(first.network_calls,3);assert.equal(first.identity_status,'CLOSED');
 const second=await collectSupplementalCandidateContext({db,fetch_impl,registry:{},contract:'ABC-USDT',run_id:'r2',derivatives_venues:2,now:1_800_000_001_000});
 assert.notEqual(second.lane,'IDENTITY_DISCOVERY');assert.ok(second.network_calls<=5);assert.equal(urls.filter(x=>x.includes('/search/pools?')).length,1);
});
