import {positive, finite} from '../contracts/index.mjs';

function validSide(rows, ascending) {
  return Array.isArray(rows)&&rows.length>0&&rows.every((r,i)=>Array.isArray(r)&&r.length===2&&r.every(positive)&&
    (i===0||(ascending?r[0]>rows[i-1][0]:r[0]<rows[i-1][0])));
}
function fillQuantity(rows, quantity) {
  let left=quantity, quote=0, used=0;
  for(const [p,q] of rows){if(left<=0)break;const n=Math.min(left,q);quote+=n*p;left-=n;used++;}
  const filled=quantity-left;
  return {quantity_base:filled,quote_usdt:quote,vwap:filled>0?quote/filled:null,fully_filled:left<=Math.max(1,quantity)*1e-12,levels_used:used};
}
function buyBudget(asks, budget, step) {
  let left=budget, quantity=0;
  for(const [p,q] of asks){if(left<=0)break;const n=Math.min(q,left/p);quantity+=n;left-=n*p;}
  const budgetCovered=left<=Math.max(1,budget)*1e-12;
  if(positive(step))quantity=Math.floor((quantity+step*1e-10)/step)*step;
  let result=fillQuantity(asks,quantity);
  // Rounding may never authorize overspending a quote budget.
  if(result.quote_usdt>budget+Math.max(1,budget)*1e-12&&positive(step)){
    quantity=Math.max(0,quantity-step);result=fillQuantity(asks,quantity);
  }
  return {...result,requested_budget_usdt:budget,budget_covered:budgetCovered,unused_budget_usdt:budget-result.quote_usdt};
}
export function measureLiquidity(book, instrument, profile) {
  const unavailable=reason=>({status:'UNAVAILABLE',reason,unit:'USDT',sizes:[],position_limit_usdt:null,spread_pct:null,snapshot_only:true});
  if(!validSide(book?.asks,true)||!validSide(book?.bids,false)||book.bids[0][0]>=book.asks[0][0])return unavailable('INVALID_OR_CROSSED_ORDERBOOK');
  if(!profile.position_sizes_usdt?.every(positive)||!finite(profile.max_spread_pct)||!finite(profile.max_slippage_pct_per_side))return unavailable('LIQUIDITY_PROFILE_REQUIRED');
  const ask=book.asks[0][0],bid=book.bids[0][0],spread=100*(ask-bid)/((ask+bid)/2);
  const sizes=profile.position_sizes_usdt.map(budget=>{
    const entry=buyBudget(book.asks,budget,instrument.quantity_step),exit=fillQuantity(book.bids,entry.quantity_base);
    const entrySlip=positive(entry.vwap)?100*(entry.vwap/ask-1):null,exitSlip=positive(exit.vwap)?100*(1-exit.vwap/bid):null;
    const reasons=[];
    if(!entry.budget_covered||!entry.fully_filled||entry.quantity_base<=0)reasons.push('ENTRY_CAPACITY_INSUFFICIENT');
    if(!exit.fully_filled)reasons.push('EXIT_CAPACITY_INSUFFICIENT_FOR_SAME_QUANTITY');
    if(spread>profile.max_spread_pct)reasons.push('SPREAD_EXCEEDS_PROFILE');
    if(entrySlip===null||entrySlip>profile.max_slippage_pct_per_side)reasons.push('ENTRY_SLIPPAGE_EXCEEDS_PROFILE');
    if(exitSlip===null||exitSlip>profile.max_slippage_pct_per_side)reasons.push('EXIT_SLIPPAGE_EXCEEDS_PROFILE');
    return {notional_usdt:budget,usable:reasons.length===0,reasons,entry,exit,entry_slippage_pct:entrySlip,exit_slippage_pct:exitSlip};
  });
  const allowed=sizes.filter(r=>r.usable).map(r=>r.notional_usdt);
  return {status:allowed.length?'USABLE':'INSUFFICIENT',reason:allowed.length?null:'NO_SUPPORTED_POSITION_SIZE',unit:'USDT',spread_pct:spread,sizes,
    position_limit_usdt:allowed.length?Math.max(...allowed):null,snapshot_only:true,quantity_step_known:positive(instrument.quantity_step),future_execution_guaranteed:false,fees_and_funding_included:false};
}
