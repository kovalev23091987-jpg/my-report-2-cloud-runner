import test from 'node:test';import assert from 'node:assert/strict';
import {parseSupplementalIdentityRegistry,chooseSupplementalLane,collectSupplementalCandidateContext,resolveDiscoveredIdentity,SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION} from '../files/src/supplemental-candidate-context.mjs';
class DB{constructor(){this.rows=new Map();this.identities=new Map();}prepare(sql){const self=this;return{bind(...args){return{async first(){const row=self.identities.get(args[0]);return row&&row.expires_ts>=args[1]?row:null;},async run(){if(sql.includes('INSERT INTO report2_candidate_source_cache'))self.rows.set(`${args[0]}|${args[1]}`,{source:args[1],observed_ts:args[2],expires_ts:args[3],payload_json:args[4]});if(sql.includes('INSERT INTO report2_supplemental_identity_cache'))self.identities.set(args[0],{observed_ts:args[1],expires_ts:args[2],payload_json:args[3]});return{};},async all(){return{results:[...self.rows.entries()].filter(([k,v])=>k.startsWith(`${args[0]}|`)&&v.expires_ts>=args[1]).map(([,v])=>v)}}};},async run(){return{};}}}}
const addr='0x1111111111111111111111111111111111111111';
test('needed futures confirmation always precedes optional DEX protocol and spot context',()=>{
 const entry={identity:{chain:'ethereum',contract_or_mint:addr},protocol_slug:'abc',coinbase_product:'ABC-USD'};
 for(let i=0;i<100;i++)for(const missing of [true,false])assert.equal(chooseSupplementalLane({run_id:String(i),contract:'ABC-USDT',entry,derivatives_venues:missing?1:3,critical_conflict:!missing}),'BITGET_FALLBACK');
 assert.notEqual(chooseSupplementalLane({entry,derivatives_venues:1,cached_sources:{BITGET:{status:'SOURCE_ERROR'}}}),'BITGET_FALLBACK');
 assert.equal(chooseSupplementalLane({entry:{protocol_slug:'abc'},derivatives_venues:2}),null);
});
test('all retained source responses suppress repeat HTTP until their existing TTL',async()=>{
 const db=new DB(),now=1_800_000_000_000;
 for(const source of ['BITGET','COINBASE','DEX_SCREENER','GECKOTERMINAL','GOPLUS','DEFILLAMA'])db.rows.set(`ABC-USDT|${source}`,{source,observed_ts:now-1000,expires_ts:now+60000,payload_json:JSON.stringify({source,status:'CLOSED',price:110,context_version:SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION})});
 let calls=0;const result=await collectSupplementalCandidateContext({db,registry:{ABC:{chain:'ethereum',contract_or_mint:addr,protocol_slug:'abc',coinbase_product:'ABC-USD'}},contract:'ABC-USDT',run_id:'cached',derivatives_venues:1,primary_price:100,now,fetch_impl:async()=>{calls++;throw Error('unexpected HTTP');}});
 assert.equal(calls,0);assert.equal(result.network_calls,0);assert.equal(result.sources.BITGET.price_difference_vs_htx_pct,10.000000000000009);assert.equal(result.sources.COINBASE.cache_status,'HIT');
});
test('DEX refresh reuses the longer token-security cache',async()=>{
 const db=new DB(),now=1_800_000_000_000;
 for(const source of ['GOPLUS','COINBASE'])db.rows.set(`ABC-USDT|${source}`,{source,observed_ts:now-1000,expires_ts:now+60000,payload_json:JSON.stringify({source,status:'CLOSED',context_version:SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION})});
 const urls=[];const result=await collectSupplementalCandidateContext({db,registry:{ABC:{chain:'ethereum',contract_or_mint:addr}},contract:'ABC-USDT',run_id:'refresh',derivatives_venues:2,now,fetch_impl:async url=>{urls.push(String(url));return new Response(JSON.stringify(String(url).includes('geckoterminal')?{data:[]}:[]));}});
 assert.equal(result.lane,'DEX_RISK');assert.equal(result.network_calls,2);assert.equal(urls.some(u=>u.includes('goplus')),false);assert.equal(result.sources.GOPLUS.cache_status,'HIT');
});
test('missing derivative confirmation is collected before unrelated asset discovery',async()=>{
 const db=new DB(),urls=[];const result=await collectSupplementalCandidateContext({db,registry:{},contract:'ABC-USDT',run_id:'gap',derivatives_venues:1,now:1_800_000_000_000,fetch_impl:async url=>{urls.push(String(url));return new Response(JSON.stringify({data:[{symbol:'ABCUSDT',lastPr:'100',fundingRate:'0.001'}]}));}});
 assert.equal(result.lane,'BITGET_FALLBACK');assert.ok(result.network_calls<=5);assert.ok(urls.slice(0,3).every(u=>u.includes('api.bitget.com')));assert.equal(urls.some(u=>u.includes('/search')),false);assert.equal(result.identity_status,'NOT_CLOSED');
});
test('required futures confirmation leaves bounded room for unique DEX and security facts',async()=>{
 const db=new DB(),now=1_800_000_000_000,urls=[];
 db.rows.set('ABC-USDT|COINBASE',{source:'COINBASE',observed_ts:now,expires_ts:now+7200000,payload_json:JSON.stringify({source:'COINBASE',status:'CLOSED',context_version:SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION})});
 const params={db,registry:{ABC:{chain:'ethereum',contract_or_mint:addr}},contract:'ABC-USDT',derivatives_venues:1,fetch_impl:async url=>{urls.push(String(url));return new Response(JSON.stringify(String(url).includes('bitget')?{data:[{symbol:'ABCUSDT',lastPr:'100'}]}:String(url).includes('geckoterminal')?{data:[]}:String(url).includes('goplus')?{result:{[addr]:{is_honeypot:'0'}}}:[]));}};
 const first=await collectSupplementalCandidateContext({...params,run_id:'one',now}),second=await collectSupplementalCandidateContext({...params,run_id:'two',now:now+20*60000});
 assert.equal(first.network_calls,5);assert.equal(second.network_calls,4);assert.equal(second.sources.GOPLUS.status,'CLOSED');
 assert.equal(urls.filter(u=>u.includes('dexscreener')).length,1);assert.equal(urls.filter(u=>u.includes('geckoterminal')).length,1);assert.equal(urls.filter(u=>u.includes('goplus')).length,1);
});
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
test('official source metadata is admitted only from the exact manual registry',async()=>{
 const parsed=parseSupplementalIdentityRegistry({ABC:{official_name:'ABC Protocol',official_domains:['https://abc.example/docs','bad host'],official_feeds:['https://abc.example/events.xml','http://unsafe.example/feed'],snapshot_space:'abc.eth'}});
 assert.deepEqual(parsed.entries.ABC.official_domains,['abc.example']);
 assert.deepEqual(parsed.entries.ABC.official_feeds,['https://abc.example/events.xml']);
 assert.equal(parsed.entries.ABC.snapshot_space,'abc.eth');
 const db=new DB(),result=await collectSupplementalCandidateContext({db,fetch_impl:async()=>({ok:true,status:200,json:async()=>({})}),registry:{ABC:{official_name:'ABC Protocol',official_domains:['abc.example'],official_feeds:['https://abc.example/events.xml'],official_feed_specs:[{url:'https://abc.example/events.xml',format:'RSS',parser_id:'FIXED_RSS_V1',refresh_period:'1h',timezone:'UTC'}],snapshot_space:'abc.eth'}},contract:'ABC-USDT',run_id:'manual-metadata',derivatives_venues:0,reserve_for_liquidations:true,now:1_800_000_000_000});
 assert.deepEqual(result.asset_metadata,{official_name:'ABC Protocol',official_domains:['abc.example'],official_feeds:['https://abc.example/events.xml'],official_feed_specs:[{url:'https://abc.example/events.xml',format:'RSS',parser_id:'FIXED_RSS_V1',refresh_period:'1h',timezone:'UTC'}],snapshot_space:'abc.eth'});
});
test('automatic ticker identity discovery never invents official domains feeds or governance space',async()=>{
 const db=new DB(),fetch_impl=async url=>{if(String(url).includes('dexscreener'))return{ok:true,status:200,json:async()=>({pairs:[{chainId:'ethereum',baseToken:{symbol:'ABC',address:addr},quoteToken:{symbol:'USDT'},liquidity:{usd:500000}}]})};if(String(url).includes('geckoterminal'))return{ok:true,status:200,json:async()=>({included:[{type:'token',id:`eth_${addr}`,attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'500000'},relationships:{base_token:{data:{id:`eth_${addr}`}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]})};return{ok:true,status:200,json:async()=>[]};};
 const result=await collectSupplementalCandidateContext({db,fetch_impl,registry:{},contract:'ABC-USDT',run_id:'metadata-discovery',derivatives_venues:2,now:1_800_000_000_000});
 assert.deepEqual(result.asset_metadata,{official_name:null,official_domains:[],official_feeds:[],official_feed_specs:[],snapshot_space:null});
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
test('automatic discovery remains a candidate even when two providers agree',()=>{
 const dex={pairs:[{chainId:'ethereum',baseToken:{symbol:'ABC',address:addr},quoteToken:{symbol:'USDT',address:'0x2222222222222222222222222222222222222222'},liquidity:{usd:600000}}]};
 const gecko={included:[{type:'token',id:`eth_${addr}`,attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'550000'},relationships:{base_token:{data:{id:`eth_${addr}`}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]};
 const closed=resolveDiscoveredIdentity({base:'ABC',dex_payload:dex,gecko_payload:gecko,protocols_payload:[]});
 assert.equal(closed.status,'CANDIDATE_ONLY');assert.equal(closed.identity,null);assert.equal(closed.identity_candidate.contract_or_mint,addr);assert.equal(closed.registry_confirmation_required,true);
 const mismatch=resolveDiscoveredIdentity({base:'ABC',dex_payload:dex,gecko_payload:{...gecko,included:[{type:'token',id:'eth_0x3333333333333333333333333333333333333333',attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'550000'},relationships:{base_token:{data:{id:'eth_0x3333333333333333333333333333333333333333'}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]}});
 assert.equal(mismatch.identity,null);assert.equal(mismatch.exact_identity,false);
});
test('missing manual registry caches a candidate but never upgrades it to exact identity',async()=>{
 const db=new DB(),urls=[];
 const fetch_impl=async url=>{urls.push(String(url));if(String(url).includes('dexscreener'))return{ok:true,status:200,json:async()=>({pairs:[{chainId:'ethereum',baseToken:{symbol:'ABC',address:addr},quoteToken:{symbol:'USDT'},liquidity:{usd:500000}}]})};if(String(url).includes('geckoterminal'))return{ok:true,status:200,json:async()=>({included:[{type:'token',id:`eth_${addr}`,attributes:{symbol:'ABC'}},{type:'token',id:'eth_0x2222222222222222222222222222222222222222',attributes:{symbol:'USDT'}}],data:[{attributes:{reserve_in_usd:'500000'},relationships:{base_token:{data:{id:`eth_${addr}`}},quote_token:{data:{id:'eth_0x2222222222222222222222222222222222222222'}}}}]})};if(String(url).includes('llama.fi'))return{ok:true,status:200,json:async()=>[]};return{ok:true,status:200,json:async()=>({})};};
 const first=await collectSupplementalCandidateContext({db,fetch_impl,registry:{},contract:'ABC-USDT',run_id:'r1',derivatives_venues:2,now:1_800_000_000_000});
 assert.equal(first.lane,'IDENTITY_DISCOVERY');assert.equal(first.network_calls,3);assert.equal(first.identity_status,'CANDIDATE_ONLY');assert.equal(first.identity??null,null);
 const second=await collectSupplementalCandidateContext({db,fetch_impl,registry:{},contract:'ABC-USDT',run_id:'r2',derivatives_venues:2,now:1_800_000_001_000});
 assert.ok(second.network_calls<=3);assert.notEqual(second.identity_status,'CLOSED');assert.equal(second.identity??null,null);assert.equal(urls.filter(x=>x.includes('/search/pools?')).length,1);
});
