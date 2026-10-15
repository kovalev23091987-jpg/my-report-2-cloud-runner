// Observe the existing operations, including index work. This does not admit
// work, reserve another slot, change SQL, or replace the collector's guards.
export function observeCollectorD1(binding){
 if(!binding?.prepare||typeof binding.batch!=='function')throw Error('COLLECTOR_NATIVE_BINDING_REQUIRED');
 const usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0},raw=new WeakMap();
 const snapshot=()=>({...usage});
 const account=result=>{
  usage.requests++;
  const m=result?.meta,valid=result?.success!==false&&['rows_read','rows_written'].every(k=>Number.isSafeInteger(m?.[k])&&m[k]>=0);
  if(valid){usage.rows_read+=m.rows_read;usage.rows_written+=m.rows_written;}else usage.unknown_ops++;
 };
 const statement=original=>{
  const invoke=async method=>{let result;try{result=await original[method]();}catch(error){usage.requests++;usage.unknown_ops++;throw error;}account(result);return result;};
  const wrapped={bind(...args){return statement(original.bind(...args));},all:()=>invoke('all'),run:()=>invoke('run'),async first(column){const result=await invoke('all'),row=result?.results?.[0]??null;return column===undefined?row:row?.[column]??null;}};
  raw.set(wrapped,original);return wrapped;
 };
 const db={prepare(sql){return statement(binding.prepare(sql));},usageSnapshot:snapshot,async batch(statements){
  if(!Array.isArray(statements)||statements.some(s=>!raw.has(s)))throw Error('COLLECTOR_EXACT_NATIVE_BATCH_REQUIRED');
  let result;try{result=await binding.batch(statements.map(s=>raw.get(s)));}catch(error){usage.requests+=statements.length;usage.unknown_ops+=statements.length;throw error;}
  for(let i=0;i<statements.length;i++)account(result?.[i]);
  return result;
 }};
 return{db,usageSnapshot:snapshot};
}
