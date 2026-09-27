const validAddress=a=>typeof a==='string'&&/^0x[a-f0-9]{40}$/i.test(a);
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
// Indexer liquidation prices rank discovery candidates ONLY. No hint is emitted
// as a liquidation level: the collector must reread every selected native account.
export function selectNativeAccountSample(positions,{mark_price=null,max_accounts=4}={}){
 if(!Array.isArray(positions)||!Number.isInteger(max_accounts)||max_accounts<1||max_accounts>8)throw Error('BOUNDED_POSITION_SAMPLE_REQUIRED');
 const mark=finite(mark_price),seen=new Set(),eligible=[];
 for(const p of positions){if(!validAddress(p?.address)||finite(p.size)===null||p.size===0||seen.has(p.address.toLowerCase()))continue;seen.add(p.address.toLowerCase());eligible.push(p);}
 const near=p=>{const lp=finite(p.liq_price);return mark!==null&&mark>0&&lp!==null&&lp>0&&((p.size>0&&lp<mark)||(p.size<0&&lp>mark))?Math.abs(lp/mark-1):null;};
 const longs=eligible.filter(p=>p.size>0),shorts=eligible.filter(p=>p.size<0);
 const large=rows=>[...rows].sort((a,b)=>Math.abs(b.size)-Math.abs(a.size)||a.address.localeCompare(b.address));
 const close=rows=>rows.filter(p=>near(p)!==null).sort((a,b)=>near(a)-near(b)||Math.abs(b.size)-Math.abs(a.size)||a.address.localeCompare(b.address));
 const groups=[{rows:close(longs),reason:'NEAR_LONG_HINT_FOR_NATIVE_RECHECK'},{rows:close(shorts),reason:'NEAR_SHORT_HINT_FOR_NATIVE_RECHECK'},
  {rows:large(longs),reason:'LARGE_LONG_FOR_NATIVE_RECHECK'},{rows:large(shorts),reason:'LARGE_SHORT_FOR_NATIVE_RECHECK'}];
 const picked=[],used=new Set();let changed=true;
 while(picked.length<max_accounts&&changed){changed=false;for(const g of groups){while(g.rows.length&&used.has(g.rows[0].address.toLowerCase()))g.rows.shift();if(!g.rows.length)continue;const p=g.rows.shift();used.add(p.address.toLowerCase());picked.push({address:p.address,discovery_reason:g.reason});changed=true;if(picked.length===max_accounts)break;}}
 return {policy:'NEAR_AND_LARGE_BALANCED_V1',selected:picked,eligible_visible_accounts:eligible.length,model_prices_used_as_evidence:false,full_market_coverage_proven:false,
  reference_mark_available:mark!==null&&mark>0,missing_mark_fallback:'BALANCED_BY_SIZE_ONLY',source_page_is_partial:true};
}
