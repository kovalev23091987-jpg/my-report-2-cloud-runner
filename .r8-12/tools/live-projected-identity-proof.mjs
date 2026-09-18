import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const sourceProxy=String(process.env.REPORT2_SOURCE_PROXY_URL||'').trim();
const sourceToken=String(process.env.REPORT2_SOURCE_PROXY_TOKEN||'').trim();
if(!sourceProxy||!sourceToken) throw new Error('SOURCE_PROXY_ENV_REQUIRED');
const worker=resolve(process.argv[2]);
const outPath=resolve(process.argv[3]);
const probe=worker+'.probe.mjs';
const original=await fs.readFile(worker,'utf8');
await fs.writeFile(probe, original+'\nexport { collectPublicFullEvidence, LIQUIDATION_INTELLIGENCE_API };\n');
const mod=await import(pathToFileURL(probe).href+'?t='+Date.now());
const liqMod=await import(pathToFileURL(resolve(process.argv[4])).href+'?t='+Date.now());
const nativeFetch=globalThis.fetch.bind(globalThis);
async function proofFetch(input,init={}){
  let u; try{u=input instanceof Request?new URL(input.url):new URL(String(input));}catch{return nativeFetch(input,init);}
  if(u.protocol==='https:'&&u.hostname==='bykaranteli.com'){
    return nativeFetch(sourceProxy,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${sourceToken}`,'user-agent':'My-Report-2-R8.12-Projected-Identity-Proof/1.0'},body:JSON.stringify({url:u.toString()}),signal:init?.signal??(input instanceof Request?input.signal:undefined)});
  }
  return nativeFetch(input,init);
}
const contracts=['BTC-USDT','ETH-USDT','SOL-USDT','AKE-USDT','ARB-USDT','RAY-USDT'];
const rows=[];
for(const contract of contracts){
  const now=Date.now();
  try{
    const pub=await mod.collectPublicFullEvidence({contract_code:contract,fetch_impl:proofFetch,now_ts:now});
    const proof=pub?.alias_verification?.asset_identity||null;
    const liq=await mod.LIQUIDATION_INTELLIGENCE_API.collectCrossVenueLiquidationIntelligence({contract_code:contract,fetch_impl:proofFetch,api_key:'CLOUDFLARE_PROXY_CONFIGURED',now_ts:now,asset_identity_proof:proof});
    const elig=liqMod.classifyProjectedProviderMap(liq,{htx_contract:contract,htx_current_price:null});
    rows.push({contract,asset_identity:proof,projected_map_status:liq?.projected_map_status,asset_identity_verified:liq?.asset_identity_verified,provider_symbol:liq?.provider_symbol,provider_symbol_registry_exact_match:liq?.source_health?.provider_symbol_registry_exact_match,projected_freshness:liq?.projected_freshness,projected_source_age_sec:liq?.projected_source_age_sec,cluster_count:Array.isArray(liq?.projected_clusters)?liq.projected_clusters.length:0,eligibility:elig,errors:liq?.errors||[]});
  }catch(error){rows.push({contract,error:String(error?.stack||error)});}
}
const closed=rows.filter(x=>x.eligibility?.status==='CLOSED_SHADOW'&&x.asset_identity_verified===true&&x.provider_symbol_registry_exact_match===true&&x.projected_freshness==='CURRENT'&&x.cluster_count>0);
const btc=rows.find(x=>x.contract==='BTC-USDT');
if(!closed.length) throw new Error('R8_12_NO_LIVE_PROJECTED_IDENTITY_CLOSED:'+JSON.stringify(rows));
if(!btc || btc.eligibility?.status!=='CLOSED_SHADOW') throw new Error('R8_12_BTC_PROJECTED_IDENTITY_NOT_CLOSED:'+JSON.stringify(btc));
const result={status:'R8_12_LIVE_PROJECTED_IDENTITY_PASS',closed_count:closed.length,closed_contracts:closed.map(x=>x.contract),btc_status:btc.eligibility.status,rows,production_main_changed:false,d1_changed:false,telegram_network_enabled:false,probability:null,validated_signal:false,trading_execution:false};
await fs.writeFile(outPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
