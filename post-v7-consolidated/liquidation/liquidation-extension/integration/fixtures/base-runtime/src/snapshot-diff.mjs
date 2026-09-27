export const SNAPSHOT_DIFF_VERSION='snapshot-diff-v1-20260925';

const arr=v=>Array.isArray(v)?v:[];
const text=v=>v===null||v===undefined?'':String(v).trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const safeJson=(v,f=[])=>{try{return typeof v==='string'?JSON.parse(v):(v??f);}catch{return f;}};
const iso=v=>{const n=finite(v);return n!==null&&n>0?new Date(n).toISOString():null;};

function closedFacts(rows){
  return arr(rows).filter(r=>String(r?.status||'').toUpperCase()==='CLOSED'&&r?.source_compatible!==false);
}
function keyOf(r){
  return [text(r?.metric).toLowerCase(),text(r?.source),text(r?.venue),text(r?.unit)].join('|');
}
function friendlyMetric(metric){
  const m=text(metric).toLowerCase();
  if(/funding/.test(m))return'финансирование';
  if(/open_interest|(^|_)oi(_|$)|oi_change/.test(m))return'открытый интерес';
  if(/rs_vs_btc/.test(m))return'сила к BTC';
  if(/rs_vs_eth/.test(m))return'сила к ETH';
  if(/spot/.test(m))return'спотовые данные';
  if(/liquid/.test(m))return'ликвидации';
  if(/execution_gate/.test(m))return'доступность исполнения HTX';
  return'рыночный показатель';
}
function fmt(v){
  const n=finite(v);if(n===null)return'нет данных';
  const a=Math.abs(n);
  if(a>=1000000)return`${Number((n/1000000).toFixed(2))} млн`;
  if(a>=1000)return`${Number((n/1000).toFixed(2))} тыс.`;
  return String(Number(n.toPrecision(6)));
}
function currentPayload(publicEvidence,observedTs){
  return{
    observed_ts:finite(publicEvidence?.observed_ts)??finite(observedTs),
    dq_status:text(publicEvidence?.dq_status||publicEvidence?.data_quality?.status)||null,
    evidence:arr(publicEvidence?.evidence),
    conflicts:arr(publicEvidence?.conflicts),
  };
}
function previousPayload(previousContext){
  const row=previousContext?.row;
  if(previousContext?.status!=='CLOSED'||!row)return null;
  return{
    observed_ts:finite(row.observed_ts),
    dq_status:text(row.dq_status)||null,
    evidence:arr(safeJson(row.evidence_compact_json,[])),
    conflicts:arr(safeJson(row.conflicts_json,[])),
  };
}

export async function loadPreviousEvidenceSnapshot({db,contract_code,before_ts}={}){
  const contract=text(contract_code).toUpperCase(),ts=finite(before_ts);
  if(!db?.prepare)return{version:SNAPSHOT_DIFF_VERSION,status:'SOURCE_UNSUPPORTED',reason:'DATA_DB_NOT_CONFIGURED',row:null,d1_reads:0,d1_writes:0};
  if(!contract||ts===null)return{version:SNAPSHOT_DIFF_VERSION,status:'NOT_CLOSED',reason:'CONTRACT_OR_TIMESTAMP_MISSING',row:null,d1_reads:0,d1_writes:0};
  try{
    const row=await db.prepare(`
      SELECT contract_code,observed_ts,dq_status,evidence_compact_json,conflicts_json
      FROM full_evidence_shadow_log
      WHERE contract_code=?1 AND observed_ts<?2
      ORDER BY observed_ts DESC
      LIMIT 1
    `).bind(contract,ts).first();
    return{
      version:SNAPSHOT_DIFF_VERSION,
      status:row?'CLOSED':'NO_PREVIOUS_SNAPSHOT',
      reason:row?null:'NO_PREVIOUS_SNAPSHOT',
      row:row||null,
      d1_reads:1,d1_writes:0,
    };
  }catch(error){
    return{version:SNAPSHOT_DIFF_VERSION,status:'READ_FAILED',reason:String(error?.message||error).slice(0,240),row:null,d1_reads:1,d1_writes:0};
  }
}

export function buildSnapshotChanges({previous_snapshot_context,current_public_evidence,observed_ts,max_lines=5}={}){
  const prev=previousPayload(previous_snapshot_context);
  const cur=currentPayload(current_public_evidence,observed_ts);
  const prevIso=iso(prev?.observed_ts),curIso=iso(cur?.observed_ts);
  if(!prev||!prevIso||!curIso)return{
    version:SNAPSHOT_DIFF_VERSION,
    status:previous_snapshot_context?.status==='NO_PREVIOUS_SNAPSHOT'?'NO_PREVIOUS_SNAPSHOT':'NOT_CLOSED',
    previous_observed_ts:prev?.observed_ts??null,current_observed_ts:cur?.observed_ts??null,
    previous_time_utc:prevIso,current_time_utc:curIso,lines:[],changed_fact_count:0,
    comparison_is_probability:false,decision_effect:false,
  };

  const prefix=`С ${prevIso} по ${curIso}`;
  const lines=[];
  if(prev.dq_status!==cur.dq_status&&cur.dq_status){
    lines.push(`${prefix}: качество данных изменилось с ${prev.dq_status||'не определено'} на ${cur.dq_status}.`);
  }
  if(prev.conflicts.length!==cur.conflicts.length){
    lines.push(`${prefix}: число подтверждённых межбиржевых расхождений изменилось с ${prev.conflicts.length} на ${cur.conflicts.length}.`);
  }

  const pRows=closedFacts(prev.evidence),cRows=closedFacts(cur.evidence);
  const pMap=new Map(pRows.map(r=>[keyOf(r),r])),cMap=new Map(cRows.map(r=>[keyOf(r),r]));
  const added=[...cMap.keys()].filter(k=>!pMap.has(k));
  const removed=[...pMap.keys()].filter(k=>!cMap.has(k));
  if(added.length||removed.length){
    lines.push(`${prefix}: состав свежих подтверждённых фактов изменился — добавлено ${added.length}, перестало быть текущими ${removed.length}.`);
  }

  const numeric=[];
  for(const [key,c] of cMap){
    const p=pMap.get(key);if(!p)continue;
    const pv=finite(p?.value),cv=finite(c?.value);
    if(pv===null||cv===null||Object.is(pv,cv))continue;
    const scale=Math.max(Math.abs(pv),Math.abs(cv),1e-12);
    numeric.push({p,c,pv,cv,relative:Math.abs(cv-pv)/scale});
  }
  numeric.sort((a,b)=>b.relative-a.relative);
  for(const x of numeric.slice(0,3)){
    const metric=friendlyMetric(x.c?.metric),source=text(x.c?.source||x.c?.venue)||'источник';
    const unit=text(x.c?.unit);
    lines.push(`${prefix}: ${metric} (${source}) изменился с ${fmt(x.pv)}${unit?` ${unit}`:''} до ${fmt(x.cv)}${unit?` ${unit}`:''}.`);
  }
  if(!lines.length){
    lines.push(`${prefix}: подтверждённые факты текущего и предыдущего снимков не дали заметного структурного различия; обновилось только время наблюдения.`);
  }

  return{
    version:SNAPSHOT_DIFF_VERSION,status:'CLOSED',
    previous_observed_ts:prev.observed_ts,current_observed_ts:cur.observed_ts,
    previous_time_utc:prevIso,current_time_utc:curIso,
    lines:lines.slice(0,Math.max(1,Math.min(8,Number(max_lines)||5))),
    changed_fact_count:added.length+removed.length+numeric.length+(prev.dq_status!==cur.dq_status?1:0)+(prev.conflicts.length!==cur.conflicts.length?1:0),
    previous_closed_fact_count:pRows.length,current_closed_fact_count:cRows.length,
    source_set_changed:Boolean(added.length||removed.length),
    comparison_is_probability:false,decision_effect:false,
  };
}

export default{SNAPSHOT_DIFF_VERSION,loadPreviousEvidenceSnapshot,buildSnapshotChanges};
