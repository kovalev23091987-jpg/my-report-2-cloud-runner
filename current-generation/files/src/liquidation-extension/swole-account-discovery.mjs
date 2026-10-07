import {createHash} from 'node:crypto';
const symbolOK=s=>typeof s==='string'&&/^[A-Z0-9]{1,20}$/.test(s);
const plain=s=>s.replace(/<[^>]*>/g,'').replace(/&(?:amp|nbsp);/g,' ').trim();
const amount=s=>{const m=plain(s).replace(/[$,]/g,'').match(/^(\d+(?:\.\d+)?)([KMB])?$/);return m?Number(m[1])*({K:1e3,M:1e6,B:1e9}[m[2]]??1):null;};
// Only the exact native-position table supplies wallet discovery hints. Never
// read aggregate clusters, modeled maps, footer addresses or map timestamps
// as native liquidation evidence. Every selected wallet requires a new state.
export function parseSwoleAccountDiscovery(html,{symbol}={}){
 const no=reason=>({ok:false,reason,payload:null});
 if(!symbolOK(symbol)||typeof html!=='string'||Buffer.byteLength(html)>2000000)return no('EXACT_DISCOVERY_INPUT_REQUIRED');
 const heading='Largest tracked '+symbol+' positions',start=html.indexOf(heading);
 if(start<0)return no('EXACT_NATIVE_POSITION_TABLE_MISSING');
 const block=html.slice(start,html.indexOf('</table>',start)+8),body=block.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
 if(!body||!['Wallet','Side','Size','Liq. price','Checked'].every(x=>block.includes('>'+x+'</th>')))return no('NATIVE_DISCOVERY_TABLE_SCHEMA_CHANGED');
 const positions=[],seen=new Set();
 for(const match of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(x=>x[1]);if(cells.length!==9)return no('NATIVE_DISCOVERY_ROW_SCHEMA_CHANGED');
  const address=cells[0].match(/href=["'](?:https:\/\/swolecharts.com)?\/hyperliquid\/wallet\/(0x[a-fA-F0-9]{40})["']/)?.[1]?.toLowerCase(),side=plain(cells[1]),value=amount(cells[2]),liq_price=amount(cells[4]);
  // Accounts without a supplied positive liquidation hint cost a native read
  // but often cannot produce a level (proven by the first research account).
  if(!address||seen.has(address)||!['Long','Short'].includes(side)||!(value>0)||!(liq_price>0))continue;
  seen.add(address);positions.push({address,size:side==='Long'?value:-value,liq_price,hint_size_unit:'DISPLAY_USD_RANKING_ONLY',hints_are_levels:false});if(positions.length>50)return no('NATIVE_DISCOVERY_TABLE_BOUND_EXCEEDED');
 }
 return{ok:true,payload:{coin:symbol,positions,source:'SWOLE_DISCOVERY',source_page_is_partial:true,model_prices_used_as_evidence:false,native_reread_required:true},reason:null};
}
export function chooseNativeAccountDiscovery({now=Date.now(),liqflow_key='',swole_enabled=false,symbol}={}){
 if(!swole_enabled||!symbolOK(symbol))return'LIQFLOW';
 if(now>=Date.parse('2026-10-27T00:00:00Z')&&!String(liqflow_key).trim())return'SWOLE_DISCOVERY';
 return Math.floor(now/4800000)%2===0?'SWOLE_DISCOVERY':'LIQFLOW';
}
export async function readSwoleAccountDiscovery(symbol,{fetch_impl=globalThis.fetch,clock=Date.now,timeout_ms=12000}={}){
 if(!symbolOK(symbol))throw Error('EXACT_DISCOVERY_SYMBOL_REQUIRED');
 const url='https://swolecharts.com/hyperliquid/liquidation-map/'+symbol,started_ts=clock();let response,bytes=0,parts=[];
 try{
  response=await fetch_impl(url,{redirect:'error',signal:AbortSignal.timeout(timeout_ms),headers:{accept:'text/html','user-agent':'My-Report-2/Native-Account-Discovery'}});
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2000000)throw Error('RESPONSE_SIZE_LIMIT');parts.push(chunk);}
  const body=Buffer.concat(parts),receipt={url,method:'GET',started_ts,received_ts:clock(),http_status:response.status,bytes,sha256:createHash('sha256').update(body).digest('hex'),authentication:'NONE'};
  return response.ok?{...parseSwoleAccountDiscovery(body.toString(),{symbol}),receipt}:{ok:false,payload:null,reason:'HTTP_'+response.status,receipt};
 }catch(error){return{ok:false,payload:null,reason:String(error?.message??error).slice(0,100),receipt:{url,method:'GET',started_ts,received_ts:clock(),http_status:response?.status??null,bytes,sha256:null}};}
}
