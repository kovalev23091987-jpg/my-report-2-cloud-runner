// Bounded read-only comparison on identical real HTTP bodies. No decision run,
// Telegram, trading, quota increase, or substitution of another exchange.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export async function probeHtxFlow({db,load,fetch_impl,budget,run_id,root,output_dir}) {
  const {installEvidenceSourceStore,reserveEvidenceSourceAttempts}=await load('src/evidence-source-store.mjs');
  const {SOURCE_POLICIES}=await load('src/evidence-source-adapters.mjs');
  await installEvidenceSourceStore(db);
  const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
  async function expose(source,label){
    const imports=source.replace(/from (['"])\.\/([^'"\n]+)\1/g,(_,q,name)=>`from ${JSON.stringify(pathToFileURL(path.join(root,'src',name)).href)}`);
    return import('data:text/javascript;base64,'+Buffer.from(imports+`\n// ${label}\nexport {spotSnapshot,futuresTrajectory,rawTradeRecordIntegrity};\n`).toString('base64'));
  }
  const after=await expose(worker,'after');
  const beforeSource=worker.replace('data = parseHtxMarketJson(text, url);','data = JSON.parse(text);').replace('return exactTradeIdentity(trade);',`const value=trade?.['trade-id']??trade?.trade_id??trade?.id;if(value===null||value===undefined)return null;return String(value).trim()||null;`);
  if(beforeSource===worker)throw Error('BEFORE_AFTER_PATCH_NOT_MATCHED');
  const before=await expose(beforeSource,'before');
  const nativeFetch=globalThis.fetch,NativeDate=globalThis.Date,bodies=new Map(),receipts=[];
  let replay=false,actual_http=0,reservationIndex=0;
  globalThis.fetch=async(url,init)=>{
    const key=String(url),u=new URL(key);
    if(!['api.htx.com','api.hbdm.com'].includes(u.hostname)||init?.method&&init.method!=='GET')throw Error('PUBLIC_HTX_GET_ONLY');
    if(bodies.has(key)){const saved=bodies.get(key);return new Response(saved.body,{status:saved.status,headers:{'content-type':'application/json'}});}
    if(replay)throw Error('REPLAY_SOURCE_MISSING');
    if(actual_http>=20)throw Error('HTX_DIAGNOSTIC_CAP');
    const id=`${run_id}:FLOW:${reservationIndex++}`,grant=budget.reserve({logical_request_id:id,lane:'background',attempts:1});
    if(!grant.allowed)throw Error(grant.status);
    const admission=await reserveEvidenceSourceAttempts(db,{source:'HTX_LARGE_TRADES',reservation_id:id,attempts:1,daily_cap:SOURCE_POLICIES.HTX_LARGE_TRADES.daily_cap});
    if(!admission.allowed)throw Error(admission.status);
    actual_http++;
    const receipt={url:key,actual_http:1,admission};receipts.push(receipt);
    try{
      const res=await fetch_impl(url,{...init,redirect:'error'}),parts=[];let bytes=0;
      for await(const part of res.body){bytes+=part.length;if(bytes>8*1024*1024)throw Error('BODY_LIMIT');parts.push(part);}
      const body=Buffer.concat(parts).toString('utf8'),file=`htx-flow-body-${receipts.indexOf(receipt)+1}.json`;
      receipt.http_status=res.status;receipt.bytes=bytes;receipt.sha256=createHash('sha256').update(body).digest('hex');receipt.file=file;
      bodies.set(key,{body,status:res.status});fs.writeFileSync(path.join(output_dir,file),body);
      return new Response(body,{status:res.status,headers:{'content-type':'application/json'}});
    }catch(error){receipt.error=String(error.message).slice(0,120);throw error;}
  };
  const summarize=(p,kind)=>kind==='spot'?{quality_status:p.quality_status,health:p.health,coverage:p.coverage,endpoint_errors:p.endpoint_errors,flow_quality:p.order_flow?.quality,windows:p.order_flow?.windows}: {health:p.health,coverage:p.coverage,endpoint_errors:p.endpoint_errors,windows:Object.fromEntries(Object.entries(p.windows||{}).map(([k,v])=>[k,{price:v.price,order_flow:v.order_flow}]))};
  try{
    await after.futuresTrajectory({contract:'QNT-USDT',trades:2000,kline_size:1600});
    await after.spotSnapshot({symbol:'QNT-USDT',trades:2000});
    await after.spotSnapshot({symbol:'SOL-USDT',trades:2000});
    replay=true;const comparison_ts=NativeDate.now();
    globalThis.Date=class extends NativeDate{static now(){return comparison_ts;}};
    const comparisons=[];
    for(const [contract,kind] of [['QNT-USDT','futures'],['QNT-USDT','spot'],['SOL-USDT','spot']]){
      const invoke=api=>kind==='spot'?api.spotSnapshot({symbol:contract,trades:2000}):api.futuresTrajectory({contract,trades:2000,kline_size:1600});
      comparisons.push({contract,kind,before:summarize(await invoke(before),kind),after:summarize(await invoke(after),kind)});
    }
    const identity_comparisons=[];
    const {parseHtxTradePayload}=await load('src/htx-trade-json.mjs');
    for(const [url,raw] of bodies){if(!url.includes('/history/trade'))continue;
      try{const old=JSON.parse(raw.body),fresh=parseHtxTradePayload(raw.body),flat=p=>(p?.data||[]).flatMap(r=>r?.data||[]),oldRows=flat(old),rows=flat(fresh),market=url.includes('api.htx.com')?'spot':'futures';
        identity_comparisons.push({url,rows:rows.length,before:before.rawTradeRecordIntegrity(oldRows,{market,contract_size:1}),after:after.rawTradeRecordIntegrity(rows,{market,contract_size:1}),first_wire_ids:rows.slice(0,2).map(r=>r['trade-id']??r.id)});
      }catch(error){identity_comparisons.push({url,status:'PAYLOAD_NOT_ADMITTED',reason:String(error.message).slice(0,80)});}
    }
    return {status:'READ_ONLY_FLOW_DIAGNOSTIC_CLOSED',network_calls:actual_http,receipts,summary:{comparison_ts,comparisons,identity_comparisons,identical_http_bodies:true,replay_http_calls:0,decision_run:false,score_changed:false,entry_authorization:false,volume_profile_approved:false},evidence:[]};
  }finally{globalThis.fetch=nativeFetch;globalThis.Date=NativeDate;}
}
