async function runPrivateD1Relay(a) {
  // Codex functions.exec expression. This is not a server or a Node entrypoint.
  const expectedPath='/accounts/70ee0af85191ea470e74c7383fdec772/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query';
  const utf8=s=>encodeURIComponent(s).replace(/%([0-9A-F]{2})/g,(_,v)=>String.fromCharCode(parseInt(v,16)));
  const b64=s=>{const b=utf8(s),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<b.length;i+=3){const x=b.charCodeAt(i),y=i+1<b.length?b.charCodeAt(i+1):0,z=i+2<b.length?b.charCodeAt(i+2):0;out+=alphabet[x>>2]+alphabet[((x&3)<<4)|(y>>4)]+(i+1<b.length?alphabet[((y&15)<<2)|(z>>6)]:'=')+(i+2<b.length?alphabet[z&63]:'=');}return out;};
  const parseTool=r=>{if(r.isError)throw Error('MCP_CONNECTOR_CALL_FAILED');if(r.structuredContent)return r.structuredContent;const t=r.content?.find(c=>c.type==='text');if(!t)throw Error('MCP_ACTUAL_BODY_MISSING');return JSON.parse(t.text);};
  if(!['ACTUAL_ADMITTED_NATIVE','ARTIFICIAL_TTY_TRANSPORT'].includes(a.mode)||!Number.isSafeInteger(a.expires_ts)||Date.now()>=a.expires_ts||a.maximum_requests>16||a.maximum_requests<1)throw Error('ROOT_RELAY_BOUND');
  if(a.mode==='ACTUAL_ADMITTED_NATIVE'&&typeof tools.mcp__codex_apps__cloudflare_api_work_execute!=='function')throw Error('CONNECTOR_NOT_AVAILABLE');
  const audit={schema:'ROOT_PRIVATE_D1_RELAY_ORCHESTRATION_V1',mode:a.mode,started_ts:Date.now(),maximum_requests:a.maximum_requests,rpc:[],private_results:a.private_results??null,no_retry:true};
  let result=await tools.exec_command({cmd:a.command,workdir:a.workdir,tty:true,yield_time_ms:1000,max_output_tokens:24000});
  let session=result.session_id,buffer='',final=null;
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
        let reply;
        const meta={id:request.id,request_body_sha256:request.request_body_sha256,request_body_bytes:request.request_body_bytes,started_ts:Date.now()};
        if(a.mode==='ARTIFICIAL_TTY_TRANSPORT'){
          reply={tag:'F629_PRIVATE_D1_REPLY_V1',id:request.id,request_body_sha256:request.request_body_sha256,status:503,body_b64:b64('ARTIFICIAL_EXACT_BYTES_NO_ACK_NO_META'),body_basis:'RAW_CONNECTOR_BODY_UTF8'};
          meta.artificial_status=503;
        }else{
          try{
            const raw=await tools.mcp__codex_apps__cloudflare_api_work_execute({link_id:a.connector_link_id,account_id:'70ee0af85191ea470e74c7383fdec772',code:'async () => {return await cloudflare.request({method:"POST",path:'+JSON.stringify(expectedPath)+',body:'+JSON.stringify(request.body)+'});}'});
            const actual=parseTool(raw);
            if(!actual||!Number.isInteger(actual.status)||actual.status<200||actual.status>599)throw Error('MCP_ACTUAL_HTTP_STATUS_MISSING');
            const body=JSON.stringify(actual);
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
        for(let i=0;i<line.length;i+=48000){
          result=await tools.write_stdin({session_id:session,chars:line.slice(i,i+48000),yield_time_ms:250,max_output_tokens:24000});
          if(i+48000<line.length&&(result.output??'').trim())throw Error('EARLY_OUTPUT_BEFORE_COMPLETE_REPLY');
        }
        if(audit.rpc.length%4===0)notify({native_relay_requests:audit.rpc.length,private_payloads_omitted:true});
        continue;
      }
      if(result.exit_code!==undefined){audit.exit_code=result.exit_code;break;}
      if(!session)throw Error('ROOT_RELAY_SESSION_LOST');
      result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:24000});
    }
    if(buffer.trim()){try{final=JSON.parse(buffer.trim());}catch{throw Error('ROOT_FINAL_STDOUT_INCOMPLETE');}}
    audit.final=final;audit.status=audit.exit_code===0?'PROCESS_COMPLETED':'FAILED_NO_RETRY';
  }catch(error){
    audit.status='FAILED_OR_UNKNOWN_NO_RETRY';audit.error=String(error.message??error).slice(0,180);
    if(session){try{await tools.write_stdin({session_id:session,chars:'\u0003',yield_time_ms:250,max_output_tokens:1000});}catch{}}
  }
  audit.completed_ts=Date.now();store('lastPrivateD1RelayAudit',audit);store('activePrivateD1Relay',null);return audit;
}
