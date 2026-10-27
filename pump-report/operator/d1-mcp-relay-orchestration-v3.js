async function runPrivateD1Relay(a) {
  // Codex functions.exec expression. This is not a server or a Node entrypoint.
  const sha256=(function sha256(value) {
  const binary=encodeURIComponent(value).replace(/%([0-9A-F]{2})/g,(_,v)=>String.fromCharCode(parseInt(v,16)));
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],size=Math.ceil((binary.length+9)/64)*64,data=new Uint8Array(size),w=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let i=0;i<binary.length;i++)data[i]=binary.charCodeAt(i);data[binary.length]=128;
  const bits=binary.length*8;for(let i=0;i<8;i++)data[size-1-i]=Math.floor(bits/2**(8*i))&255;
  for(let offset=0;offset<size;offset+=64){
    for(let i=0;i<16;i++){const p=offset+i*4;w[i]=((data[p]<<24)|(data[p+1]<<16)|(data[p+2]<<8)|data[p+3])>>>0;}
    for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-7]+(rotr(y,17)^rotr(y,19)^(y>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,z]=h;
    for(let i=0;i<64;i++){const t1=(z+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    for(const [i,v]of [a,b,c,d,e,f,g,z].entries())h[i]=(h[i]+v)>>>0;
  }
  return h.map(x=>x.toString(16).padStart(8,'0')).join('');
});
  const expectedPath='/accounts/70ee0af85191ea470e74c7383fdec772/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query';
  const utf8=s=>encodeURIComponent(s).replace(/%([0-9A-F]{2})/g,(_,v)=>String.fromCharCode(parseInt(v,16)));
  const b64=s=>{const b=utf8(s),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<b.length;i+=3){const x=b.charCodeAt(i),y=i+1<b.length?b.charCodeAt(i+1):0,z=i+2<b.length?b.charCodeAt(i+2):0;out+=alphabet[x>>2]+alphabet[((x&3)<<4)|(y>>4)]+(i+1<b.length?alphabet[((y&15)<<2)|(z>>6)]:'=')+(i+2<b.length?alphabet[z&63]:'=');}return out;};
  const parseTool=r=>{if(r.isError)throw Error('MCP_CONNECTOR_CALL_FAILED');if(r.structuredContent)return r.structuredContent;const t=r.content?.find(c=>c.type==='text');if(!t)throw Error('MCP_ACTUAL_BODY_MISSING');return JSON.parse(t.text);};
  if(!['ACTUAL_ADMITTED_NATIVE','ARTIFICIAL_TTY_TRANSPORT'].includes(a.mode)||!Number.isSafeInteger(a.expires_ts)||Date.now()>=a.expires_ts||!Number.isSafeInteger(a.maximum_requests)||a.maximum_requests>16||a.maximum_requests<1)throw Error('ROOT_RELAY_BOUND');
  if(a.mode==='ACTUAL_ADMITTED_NATIVE'&&typeof tools.mcp__codex_apps__cloudflare_api_work_execute!=='function')throw Error('CONNECTOR_NOT_AVAILABLE');
  const audit={schema:'ROOT_PRIVATE_D1_RELAY_ORCHESTRATION_V1',mode:a.mode,started_ts:Date.now(),maximum_requests:a.maximum_requests,rpc:[],private_results:a.private_results??null,no_retry:true};
  let result=await tools.exec_command({cmd:a.command,workdir:a.workdir,tty:true,yield_time_ms:1000,max_output_tokens:24000});
  let session=result.session_id,buffer='',final=null;const attemptedIDs=new Set();
  store('activePrivateD1Relay',{session_id:session,mode:a.mode,started_ts:audit.started_ts});
  try{
    for(;;){
      if(Date.now()>=a.expires_ts)throw Error('ROOT_RELAY_EXPIRED');
      buffer+=(result.output??'').replace(/\u001b\[[0-9;]*m/g,'');
      let request=null;
      for(;;){
        const p=buffer.indexOf('\n');if(p<0)break;
        const line=buffer.slice(0,p).replace(/\r$/,'');buffer=buffer.slice(p+1);
        if(!line.trim())continue;
        let item;try{item=JSON.parse(line);}catch{throw Error('ROOT_PRIVATE_STDOUT_NOT_COMPLETE_JSON');}
        if(item.tag==='F629_PRIVATE_D1_REQUEST_V1'){
          if(request)throw Error('ROOT_MULTIPLE_PENDING_REQUESTS');request=item;
        }else final=item;
      }
      if(request){
        if(!session||audit.rpc.length>=a.maximum_requests||request.method!=='POST'||request.path!==expectedPath||typeof request.id!=='string'||!request.id.startsWith('F629:')||!/^[a-f0-9]{64}$/.test(request.request_body_sha256??'')||!request.body||Object.keys(request.body).sort().join('|')!=='params|sql'||typeof request.body.sql!=='string'||!Array.isArray(request.body.params))throw Error('ROOT_RPC_SCOPE');
        const requestText=JSON.stringify(request.body),requestBytes=utf8(requestText);
        if(requestBytes.length!==request.request_body_bytes||requestBytes.length>8388608||sha256(requestText)!==request.request_body_sha256)throw Error('ROOT_RPC_BODY_BINDING_MISMATCH');
        if(attemptedIDs.has(request.id))throw Error('ROOT_RPC_REPLAY_REFUSED_BEFORE_CONNECTOR');
        attemptedIDs.add(request.id);
        let reply;
        const meta={id:request.id,request_body_sha256:request.request_body_sha256,request_body_bytes:request.request_body_bytes,started_ts:Date.now()};
        const rpcDeadline=Math.min(a.expires_ts,meta.started_ts+18000);
        if(a.mode==='ARTIFICIAL_TTY_TRANSPORT'){
          reply={tag:'F629_PRIVATE_D1_REPLY_V1',id:request.id,request_body_sha256:request.request_body_sha256,status:503,body_b64:b64('ARTIFICIAL_EXACT_BYTES_NO_ACK_NO_META'),body_basis:'RAW_CONNECTOR_BODY_UTF8'};
          meta.artificial_status=503;
        }else{
          try{
            const raw=await tools.mcp__codex_apps__cloudflare_api_work_execute({link_id:a.connector_link_id,account_id:'70ee0af85191ea470e74c7383fdec772',code:'async () => {if(Date.now()>='+rpcDeadline+')throw Error("RPC_DEADLINE_BEFORE_API");return await cloudflare.request({method:"POST",path:'+JSON.stringify(expectedPath)+',body:'+JSON.stringify(request.body)+'});}'});
            const actual=parseTool(raw);
            if(!actual||!Number.isInteger(actual.status)||actual.status<200||actual.status>599)throw Error('MCP_ACTUAL_HTTP_STATUS_MISSING');
            if(Date.now()>=rpcDeadline)throw Error('ROOT_RPC_DEADLINE_UNKNOWN_NO_RETRY');
            const body=JSON.stringify(actual);if(utf8(body).length>8388608)throw Error('ROOT_REPLY_BODY_BOUND');
            reply={tag:'F629_PRIVATE_D1_REPLY_V1',id:request.id,request_body_sha256:request.request_body_sha256,status:actual.status,body_b64:b64(body),body_basis:'COMPLETE_ACTUAL_CONNECTOR_RESPONSE_JSON'};
            Object.assign(meta,{actual_status:actual.status,actual_success:actual.success??null,response_UTF8_bytes:utf8(body).length,result_meta:Array.isArray(actual.result)?actual.result.map(x=>x?.meta??null):null});
          }catch(error){
            meta.error=String(error.message??error).slice(0,160);
            reply={tag:'F629_PRIVATE_D1_REPLY_V1',id:request.id,request_body_sha256:request.request_body_sha256,error:'CONNECTOR_CALL_FAILED'};
          }
        }
        meta.completed_ts=Date.now();audit.rpc.push(meta);
        // Full actual status/body are relayed unchanged. No synthetic success,
        // rows, write receipts or missing metadata are supplied to the operator.
        const line=JSON.stringify(reply)+'\n';
        for(let i=0;i<line.length;i+=512000){
          if(Date.now()>=rpcDeadline)throw Error('ROOT_RPC_REPLY_DEADLINE_UNKNOWN_NO_RETRY');
          result=await tools.write_stdin({session_id:session,chars:line.slice(i,i+512000),yield_time_ms:i+512000<line.length?1:250,max_output_tokens:24000});
          if(i+512000<line.length&&(result.output??'').trim())throw Error('EARLY_OUTPUT_BEFORE_COMPLETE_REPLY');
        }
        if(audit.rpc.length%4===0)notify({native_relay_requests:audit.rpc.length,private_payloads_omitted:true});
        continue;
      }
      if(result.exit_code!==undefined){audit.exit_code=result.exit_code;break;}
      if(!session)throw Error('ROOT_RELAY_SESSION_LOST');
      result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:24000});
    }
    if(buffer.trim()){try{final=JSON.parse(buffer.trim());}catch{throw Error('ROOT_FINAL_STDOUT_INCOMPLETE');}}
    audit.final=final;audit.native_acceptance_requires_private_result=a.mode==='ACTUAL_ADMITTED_NATIVE';audit.status=audit.exit_code===0?'PROCESS_COMPLETED':'FAILED_NO_RETRY';
  }catch(error){
    audit.status='FAILED_OR_UNKNOWN_NO_RETRY';audit.error=String(error.message??error).slice(0,180);
    if(session){try{await tools.write_stdin({session_id:session,chars:'\u0003',yield_time_ms:250,max_output_tokens:1000});}catch{}}
  }
  audit.completed_ts=Date.now();store('lastPrivateD1RelayAudit',audit);store('activePrivateD1Relay',null);return audit;
}
