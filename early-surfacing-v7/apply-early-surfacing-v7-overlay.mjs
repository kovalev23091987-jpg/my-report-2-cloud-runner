
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.resolve(process.argv[2]||'runtime');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const proof={version:'early-surfacing-v7-overlay-20260926',runtime,changed:[],safety:{
  strategy_35_30_20_15_changed:false,
  hard_gates_changed:false,
  live_probability:false,
  validated_signal:false,
  automatic_execution:false,
  d1_schema_migration:false,
  telegram_template_layout_changed:false,
  telegram_recipients_changed:false,
  cloudflare_deploy:false
}};

function file(rel){const p=path.join(runtime,rel);if(!fs.existsSync(p))throw new Error(`RUNTIME_FILE_MISSING:${rel}`);return p;}
function patch(rel,fn){
  const p=file(rel),before=fs.readFileSync(p,'utf8'),beforeSha=sha(p);
  const after=fn(before);
  if(after===before) throw new Error(`PATCH_NO_CHANGE:${rel}`);
  fs.writeFileSync(p,after);
  proof.changed.push({path:rel,before_sha256:beforeSha,after_sha256:sha(p)});
}
function need(txt,s,label){if(!txt.includes(s))throw new Error(`ANCHOR_MISSING:${label}`);}

patch('src/v3-telegram-lifecycle-sidecar.mjs',txt=>{
  need(txt,"const score=finite(final?.score_lower_bound)??finite(early?.early_detection_quality_0_100);",'lifecycle-score');
  need(txt,"score_0_100:score,",'lifecycle-score-field');
  let out=txt;
  out=out.replace(
    "const score=finite(final?.score_lower_bound)??finite(early?.early_detection_quality_0_100);",
    `const score=finite(final?.score_lower_bound)??finite(early?.early_detection_quality_0_100);
  const earlyQuality=finite(early?.early_detection_quality_0_100);
  const materialHash=[
    dir,
    lifecycle,
    score==null?'NA':String(Math.round(score/5)*5),
    earlyQuality==null?'NA':String(Math.round(earlyQuality/5)*5),
    upper(shadow?.stage||''),
    upper(shadow?.dq_status||''),
    upper(final?.timing_state||'')
  ].join('|');`
  );
  out=out.replace("score_0_100:score,","score_0_100:score,\n    message_hash:materialHash,");
  out=out.replace(/rows_read:\s*96,/, "rows_read: 160,");
  return out;
});

patch('src/v3-telegram-runtime.mjs',txt=>{
  need(txt,"const dispatchCandidate=decideLifecycleDispatch",'runtime-dispatch');
  need(txt,"const dispatchEnabled=ctx.dispatch_enabled !== false;",'runtime-enabled');
  const old=`const dispatchCandidate=decideLifecycleDispatch({previous_status:previousStatus,current_status:derived.status,contract,direction:dir,wave_id:wave,rules_version:rules,cooldown_active:ctx.cooldown_active});
  const dispatchEnabled=ctx.dispatch_enabled !== false;`;
  const neu=`let dispatchCandidate=decideLifecycleDispatch({previous_status:previousStatus,current_status:derived.status,contract,direction:dir,wave_id:wave,rules_version:rules,cooldown_active:ctx.cooldown_active});
  const materialHash=text(ctx.message_hash);
  if(dispatchCandidate.dispatch!==true && previousStatus===derived.status && ['OBSERVE','WAIT'].includes(derived.status)){
    let latest=null;
    try{
      latest=await db.prepare(\`SELECT idempotency_key,state,message_hash,telegram_message_id,last_error,created_ts,updated_ts,sent_ts
        FROM v3_telegram_dispatch_shadow
        WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND lifecycle_event=?4 AND rules_version=?5
        ORDER BY updated_ts DESC LIMIT 1\`).bind(contract,dir,wave,derived.status,rules).first();
    }catch{}
    const neverDelivered=Boolean(latest && !text(latest.telegram_message_id) &&
      ['EXPIRED_NOT_SENT','FAILED_FINAL'].includes(upper(latest.state)) &&
      (text(latest.last_error)==='PRE_ACTIVATION_BACKLOG_SUPPRESSED' || text(latest.message_hash)!==materialHash));
    const materiallyChangedAfterSend=Boolean(latest && upper(latest.state)==='SENT' && materialHash &&
      text(latest.message_hash) && text(latest.message_hash)!==materialHash &&
      now-Number(latest.sent_ts||latest.updated_ts||0)>=30*60_000);
    if(neverDelivered || materiallyChangedAfterSend){
      const refreshBucket=Math.trunc(obs/(10*60_000));
      dispatchCandidate={
        dispatch:true,
        reason:neverDelivered?'UNSENT_OBSERVATION_REARM':'MATERIAL_OBSERVATION_REFRESH',
        key:\`\${contract}|\${dir}|\${wave}|\${derived.status}|\${rules}|R\${refreshBucket}\`,
        cooldown_bypass:false,
        material_refresh:true
      };
    }
  }
  const dispatchEnabled=ctx.dispatch_enabled !== false;`;
  if(!txt.includes(old)) throw new Error('RUNTIME_DISPATCH_BLOCK_NOT_FOUND');
  return txt.replace(old,neu);
});

patch('src/v3-telegram-tz-formatter.mjs',txt=>{
  need(txt,"function scoreLines({final,shadow,early,status}={}){",'formatter-scorelines');
  need(txt,"const interest=fmtScore(early?.early_detection_quality_0_100);",'formatter-interest');
  need(txt,"...scoreLines({final,shadow,early,status})",'formatter-call');

  const helper=`
function evidenceStrengthScore({feature,shadow,early,opportunity,direction}={}){
  const rows=parse(feature?.evidence_json,[])||[];
  const dir=upper(direction); const sign=dir==='SHORT'?-1:1;
  const vals=[];
  const add=v=>{const n=finite(v);if(n!=null)vals.push(Math.max(0,Math.min(100,n)));};
  for(const r of rows){
    const domain=upper(r?.domain);
    if(domain==='RELATIVE_STRENGTH'){
      const pp=[r.btc_1h_pct_points,r.eth_1h_pct_points,r.btc_4h_pct_points,r.eth_4h_pct_points]
        .map(finite).filter(v=>v!=null).map(v=>sign*v);
      if(pp.length){const avg=pp.reduce((a,b)=>a+b,0)/pp.length;add(45+55*Math.min(1,Math.max(0,avg)/5));}
    }else if(domain==='OI_ACCELERATION'){
      const z=Math.abs(finite(r.robust_z)??0),p=finite(r.self_percentile);
      add(Math.max(p!=null?p*100:0,45+Math.min(55,z*12)));
    }else if(domain==='FUNDING_TRAJECTORY'){
      const d=Math.abs(finite(r.delta_1h_pct_points)??0);add(45+55*Math.min(1,d/0.05));
    }else if(domain.includes('VOLUME_ACCELERATION')){
      const ratio=finite(r.acceleration_ratio),p=finite(r.percentile??r.self_percentile);
      add(Math.max(p!=null?p*100:0,ratio!=null?45+55*Math.min(1,Math.max(0,ratio-1)/4):60));
    }else if(domain.includes('ORDERFLOW')){
      const delta=Math.abs(finite(r.delta)??0),cvd=Math.abs(finite(r.cvd_change)??0);add(delta||cvd?70:60);
    }else if(domain.includes('LIQUIDATION')){
      const burst=Math.abs(finite(r.burst_velocity)??0);add(55+45*Math.min(1,burst));
    }else if(domain==='EXECUTION_BOOK_SUPPORT'){
      const im=Math.abs(finite(r.imbalance)??0);add(50+50*Math.min(1,im/0.5));
    }else add(58);
  }
  const earlyBase=clamp(early?.early_detection_quality_0_100)??50;
  const deep=dir==='SHORT'?finite(shadow?.dc_short):dir==='LONG'?finite(shadow?.dc_long):null;
  const dq=upper(shadow?.dq_status); const dataQ=dq==='CLOSED'?100:dq==='PARTIAL'?72:dq==='INSUFFICIENT'?30:55;
  const ev=parse(opportunity?.event_json,{})||{}; const cls=ev.early_anomaly_classification||{};
  const candleScores=['accumulation','distribution','two_sided_transfer','liquidation_futures_noise']
    .map(k=>finite(cls?.[k]?.evidence_score)).filter(v=>v!=null);
  const candle=candleScores.length?Math.max(...candleScores):null;
  const evidence=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:earlyBase;
  const composite=0.20*earlyBase+0.30*evidence+0.35*(deep??earlyBase)+0.10*dataQ+0.05*(candle??50);
  return Math.round(Math.max(0,Math.min(100,composite)));
}
`;
  let out=txt.replace("function scoreLines({final,shadow,early,status}={}){",helper+"\nfunction scoreLines({final,shadow,early,feature,opportunity,status}={}){");
  out=out.replace("const interest=fmtScore(early?.early_detection_quality_0_100);",
                  "const interest=fmtScore(evidenceStrengthScore({feature,shadow,early,opportunity,direction:dir}));");
  out=out.replace("...scoreLines({final,shadow,early,status})",
                  "...scoreLines({final,shadow,early,feature,opportunity:opp,status})");
  return out;
});

fs.writeFileSync(path.join(runtime,'early-surfacing-v7-overlay-proof.json'),JSON.stringify(proof,null,2));
console.log('EARLY_SURFACING_V7_OVERLAY_APPLIED',JSON.stringify(proof));
