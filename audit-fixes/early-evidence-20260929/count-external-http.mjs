import fs from 'node:fs';

const output=String(process.env.REPORT2_ACCEPTANCE_HTTP_COUNTER_PATH||'').trim();
const originalFetch=globalThis.fetch;
const counters={total:0,external:0,local:0,by_host:{}};

if(typeof originalFetch==='function'){
  globalThis.fetch=async function countedFetch(input,init){
    let host='UNPARSEABLE',local=false;
    try{
      const url=new URL(typeof input==='string'||input instanceof URL?input:input?.url);
      host=url.host||'NO_HOST';
      local=url.hostname==='127.0.0.1'||url.hostname==='localhost'||url.hostname==='::1';
    }catch{}
    counters.total+=1;
    counters[local?'local':'external']+=1;
    counters.by_host[host]=(counters.by_host[host]||0)+1;
    return originalFetch(input,init);
  };
}

function persist(){
  if(!output)return;
  try{fs.writeFileSync(output,`${JSON.stringify(counters,null,2)}\n`,'utf8');}catch{}
}
process.once('beforeExit',persist);
process.once('exit',persist);
