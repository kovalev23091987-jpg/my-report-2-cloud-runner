import {verifyCoinpaprikaProviderReference} from './coinpaprika-htx-identity.mjs';
import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';
import {sectorCategoryLabel,nativeSectorAssetId} from './coingecko-sector-evidence.mjs';
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const labels={oracle:'оракулы',oracles:'оракулы',exchange:'биржевые проекты'};
const sources={COINGECKO_SECTOR:'CoinGecko',COINPAPRIKA_SECTOR:'CoinPaprika'};
export function consumeSectorContext({evidence=[],contract,asset_identity,now}={}){
 const facts=[],blocks={},id=asset_identity?nativeSectorAssetId(asset_identity,contract)||`${asset_identity.chain}:${asset_identity.contract_or_mint}`:null;
 const common={advisory_only:true,directional_vote:false,hard_gate:false,score_contribution:0};
 for(const r of (Array.isArray(evidence)?evidence:[]).filter(r=>r&&typeof r==='object').sort((a,b)=>(a.provider_id==='COINGECKO_SECTOR'?-1:1)-(b.provider_id==='COINGECKO_SECTOR'?-1:1))){
  const providerBound=r.provider_id==='COINPAPRIKA_SECTOR'&&verifyCoinpaprikaProviderReference(r.provider_reference,contract,now)&&r.coin_id===r.provider_reference.coinpaprika_id;
  const declaredTag=providerBound&&r.provider_tag?.id===r.tag_id&&r.provider_tag?.type==='functional'&&typeof r.provider_tag.name==='string'&&r.provider_tag.name.length>0&&r.provider_tag.name.length<=80&&r.provider_tag.name===r.category_name&&Array.isArray(r.provider_tag.coins)&&r.provider_tag.coins.includes(r.coin_id);
  const label=r.provider_id==='COINGECKO_SECTOR'?sectorCategoryLabel(r.category_name):labels[r.tag_id]||(declaredTag?r.provider_tag.name:null);
  const rowAssetId=providerBound?r.provider_reference.asset_id:id;
  if(!sources[r?.provider_id]||r.block_id!=='N15'||r.metric_family!=='SECTOR_RELATIVE_STRENGTH_CONTEXT'||r.sector_proof!=='EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1'||r.htx_contract!==contract||!rowAssetId||r.asset_id!==rowAssetId||!validateEvidenceV2(r,{decision_ts:now}).usable||r.observed_ts>now||r.source_ts>r.observed_ts||!label)continue;
  const peers=r.peers;if(num(r.target_source_ts)===null||r.target_source_ts>r.observed_ts||now-r.target_source_ts>900000||!Array.isArray(peers)||peers.length<3||peers.length!==r.eligible_peers||peers.length>50||new Set(peers.map(x=>x.id)).size!==peers.length||new Set(peers.map(x=>x.symbol)).size!==peers.length||peers.some(x=>x.id===r.coin_id||x.symbol===contract.replace(/-USDT$/,'')||num(x.change_24h_pct)===null||num(x.source_ts)===null||x.source_ts>r.observed_ts||now-x.source_ts>900000||Math.abs(x.source_ts-r.target_source_ts)>120000))continue;
  if(providerBound&&(!declaredTag||peers.some(x=>!r.provider_tag.coins.includes(x.id))))continue;
  const values=peers.map(x=>x.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(values.length/2),median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2,target=num(r.target_change_24h_pct),delta=num(r.relative_strength_pct_points);
  if(target===null||delta===null||num(r.peer_median_change_24h_pct)===null||Math.abs(median-r.peer_median_change_24h_pct)>1e-8||Math.abs(target-median-delta)>1e-8)continue;
  const pct=n=>`${n>0?'+':''}${n.toFixed(2).replace('.',',')}`;
  const fact={...common,block_id:'N15',source:sources[r.provider_id],decision_block:'MARKET_STRENGTH_SPOT',field:'SECTOR_RELATIVE_STRENGTH_CONTEXT',label:`Сектор «${label}» за 24 часа, выборка ${peers.length} монет`,value:`монета ${pct(target)}%, медиана ${pct(median)}%, разница ${pct(delta)} п.п.; сводные цены площадок`,unit:'',source_ts:r.source_ts,observed_ts:r.observed_ts,evidence_id:r.evidence_id,physical_root_key:evidenceDedupKey(r)};
  blocks[r.provider_id]={status:'CLOSED',block_id:'N15',relative_strength_pct_points:delta,eligible_peers:peers.length,category:r.tag_id,source_ts:r.source_ts,...common};
  if(!facts.length)facts.push(fact);
 }
 return{status:facts.length?'CLOSED':'NOT_CLOSED',facts,blocks,...common};
}
