import { normalizeContractIdentity } from './asset-identity.mjs';
export const DEX_POOL_BRIDGE_VERSION='dex-pool-bridge-v1-20260925';
const clean=v=>String(v??'').trim();
export function normalizeDexPoolObservation({provider,chain,pool_address,token_contract_or_mint,liquidity_usd,volume_usd,buys,sells,observed_ts=Date.now(),promoted=false}={}){
  const token=normalizeContractIdentity({chain,contract_or_mint:token_contract_or_mint});const pool=normalizeContractIdentity({chain,contract_or_mint:pool_address});
  if(token.status!=='CLOSED'||pool.status!=='CLOSED')return {status:'NOT_CLOSED',reason:'POOL_OR_TOKEN_IDENTITY_NOT_CLOSED'};
  const poolKey=`${token.chain}|${pool.contract_or_mint}`;
  return {version:DEX_POOL_BRIDGE_VERSION,status:'CLOSED',provider:clean(provider),chain:token.chain,pool_address:pool.contract_or_mint,token_contract_or_mint:token.contract_or_mint,pool_key:poolKey,independence_group:`DEX_POOL:${poolKey}`,liquidity_usd:Number.isFinite(Number(liquidity_usd))?Number(liquidity_usd):null,volume_usd:Number.isFinite(Number(volume_usd))?Number(volume_usd):null,buys:Number.isFinite(Number(buys))?Number(buys):null,sells:Number.isFinite(Number(sells))?Number(sells):null,observed_ts,promoted:Boolean(promoted),buy_count_is_net_inflow:false,promotion_is_organic_interest:false};
}
export function dedupeDexPoolConfirmations(rows=[]){
  const groups=new Map();
  for(const row of Array.isArray(rows)?rows:[]){if(row?.status!=='CLOSED'||!row.pool_key)continue;const g=groups.get(row.pool_key)||[];g.push(row);groups.set(row.pool_key,g);}
  return [...groups.entries()].map(([pool_key,observations])=>({pool_key,independent_confirmation_count:1,provider_observation_count:observations.length,providers:[...new Set(observations.map(x=>x.provider))],same_underlying_pool:true}));
}
