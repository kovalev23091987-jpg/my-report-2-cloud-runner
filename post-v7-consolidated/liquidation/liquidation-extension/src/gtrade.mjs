import {base,fail,complete,zone,num,timestamp,sourceClock} from './core.mjs';
// sdk is injected: use the pinned official @gainsnetwork/sdk 1.8.10 package.
// It accounts for actual leverage, realized PnL and funding/borrowing/trading fees.
export function normalizeGTrade({variables,trades,prices,receipts},c,sdk){
 const b=base('gTrade official SDK',c,['GTRADE_ARBITRUM'],'NATIVE_POSITION_FEE_AWARE_ESTIMATES',{venue:'gTrade-Arbitrum',quote:'USD',access:'KEYLESS_REST_TESTED',coverage:'BACKEND_OPEN_MARKET_TRADES_NON_ATOMIC'});
 if(!sdk?.getLiquidationPrice||!sdk?.buildLiquidationPriceContext||!Array.isArray(trades)||!Array.isArray(variables?.pairs)||!Array.isArray(prices?.indexPrices))return fail(b,'GTRADE_SCHEMA_OR_SDK_MISSING');
 if(!variables.pairs.some(p=>p?.from===c.symbol&&p?.to==='USD'))return fail(b,'GTRADE_SYMBOL_UNSUPPORTED');
 const variableClock=sourceClock(b,variables.lastRefreshed,c),priceClock=sourceClock(b,prices.time,c);
 if(!variableClock.ok||!priceClock.ok)return fail(b,!variableClock.ok?variableClock.reason:'INDEX_'+priceClock.reason);
 if(!Array.isArray(receipts)||receipts.length!==3||receipts.some(r=>r.http_status!==200||timestamp(r.received_ts)===null||r.received_ts>c.as_of_ms||c.as_of_ms-r.received_ts>c.max_age_ms))return fail(b,'GTRADE_RECEIPT_WINDOW_NOT_CLOSED');
 try{
 const g=sdk.transformGlobalTradingVariables(variables).globalTradingVariables;
 const selected=trades.filter(t=>t.trade?.isOpen===true&&String(t.trade.tradeType)==='0'&&variables.pairs[Number(t.trade.pairIndex)]?.from===c.symbol&&variables.pairs[Number(t.trade.pairIndex)]?.to==='USD');
 const z=[],excluded=[],seen=new Set();
 for(const raw of selected){
  const id=String(raw.trade.user).toLowerCase()+':'+raw.trade.index;if(seen.has(id))throw Error('DUPLICATE_GTRADE_POSITION');seen.add(id);
  try{
   const tc=sdk.convertTradeContainerBackend(raw,g.collaterals),t=tc.trade,ix=t.pairIndex,coll=g.collaterals[t.collateralIndex-1];
   if(coll?.collateralIndex!==t.collateralIndex||!(num(coll?.prices?.collateralPriceUsd)>0))throw Error('COLLATERAL_ID_OR_PRICE_MISSING');
   const px=prices.indexPrices[ix];if(!(num(px)>0)||!Number.isSafeInteger(variables.currentBlock)||num(g.pairs[ix]?.spreadP)===null||num(g.pairs[ix]?.spreadP)<0)throw Error('INDEX_BLOCK_OR_SPREAD_MISSING');
   if(!(num(t.positionSizeToken)>0))throw Error('LEGACY_POSITION_SIZE_UNIT_NOT_CLOSED');
   if(!tc.tradeFeesData||!tc.liquidationParams||!raw.initialAccFees)throw Error('FEES_OR_MARGIN_DATA_MISSING');
   const ctx=sdk.buildLiquidationPriceContext(g,tc,{currentBlock:variables.currentBlock,currentTimestamp:Math.floor(variableClock.source_ts/1000),currentPairPrice:px,spreadP:g.pairs[ix].spreadP});
   // A missing sub-context must not be silently replaced by zero fees.
   const v2Fields=Number(raw.tradeFeesData?.initialAccBorrowingFeeP)!==0||Number(raw.tradeFeesData?.initialAccFundingFeeP)!==0;
   if(v2Fields&&(!ctx.borrowingV2||!ctx.funding))throw Error('ACTIVE_FEE_CONTEXT_MISSING');
   const lp=sdk.getLiquidationPrice(t,ctx);if(!(num(lp)>0))throw Error('LIQ_PRICE_NOT_POSITIVE');
   // SDK positionSizeToken * index is in collateral units, not USD.
   const positionValueCollateral=sdk.calculatePositionSizeCollateral(t.positionSizeToken,px);
   const usd=positionValueCollateral*coll.prices.collateralPriceUsd;
   z.push(zone({price:lp,notional:usd,side:t.long?'LONG':'SHORT',ref:px,count:1,position_id:id,actual_leverage:t.leverage,collateral_symbol:coll.symbol,
    value_in_collateral:positionValueCollateral,collateral_price_usd:coll.prices.collateralPriceUsd,contracts_version:tc.tradeInfo.contractsVersion,
    price_semantics:'OFFICIAL_SDK_ESTIMATE_INDEX_TRIGGER',sdk_version:'1.8.10',index_price:px,mark_price:prices.closes[ix]??null,source_ts:variableClock.source_ts}));
  }catch(e){excluded.push({position_id:id,reason:e.message});}
 }
 if(selected.length>0&&z.length===0)return fail(b,'ALL_SELECTED_POSITIONS_REJECTED',{selected_market_positions:selected.length,excluded_positions:excluded,source_ts:Math.min(variableClock.source_ts,priceClock.source_ts),positions_source_ts:null});
 return complete(b,z,{source_ts:Math.min(variableClock.source_ts,priceClock.source_ts),source_age_ms:c.as_of_ms-Math.min(variableClock.source_ts,priceClock.source_ts),block_number:variables.currentBlock,
   positions_source_ts:null,positions_observed_at_ms:receipts[1].received_ts,positions_time_basis:'RECEIPT_OF_CURRENT_OPEN_TRADES_ENDPOINT',same_block_atomic:false,
   selected_market_positions:selected.length,excluded_positions:excluded,pending_orders_excluded:trades.filter(t=>String(t.trade?.tradeType)!=='0').length,execution_target_eligible:false,
   estimation_note:'Native positions plus official SDK; backend and index price are close in time, not atomic same-block state. Not a guaranteed trigger.'});
 }catch(e){return fail(b,e.message);}
}
