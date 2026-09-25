export const EXISTING_SOURCE_CONSUMER_VERSION='existing-source-consumer-v2-coverage-20260925';
const arr=v=>Array.isArray(v)?v:[];
const clean=v=>String(v??'').trim();
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
function closed(r){return String(r?.status||'').toUpperCase()==='CLOSED';}
function fact(source,block,label,value=null,unit=null,details={}){
  return {source,decision_block:block,label,value,unit,advisory_only:true,directional_vote:false,hard_gate:false,...details};
}
export function consumeExistingSourceReceipts({goplus=null,solana=null,dex=[],defillama=null,hyperliquid=null,bitget=null,coinbase=null}={}){
  const facts=[];const blocks={
    supporting_risk:{status:'NOT_CLOSED',facts:[]},onchain:{status:'NOT_CLOSED',facts:[]},
    dex_context:{status:'NOT_CLOSED',facts:[]},protocol_context:{status:'NOT_CLOSED',facts:[]},
    hyperliquid_context:{status:'NOT_CLOSED',facts:[]},bitget_context:{status:'NOT_CLOSED',facts:[]},
    coinbase_spot_context:{status:'NOT_CLOSED',facts:[]},
  };
  if(closed(goplus)){
    const flagged=Object.entries(goplus?.flags||{}).filter(([,v])=>v===true).map(([k])=>k);
    const f=fact('GoPlus','SUPPORTING_RISK','Дополнительные риски токена',flagged.length?flagged.length:0,'флагов',{flagged_keys:flagged,unknown_is_safe:false});
    blocks.supporting_risk={status:'CLOSED',facts:[f]};facts.push(f);
  }
  if(closed(solana)){
    const count=arr(solana?.rows).length;
    const f=fact('Solana Public RPC','ONCHAIN_CONTEXT','Свежие подтверждённые записи Solana',count,'записей',{mint:solana?.mint??null});
    blocks.onchain={status:'CLOSED',facts:[f]};facts.push(f);
  }
  const drows=arr(dex).filter(closed);
  if(drows.length){
    const pools=new Map();for(const r of drows){const k=clean(r.pool_key);if(!k)continue;const xs=pools.get(k)||[];xs.push(r);pools.set(k,xs);}
    const fs=[];for(const [pool_key,xs] of pools){const best=[...xs].sort((a,b)=>(finite(b.liquidity_usd)??-1)-(finite(a.liquidity_usd)??-1))[0];fs.push(fact(best.provider||'DEX','DEX_CONTEXT','DEX-пул подтверждён',finite(best.liquidity_usd),'USD',{pool_key,provider_observation_count:xs.length,independent_confirmation_count:1,buy_count_is_net_inflow:false,promotion_is_organic_interest:false}));}
    if(fs.length){blocks.dex_context={status:'CLOSED',facts:fs};facts.push(...fs);}
  }
  if(closed(defillama)){
    const f=fact('DefiLlama','PROTOCOL_CONTEXT','TVL протокола',finite(defillama?.tvl_usd),'USD',{protocol:defillama?.protocol??null,tvl_growth_is_inflow:false});
    blocks.protocol_context={status:'CLOSED',facts:[f]};facts.push(f);
  }
  if(closed(hyperliquid)){
    const fs=[];
    if(finite(hyperliquid?.funding_rate)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Ставка финансирования Hyperliquid',finite(hyperliquid.funding_rate),'доля',{coin:hyperliquid.coin,known_addresses_are_sample_only:true,not_global_liquidation_map:true}));
    if(finite(hyperliquid?.open_interest_usd)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Открытый интерес Hyperliquid',finite(hyperliquid.open_interest_usd),'USD',{coin:hyperliquid.coin,usd_change_may_include_price_effect:true,known_addresses_are_sample_only:true,not_global_liquidation_map:true}));
    if(finite(hyperliquid?.spread_pct)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Спред Hyperliquid',finite(hyperliquid.spread_pct),'%',{coin:hyperliquid.coin}));
    if(fs.length){blocks.hyperliquid_context={status:'CLOSED',facts:fs};facts.push(...fs);}
  }
  if(closed(bitget)){
    const fs=[];
    if(finite(bitget?.funding_rate)!==null)fs.push(fact('Bitget','BITGET_CONTEXT','Ставка финансирования Bitget',finite(bitget.funding_rate),'доля',{measurement_only:true,no_automatic_voting:true}));
    if(finite(bitget?.open_interest)!==null)fs.push(fact('Bitget','BITGET_CONTEXT','Открытый интерес Bitget',finite(bitget.open_interest),bitget.open_interest_unit||'контрактов',{measurement_only:true,no_automatic_voting:true}));
    if(fs.length){blocks.bitget_context={status:'CLOSED',facts:fs};facts.push(...fs);}
  }
  if(closed(coinbase)){
    const fs=[];
    if(finite(coinbase?.price)!==null)fs.push(fact('Coinbase Exchange','COINBASE_SPOT_CONTEXT','Независимая спот-цена Coinbase',finite(coinbase.price),coinbase.quote_currency||null,{quote_currency:coinbase.quote_currency,quotes_are_not_equivalent:true,measurement_only:true,directional_vote:false}));
    if(fs.length){blocks.coinbase_spot_context={status:'CLOSED',facts:fs};facts.push(...fs);}
  }
  return {version:EXISTING_SOURCE_CONSUMER_VERSION,status:facts.length?'CLOSED':'NOT_CLOSED',blocks,facts,no_new_hard_gate:true,no_directional_vote:true,new_sources_added:false};
}
export default{EXISTING_SOURCE_CONSUMER_VERSION,consumeExistingSourceReceipts};
