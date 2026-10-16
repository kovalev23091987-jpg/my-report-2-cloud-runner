// Native bindings provide their own billing metadata. Never infer zero usage
// from an absent reply, and never expose database values in the receipt.
const count=v=>Number.isSafeInteger(v)&&v>=0;
export function nativeMeasuredD1(binding){
 if(!binding?.prepare)throw Error('NATIVE_MEASURED_D1_BINDING_REQUIRED');
 const usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};
 return {
  usageSnapshot:()=>({...usage}),
  prepare(sql){
   let args=[];
   const execute=async method=>{
    usage.requests++;
    let result;
    try{result=await binding.prepare(sql).bind(...args)[method]();}
    catch{usage.unknown_ops++;throw Error('NATIVE_D1_REPLY_UNMEASURED');}
    for(const key of ['rows_read','rows_written'])if(count(result?.meta?.[key]))usage[key]+=result.meta[key];
    if(result?.success===false||!count(result?.meta?.rows_read)||!count(result?.meta?.rows_written)){
     usage.unknown_ops++;throw Error('NATIVE_D1_USAGE_UNMEASURED');
    }
    return result;
   };
   return {bind(...values){args=values;return this;},all:()=>execute('all'),run:()=>execute('run'),async first(column){const r=await execute('all'),row=r.results?.[0]??null;return column===undefined?row:row?.[column]??null;}};
  }
 };
}
export function sumNativeUsage(...databases){
 const total={requests:0,rows_read:0,rows_written:0,unknown_ops:0};
 for(const db of databases){const u=db.usageSnapshot();for(const key of Object.keys(total)){if(!count(u[key]))throw Error('NATIVE_USAGE_SNAPSHOT_INVALID');total[key]+=u[key];}}
 return total;
}
