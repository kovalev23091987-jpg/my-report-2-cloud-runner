// Plan against observed durable counters; never reset or alias source budgets.
export function planN05NativeHeadroom({candidates,poloniex_used,htx_identity_used}={}){
 const root={allowed:false,Poloniex_cap:16,HTX_identity_cap:8,shared_metadata_HTTP:3,primary_identity_HTTP:1,selected_contracts:[],deferred_contracts:[]};
 if(!Array.isArray(candidates)||!candidates.length||new Set(candidates).size!==candidates.length||candidates.some(c=>typeof c!=='string'||!/^\S+-USDT$/u.test(c))||![poloniex_used,htx_identity_used].every(n=>Number.isSafeInteger(n)&&n>=0))return{...root,reason:'EXACT_CANDIDATES_AND_OBSERVED_COUNTERS_REQUIRED'};
 const remaining=Math.max(0,root.Poloniex_cap-poloniex_used),count=Math.min(candidates.length,Math.max(0,remaining-root.shared_metadata_HTTP));
 if(htx_identity_used+root.primary_identity_HTTP>root.HTX_identity_cap)return{...root,reason:'PRIMARY_IDENTITY_HEADROOM_REQUIRED',deferred_contracts:[...candidates]};
 if(!count)return{...root,reason:'ENTIRE_USEFUL_BATCH_SOURCE_HEADROOM_REQUIRED',deferred_contracts:[...candidates]};
 return{...root,allowed:true,selected_contracts:candidates.slice(0,count),deferred_contracts:candidates.slice(count),Poloniex_required:root.shared_metadata_HTTP+count,maximum_source_HTTP:root.shared_metadata_HTTP+count+root.primary_identity_HTTP};
}
