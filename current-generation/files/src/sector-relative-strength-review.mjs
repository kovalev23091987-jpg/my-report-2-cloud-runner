import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';
import {digest} from './upstream-proof-utils.mjs';
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const near=(a,b)=>Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-9;
const clamp=v=>Math.max(-1,Math.min(1,v));
export function reviewSectorRelativeStrength({evidence=[],contract,run_id,snapshot_id,decision_ts}={}){
 const receipts=[],seen=new Set();
 if(typeof contract!=='string'||typeof run_id!=='string'||!run_id||!Number.isSafeInteger(decision_ts)||snapshot_id!==`S392:${contract}:${decision_ts}`)return {status:'EXACT_SNAPSHOT_REQUIRED',receipts:[],score_contribution:0};
 for(const row of evidence){
  if(row?.block_id!=='N15'||row.htx_contract!==contract||!['COINPAPRIKA_SECTOR','COINGECKO_SECTOR'].includes(row.provider_id)||row.metric_family!=='SECTOR_RELATIVE_STRENGTH_CONTEXT'||row.sector_proof!=='EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1'||!validateEvidenceV2(row,{decision_ts}).usable)continue;
  const peers=row.peers,key=evidenceDedupKey(row),target=num(row.target_change_24h_pct),median=num(row.peer_median_change_24h_pct),relative=num(row.relative_strength_pct_points);
  if(!Array.isArray(peers)||peers.length<3||peers.length>50||row.eligible_peers!==peers.length||new Set(peers.map(p=>p.id)).size!==peers.length||target===null||median===null||relative===null||!Number.isSafeInteger(row.target_source_ts)||row.target_source_ts>decision_ts||row.quote!=='USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE'||row.is_htx_price!==false||row.entry_eligible!==false||row.window!=='PROVIDER_ROLLING_24H_AT_NEAR_SYNCHRONOUS_QUOTES'||seen.has(key))continue;
  if(peers.some(p=>typeof p.id!=='string'||!p.id||p.id===row.coin_id||num(p.change_24h_pct)===null||p.quote!=='USD_AGGREGATED'||!Number.isSafeInteger(p.source_ts)||p.source_ts>decision_ts||Math.abs(p.source_ts-row.target_source_ts)>120000))continue;
  const sorted=peers.map(p=>p.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),computed=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  if(!near(computed,median)||!near(target-computed,relative)||num(row.directional_strength)===null||!near(clamp(relative/10),row.directional_strength)||row.source_ts!==Math.min(row.target_source_ts,...peers.map(p=>p.source_ts)))continue;
  if(row.provider_id==='COINPAPRIKA_SECTOR'&&(!Number.isSafeInteger(row.tag_members)||row.tag_members<=peers.length||num(row.peer_coverage_fraction)===null||!near(row.peer_coverage_fraction,peers.length/(row.tag_members-1))))continue;
  seen.add(key);
  const receipt={schema:'SECTOR_RELATIVE_STRENGTH_REVIEW_V1',block_id:'N15',consumer:'SECTOR_RELATIVE_STRENGTH',reason:'EXACT_SECTOR_PEER_BASKET_REVIEWED',assessment_mode:'UNSCORED_MARKET_OBSERVATION',contract,run_id,snapshot_id,decision_ts,evidence_id:row.evidence_id,raw_hash:row.raw_hash,evidence_fingerprint:digest(row),physical_root_key:key,source_ts:row.source_ts,first_known_ts:row.first_known_ts,provider_id:row.provider_id,coin_id:row.coin_id,tag_id:row.tag_id,eligible_peers:peers.length,target_change_24h_pct:target,peer_median_change_24h_pct:computed,relative_strength_pct_points:relative,sector_relationship:relative>0?'ABOVE_PEER_MEDIAN':relative<0?'BELOW_PEER_MEDIAN':'AT_PEER_MEDIAN',scope:'RETURNED_PROVIDER_ROLLING_24H_PEER_BASKET',full_sector_coverage:false,trade_direction_created:false,score_contribution:0,control_effect:false,entry_authorized:false};
  receipts.push({...receipt,fingerprint:digest(receipt)});
 }
 return {schema:'SECTOR_RELATIVE_STRENGTH_REVIEWS_V1',status:receipts.length?'CLOSED_CONTEXT_REVIEW':'NO_VALID_SECTOR_PEER_BASKET',receipts,score_contribution:0,entry_authorized:false};
}
export function verifySectorRelativeStrengthReviews(review,args){
 const expected=reviewSectorRelativeStrength(args);
 if(review?.status!=='CLOSED_CONTEXT_REVIEW'||expected.status!=='CLOSED_CONTEXT_REVIEW')return [];
 return expected.receipts.filter(wanted=>Array.isArray(review.receipts)&&review.receipts.some(r=>{const {fingerprint,...body}=r;return fingerprint===wanted.fingerprint&&digest(body)===fingerprint;}));
}
