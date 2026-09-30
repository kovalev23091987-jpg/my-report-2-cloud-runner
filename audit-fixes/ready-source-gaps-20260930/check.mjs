import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyCoinpaprikaIdentity, normalizeCoinpaprikaSector} from '../../current-generation/files/src/coinpaprika-sector-evidence.mjs';

const output='ready-source-gaps-output';fs.mkdirSync(output,{recursive:true});
const started=Date.now(),receipts=[];let calls=0;
async function get(name,url) {
  if(++calls>12)throw Error('PUBLIC_PROBE_CAP');
  const row={name,url,started_ts:Date.now()};
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{accept:'application/json'}});
    const body=await response.text();
    row.http_status=response.status;row.completed_ts=Date.now();row.raw_sha256=createHash('sha256').update(body).digest('hex');
    fs.writeFileSync(`${output}/${name}.json`,body);
    if(!response.ok){row.status='HTTP_'+response.status;return null;}
    const value=JSON.parse(body);row.status='RECEIVED';return value;
  }catch(error){row.status='SOURCE_ERROR';row.error=String(error.message).slice(0,160);return null;}
  finally{receipts.push(row);}
}
const registry=JSON.parse(fs.readFileSync('current-generation/files/official-event-sources.json'));
const jup=registry.entries.find(r=>r.contract_code==='JUP-USDT');
const identity={chain:'solana',contract_or_mint:jup.asset_id.slice('solana:'.length)};
const htx=await get('htx-contracts','https://api.hbdm.com/linear-swap-api/v1/swap_contract_info');
const active=new Set((htx?.data||[]).filter(r=>Number(r.contract_status)===1).map(r=>r.contract_code));
const jupMetadata=[];
for(const id of ['jup-jupiter-exchange-token','jup-jupiter']){
  const row=await get(id,`https://api.coinpaprika.com/v1/coins/${id}`);
  jupMetadata.push({id,row,exact:verifyCoinpaprikaIdentity(row,{identity,base:'JUP',coin_id:id})});
}
const exact=jupMetadata.filter(r=>r.exact),sectorResults=[];
if(exact.length===1){
  const target=exact[0],tags=(target.row.tags||[]).filter(t=>/defi|decentralized|exchange|aggregat|automated.market/i.test(t.id+' '+t.name)).slice(0,2);
  let tickers;
  for(const tagRef of tags){
    const tag=await get('tag-'+tagRef.id,`https://api.coinpaprika.com/v1/tags/${encodeURIComponent(tagRef.id)}?additional_fields=coins`);
    if(tag?.type==='functional'&&tag?.coins?.includes(target.id)){
      tickers??=await get('coinpaprika-quotes','https://api.coinpaprika.com/v1/tickers?quotes=USD');
      const result=normalizeCoinpaprikaSector({metadata:target.row,tag,tickers,identity,contract:'JUP-USDT',coin_id:target.id,tag_id:tagRef.id,observed_ts:Date.now()});
      sectorResults.push({id:target.id,tag_id:tagRef.id,active_htx:active.has('JUP-USDT'),...result});
    }else sectorResults.push({id:target.id,tag_id:tagRef.id,status:'FUNCTIONAL_MEMBERSHIP_NOT_CLOSED',tag_type:tag?.type,contains_target:tag?.coins?.includes(target.id)});
  }
}
const cg=await get('coingecko-chainlink','https://api.coingecko.com/api/v3/coins/chainlink?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false');
let cgSector=null;
if(cg?.id==='chainlink'&&String(cg?.platforms?.ethereum).toLowerCase()==='0x514910771af9ca656af840dff83e8264ecf986ca'&&cg?.categories?.some(x=>/oracle/i.test(x))){
  const categories=await get('coingecko-categories','https://api.coingecko.com/api/v3/coins/categories/list');
  const category=Array.isArray(categories)?categories.filter(x=>cg.categories.includes(x.name)&&/oracle/i.test(x.name)):[];
  if(category.length===1){
    const rows=await get('coingecko-sector-quotes',`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${encodeURIComponent(category[0].category_id)}&order=market_cap_desc&per_page=100&page=1&sparkline=false`);
    cgSector={category:category[0],active_htx:active.has('LINK-USDT'),row_count:Array.isArray(rows)?rows.length:null,target:rows?.find?.(r=>r.id==='chainlink'),peers:rows?.filter?.(r=>r.id!=='chainlink').slice(0,6)};
  }
}
const result={schema:'report2-ready-source-gap-probe-v1',commit:process.env.GITHUB_SHA,started_ts:started,completed_ts:Date.now(),actual_public_http:calls,cap:12,production_writes:0,telegram_calls:0,orders:0,history_accumulation:false,identity_candidates:jupMetadata.map(({id,row,exact})=>({id,exact,symbol:row?.symbol,active:row?.is_active,contracts:row?.contracts,tags:row?.tags})),sector_results:sectorResults,coingecko:{status:cg?'RECEIVED':'NOT_AVAILABLE',identity_address:cg?.platforms?.ethereum,categories:cg?.categories,sector:cgSector},receipts};
fs.writeFileSync(`${output}/result.json`,JSON.stringify(result,null,2));
console.log('READY_SOURCE_GAPS_RESULT '+JSON.stringify(result));
