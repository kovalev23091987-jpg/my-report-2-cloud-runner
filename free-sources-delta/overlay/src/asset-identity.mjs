export const ASSET_IDENTITY_VERSION='asset-identity-v1-free-sources-20260925';

const QUOTES=new Set(['USD','USDT','USDC','BTC','ETH']);
const MARKET_TYPES=new Set(['SPOT','FUTURES','PERP','SWAP','OPTION','DEX_POOL','ONCHAIN']);
const EVM_NETWORKS=new Set(['ethereum','arbitrum','optimism','base','bsc','bnb','polygon','avalanche','linea','scroll','mantle']);
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM=/^0x[0-9a-fA-F]{40}$/;
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const clean=v=>String(v??'').normalize('NFC').trim();
const upper=v=>clean(v).toUpperCase();

export function normalizeChain(value){
  const raw=clean(value);if(!raw)return null;
  const low=raw.toLowerCase();
  if(low==='sol'||low==='solana')return 'solana';
  if(low==='eth'||low==='ethereum')return 'ethereum';
  if(low==='bsc'||low==='bnb'||low==='bnb chain')return 'bsc';
  return low;
}

export function normalizeContractIdentity({chain,contract_or_mint,address,mint}={}){
  const network=normalizeChain(chain);const raw=clean(contract_or_mint??address??mint);
  if(!network)return {status:'NOT_CLOSED',reason:'CHAIN_REQUIRED',chain:null,contract_or_mint:null};
  if(!raw)return {status:'NOT_CLOSED',reason:'CONTRACT_OR_MINT_REQUIRED',chain:network,contract_or_mint:null};
  if(network==='solana'){
    if(!BASE58.test(raw))return {status:'NOT_CLOSED',reason:'SOLANA_MINT_INVALID',chain:network,contract_or_mint:raw};
    return {status:'CLOSED',chain:network,contract_or_mint:raw,address_case_preserved:true,address_kind:'SOLANA_MINT'};
  }
  if(EVM_NETWORKS.has(network)){
    if(!EVM.test(raw))return {status:'NOT_CLOSED',reason:'EVM_ADDRESS_INVALID',chain:network,contract_or_mint:raw};
    return {status:'CLOSED',chain:network,contract_or_mint:raw.toLowerCase(),address_case_preserved:false,address_kind:'EVM_CONTRACT'};
  }
  return {status:'CLOSED',chain:network,contract_or_mint:raw,address_case_preserved:true,address_kind:'GENERIC_CHAIN_ADDRESS'};
}

export function buildAssetIdentity({chain,contract_or_mint,address,mint,symbol,base_asset,quote_asset,market_type,multiplier=1,venue=null,instrument_id=null}={}){
  const contract=normalizeContractIdentity({chain,contract_or_mint,address,mint});
  const base=upper(base_asset||symbol);const quote=upper(quote_asset);const type=upper(market_type);const mult=finite(multiplier);
  const errors=[];
  if(contract.status!=='CLOSED')errors.push(contract.reason);
  if(!base)errors.push('BASE_ASSET_REQUIRED');
  if(!quote)errors.push('QUOTE_ASSET_REQUIRED');
  if(quote&&!QUOTES.has(quote))errors.push('QUOTE_ASSET_UNSUPPORTED');
  if(!type||!MARKET_TYPES.has(type))errors.push('MARKET_TYPE_UNSUPPORTED');
  if(!(mult>0))errors.push('MULTIPLIER_INVALID');
  if(errors.length)return {version:ASSET_IDENTITY_VERSION,status:'NOT_CLOSED',errors,chain:contract.chain,contract_or_mint:contract.contract_or_mint,base_asset:base||null,quote_asset:quote||null,market_type:type||null,multiplier:mult};
  const identity={
    version:ASSET_IDENTITY_VERSION,status:'CLOSED',chain:contract.chain,contract_or_mint:contract.contract_or_mint,
    base_asset:base,quote_asset:quote,market_type:type,multiplier:mult,venue:clean(venue)||null,instrument_id:clean(instrument_id)||null,
    address_case_preserved:contract.address_case_preserved,address_kind:contract.address_kind,
  };
  identity.identity_key=[identity.chain,identity.contract_or_mint,identity.base_asset,identity.quote_asset,identity.market_type,String(identity.multiplier)].join('|');
  return identity;
}

export function identitiesCompatible(a,b){
  if(a?.status!=='CLOSED'||b?.status!=='CLOSED')return {status:'NOT_CLOSED',compatible:false,reason:'IDENTITY_NOT_CLOSED'};
  const fields=['chain','contract_or_mint','base_asset','quote_asset','market_type','multiplier'];
  const mismatches=fields.filter(k=>String(a[k])!==String(b[k]));
  return {status:mismatches.length?'MISMATCH':'CLOSED',compatible:mismatches.length===0,mismatches};
}

export function quotesEquivalent(a,b){return upper(a)===upper(b);}

export function normalizeTimestamp(value,{unit='auto'}={}){
  const n=finite(value);if(n===null||n<0)return {status:'NOT_CLOSED',reason:'TIMESTAMP_INVALID',ms:null,detected_unit:null};
  let detected=String(unit||'auto').toLowerCase();
  if(detected==='auto'){
    if(n>=1e15)detected='us';
    else if(n>=1e12)detected='ms';
    else if(n>=1e9)detected='s';
    else return {status:'NOT_CLOSED',reason:'TIMESTAMP_UNIT_AMBIGUOUS',ms:null,detected_unit:null};
  }
  let ms=detected==='us'?Math.trunc(n/1000):detected==='s'?Math.trunc(n*1000):detected==='ms'?Math.trunc(n):null;
  if(ms===null||ms<946684800000||ms>4102444800000)return {status:'NOT_CLOSED',reason:'TIMESTAMP_OUT_OF_RANGE',ms:null,detected_unit:detected};
  return {status:'CLOSED',ms,detected_unit:detected};
}

export function normalizeCrossVenueFact({provider,venue,symbol,asset_identity,market_type,unit,multiplier=1,interval=null,event_ts,received_ts=Date.now(),max_age_ms=null,coverage_pct=null,quality_status='UNKNOWN',raw_value=null,normalized_value=null,status='CLOSED'}={}){
  const event=normalizeTimestamp(event_ts,{unit:'auto'});const received=normalizeTimestamp(received_ts,{unit:'auto'});
  const mult=finite(multiplier);const coverage=finite(coverage_pct);const maxAge=finite(max_age_ms);
  const identity=asset_identity?.status==='CLOSED'?asset_identity:null;
  const current=event.status==='CLOSED'&&received.status==='CLOSED'&&(maxAge===null||received.ms-event.ms<=maxAge)&&received.ms>=event.ms-60_000;
  const reasons=[];if(!provider)reasons.push('PROVIDER_REQUIRED');if(!venue)reasons.push('VENUE_REQUIRED');if(!symbol)reasons.push('SYMBOL_REQUIRED');if(!identity)reasons.push('ASSET_IDENTITY_NOT_CLOSED');if(!(mult>0))reasons.push('MULTIPLIER_INVALID');if(event.status!=='CLOSED')reasons.push(event.reason);if(received.status!=='CLOSED')reasons.push(received.reason);
  return {
    version:ASSET_IDENTITY_VERSION,status:reasons.length?'NOT_CLOSED':String(status),provider:clean(provider)||null,venue:clean(venue)||null,symbol:clean(symbol)||null,
    asset_identity:identity,market_type:upper(market_type)||identity?.market_type||null,unit:clean(unit)||null,multiplier:mult,interval:clean(interval)||null,
    event_ts:event.ms,received_ts:received.ms,freshness:current?'CURRENT':'STALE_OR_UNKNOWN',coverage_pct:coverage,quality_status:upper(quality_status)||'UNKNOWN',
    raw_value,normalized_value,reasons,
  };
}
