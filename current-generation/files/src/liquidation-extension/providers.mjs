import {base,fail,complete,sourceClock,zone,num,obj,timestamp,seal} from './core.mjs';
export function normalizeOxArchive(p,c){
 const b=base('0xArchive',c,['HYPERLIQUID_MAINNET_PERPS'],'POSITION_DERIVED_PROJECTED_BUCKETS',{venue:'Hyperliquid',quote:'USD_NOTIONAL_USDC_MARGIN',access:'REST_API_KEY_REQUIRED',coverage:'PARTIAL_BUCKETED_PROJECTION'});
 if(p?.success===false)return fail(b,'PROVIDER_REJECTED');const d=p?.data;
 if(!obj(d)||!['raw','histogram'].includes(d.source)||!Array.isArray(d.levels)||!(num(d.mid_price)>0)||!Number.isSafeInteger(d.block_number))return fail(b,'OX_SCHEMA_UNSUPPORTED');
 if(c.route_symbol!==c.symbol)return fail(b,'REQUEST_ROUTE_SYMBOL_BINDING_MISSING');
 const clock=sourceClock(b,d.snapshot_ts,c,{utcSpace:true});if(!clock.ok)return fail(b,clock.reason,clock);
 if(!['total_long','total_short','flagged_notional'].every(k=>num(d[k])!==null&&num(d[k])>=0))return fail(b,'TOTALS_OR_FLAGGED_MISSING');
 if(d.source==='histogram'&&!(num(d.source_bin_width)>0))return fail(b,'HISTOGRAM_RESOLUTION_MISSING');
 try{
 const unique=new Set();const z=[];
 for(const r of d.levels){if(!obj(r)||unique.has(r.price))throw Error('MALFORMED_OR_DUPLICATE_BUCKET');unique.add(r.price);if(!['long_count','short_count'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0))throw Error('BUCKET_COUNTS_MISSING');
  for(const [side,key,count] of [['LONG','long_notional','long_count'],['SHORT','short_notional','short_count']])z.push(zone({price:r.price,notional:r[key],side,ref:d.mid_price,count:r[count],price_semantics:'BUCKET_CENTER',source_bin_width:d.source_bin_width??null}));}
 return complete(b,z,{...clock,block_number:d.block_number,position_state_age_ms:null,reference_price:d.mid_price,totals:{long_usd:d.total_long,short_usd:d.total_short,flagged_usd:d.flagged_notional},source_form:d.source,whole_book_coverage_pct:null,
  flagged_semantics:'Included in totals, approximate OR not assigned to returned buckets; not a clean missing-coverage percentage.',query_range_pct:c.range_pct??null,query_buckets:c.buckets??null});
 }catch(e){return fail(b,e.message);}
}
export function normalizeHyperperps(p,c){
 const b=base('HyperPerps',c,['HYPERLIQUID_MAINNET_PERPS'],'VISIBLE_POSITION_CLUSTER_ESTIMATE',{venue:'Hyperliquid',quote:'USD_NOTIONAL_USDC_MARGIN',access:'KEYLESS_REST_TESTED',coverage:'COHORT_SAMPLE_NOT_FULL_EXCHANGE'});
 if(!['BTC','ETH','SOL'].includes(c.symbol))return fail(b,'SYMBOL_OUTSIDE_DOCUMENTED_COVERAGE');
 if(p?._meta?.schema!=='hyperperps.whale-heatmap.v4'||p._meta.symbol!==c.symbol||!Array.isArray(p.longs)||!Array.isArray(p.shorts)||!(num(p.spot_at_compute)>0)||!Number.isSafeInteger(p.sample_size)||p.sample_size<0)return fail(b,'HYPERPERPS_SCHEMA_OR_SYMBOL_INVALID');
 const clock=sourceClock(b,p._meta.as_of,c);if(!clock.ok)return fail(b,clock.reason,clock);
 const priceClock=sourceClock(b,p._meta.spot_as_of,c);if(!priceClock.ok)return fail(b,'REFERENCE_'+priceClock.reason);
 if(p._meta.stale!==false)return fail(b,'PROVIDER_MARKED_STALE');
 try{
  const z=[];
  for(const [rows,side] of [[p.longs,'LONG'],[p.shorts,'SHORT']])for(const r of rows){
   if(!obj(r)||!(num(r.top_wallet_share)!==null&&num(r.top_wallet_share)>=0&&num(r.top_wallet_share)<=1))throw Error('CONCENTRATION_MISSING');
   z.push(zone({price:r.price,notional:r.notional_usd,side,ref:p.spot_at_compute,count:r.wallet_count,top_wallet_share:r.top_wallet_share,price_semantics:'COHORT_CLUSTER_CENTER'}));
  }
  if(p.sample_size===0)return fail(b,'EMPTY_OR_UNPROVEN_COHORT');
  return complete(b,z,{...clock,reference_price:p.spot_at_compute,reference_source_ts:priceClock.source_ts,cohort_sample_size:p.sample_size,position_state_oldest_ts:null,whole_book_coverage_pct:null,
    excluded_classes:['EXPLICIT_TAKE_PROFIT','STOP_LOSS_ORDERS','ORDERBOOK_WALLS'],position_age_scope:'Map and reference timestamps known; per-wallet oldest source time not supplied.'});
 }catch(e){return fail(b,e.message);}
}
export function normalizeNativeHL(p,c){
 const b=base('Hyperliquid official',c,['HYPERLIQUID_MAINNET_PERPS'],'NATIVE_ACCOUNT_LIQUIDATION_PRICES',{venue:'Hyperliquid',quote:'USDC',access:'KEYLESS_REST_TESTED',coverage:'EXPLICIT_PUBLIC_ACCOUNT_SAMPLE'});
 if(!Array.isArray(p?.accounts)||c.route_symbol!==c.symbol)return fail(b,'NATIVE_INPUT_BINDING_INVALID');
 const z=[],omitted=[],seen=new Set();let oldest=c.as_of_ms;
 try{for(const r of p.accounts){
  if(typeof r.address!=='string'||!/^0x[0-9a-f]{40}$/i.test(r.address)||seen.has(r.address.toLowerCase()))throw Error('DUPLICATE_OR_INVALID_ACCOUNT');seen.add(r.address.toLowerCase());
  if(!Array.isArray(r.state?.assetPositions))throw Error('ACCOUNT_RESPONSE_INVALID');
  const clock=sourceClock(b,r.state.time,c);if(!clock.ok)throw Error(clock.reason);oldest=Math.min(oldest,clock.source_ts);
  const matches=r.state.assetPositions.filter(x=>x.position?.coin===c.symbol);if(matches.length>1)throw Error('DUPLICATE_POSITION_IN_ACCOUNT');
  for(const a of matches){const t=a.position;const size=num(t.szi);if(size===null)throw Error('POSITION_SIZE_MISSING');if(size===0)continue;
   if(num(t.liquidationPx)===null||num(t.liquidationPx)<=0){omitted.push({account:r.address,reason:'LIQUIDATION_PRICE_NOT_PROVIDED'});continue;}
   if(!['cross','isolated'].includes(t.leverage?.type))throw Error('MARGIN_TYPE_UNKNOWN');
   z.push(zone({price:t.liquidationPx,notional:t.positionValue,side:size>0?'LONG':'SHORT',ref:num(t.positionValue)/Math.abs(size),count:1,notionalUnit:'USDC',reference_basis:'NATIVE_POSITION_VALUE_DIVIDED_BY_ABSOLUTE_SIZE',account:r.address,margin_mode:t.leverage.type,conditional_on_other_positions:t.leverage.type==='cross',source_ts:clock.source_ts,price_semantics:'EXCHANGE_ACCOUNT_LIQUIDATION_PRICE'}));
  }
 }
 if(!seen.size)return fail(b,'NO_ACCOUNT_SAMPLE');
 return complete(b,z,{source_ts:oldest,source_age_ms:c.as_of_ms-oldest,reference_price:null,reference_basis:'PER_POSITION_NATIVE_VALUE_DIVIDED_BY_SIZE',account_count:seen.size,omitted_positions:omitted,whole_book_coverage_pct:null,selection_bias:p.selection_bias??'EXPLICIT_SAMPLE_UNKNOWN_SELECTION'});
 }catch(e){return fail(b,e.message);}
}
export function normalizeBykStructured(p,c){
 const d=p?.real_levels;const b=base('ByKaranteli',c,['BYK_UNRESOLVED_UPSTREAM'],'MODEL_PROJECTED_LEVELS',{venue:'MULTI_VENUE',quote:'USD',access:'PROTECTED_RUNNER_KEY_REQUIRED',coverage:'PROVIDER_MODEL_NOT_POSITION_CENSUS'});
 if(p?.error)return fail(b,'PROVIDER_ACCESS_OR_DATA_ERROR');
 // Never infer index/side/price from heatmap_cells. `real_levels` is projected,
 // despite its misleading name; executed events live in real_liquidations.
 if(!obj(d)||d.model_version!=='real_v1_multi'||!Array.isArray(d.levels)||!(num(d.reference_price)>0)||!Array.isArray(d.sources)||!d.sources.length)return fail(b,'BYK_STRUCTURED_SCHEMA_UNSUPPORTED');
 if(p.symbol!==c.symbol&&p.symbol!==c.symbol+'USDT')return fail(b,'BYK_SYMBOL_MISMATCH');
 const clock=sourceClock(b,p.as_of,c);if(!clock.ok)return fail(b,clock.reason,clock);
 const known={binance:'BINANCE_PERPS',bybit:'BYBIT_PERPS',okx:'OKX_PERPS',gate:'GATE_PERPS',htx:'HTX_PERPS',hyperliquid:'HYPERLIQUID_MAINNET_PERPS'};
 if(!d.sources.every(v=>known[v]))return fail(b,'UPSTREAM_SCHEMA_UNSUPPORTED');
 try{
  const z=d.levels.map(r=>zone({price:r.price,notional:r.notional_usd,side:r.side==='long'?'LONG':r.side==='short'?'SHORT':null,ref:d.reference_price,price_semantics:'PROVIDER_MODEL_PRICE_BIN'}));
  return complete({...b,upstream_groups:[...new Set(d.sources.map(s=>known[s]))]},z,{...clock,reference_price:d.reference_price,model_version:d.model_version,excluded_leverage_tiers:d.excluded_tiers??null,visible_half_range_pct:d.band_half_range_pct??null,live_authorized_response_proven:false,matrix_ignored:true});
 }catch(e){return fail(b,e.message);}
}
export function normalizeXoomar(p,c){
 const b=base('XOOMAR',c,['XOOMAR_OBSERVED_VENUES'],'REALIZED_EVENTS',{venue:'PER_EVENT',quote:'USD_REPORTED',access:'KEYLESS_REST_TESTED'});
 if(!Array.isArray(p?.data)||p.source!=='xoomar.com')return fail(b,'XOOMAR_SCHEMA_INVALID');
 const clock=sourceClock(b,p.updatedAt,c);if(!clock.ok)return fail(b,clock.reason,clock);
 const events=[],groups=new Set(),seen=new Set();
 try{for(const r of p.data){
  const ts=timestamp(r.ts);if(ts===null||ts>c.as_of_ms)throw Error('REALIZED_EVENT_TIME_INVALID');
  const baseSymbol=String(r.rawSymbol).replace(/[-_]?USDT$/,'');if(baseSymbol!==c.symbol)throw Error('REALIZED_SYMBOL_MISMATCH');
  if(!['htx','okx','gate'].includes(r.exchange)||!['long','short'].includes(r.side)||!(num(r.price)>0)||!(num(r.usdValue)!==null&&num(r.usdValue)>=0))throw Error('REALIZED_ROW_INVALID');
  const id=r.exchange+':'+r.id;if(seen.has(id))throw Error('DUPLICATE_EVENT');seen.add(id);groups.add(r.exchange.toUpperCase()+'_PERPS');
  events.push({provider_event_id:id,venue:r.exchange,source_ts:ts,native_price:num(r.price),liquidated_side:r.side.toUpperCase(),reported_notional_usd:num(r.usdValue),native_exchange_event_id:null,quantity_unit_verified:false});
 }
 return seal({...complete({...b,upstream_groups:[...groups]},[],{...clock,events,truncated_or_paged:true,totals_are_24h:false,notional_unit_independently_verified:false,attribution:p.attribution??null,license:p.license??null}),status:'REALIZED_PAGE_CONTEXT_ONLY'});
 }catch(e){return fail(b,e.message);}
}
