#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RemoteD1Database } from '../runner/report2-d1-adapter.mjs';

const __filename=fileURLToPath(import.meta.url);
const ROOT=path.dirname(__filename);
const MIG=path.join(ROOT,'20260917_tz101_entry_area_calibration_shadow.sql');
const MIG_SHA='d871082daa19e17894475e63e3e6c769cf3332b7fb0950c1b7edd6aa4d029bbd';
const BASE_TABLES=['scan_runs','v3_early_outcome_journal','final_decision_integration_shadow','stage392_multi_wave_receipt_journal'];
const OBJECTS=['tz101_entry_area_calibration_signal','idx_tz101_entry_area_signal_contract_ts','idx_tz101_entry_area_signal_campaign','tz101_entry_area_calibration_outcome','idx_tz101_entry_area_outcome_ts','tz101_entry_area_calibration_state'];
const FORBIDDEN=['DROP TABLE','DROP COLUMN','DELETE FROM','REPLACE INTO','VACUUM','PRAGMA WRITABLE_SCHEMA','UPDATE ','INSERT INTO '];

function sha256File(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function splitSql(text){
  const cleaned=text.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('--')).join('\n');
  const out=[]; let cur=''; let quote=null;
  for(let i=0;i<cleaned.length;i++){
    const ch=cleaned[i]; cur+=ch;
    if(quote){
      if(ch===quote){
        if(cleaned[i+1]===quote){cur+=cleaned[++i]; continue;}
        quote=null;
      }
      continue;
    }
    if(ch==="'" || ch==='"'){quote=ch; continue;}
    if(ch===';'){
      const s=cur.trim(); if(s) out.push(s); cur='';
    }
  }
  if(cur.trim()) throw new Error('MIGRATION_INCOMPLETE');
  if(out.length!==6) throw new Error(`MIGRATION_STATEMENT_COUNT:${out.length}`);
  out.forEach((s,i)=>{
    const flat=s.replace(/\s+/g,' ').trim().toUpperCase();
    if(!(flat.startsWith('CREATE TABLE ')||flat.startsWith('CREATE INDEX '))) throw new Error(`NON_ADDITIVE_DDL:${i}`);
    for(const bad of FORBIDDEN) if(flat.includes(bad)) throw new Error(`FORBIDDEN_TOKEN:${bad}:${i}`);
  });
  return out;
}
function verifyMigration(){
  if(!fs.existsSync(MIG)) throw new Error('MIGRATION_MISSING');
  if(sha256File(MIG)!==MIG_SHA) throw new Error('MIGRATION_SHA_MISMATCH');
  const text=fs.readFileSync(MIG,'utf8');
  const parts=splitSql(text);
  for(const marker of ["CHECK(direction IN ('LONG','SHORT'))",'CHECK(calibration_only=1)','CHECK(live_promotion_allowed=0)','CHECK(automatic_rule_promotion=0)','CHECK(validated_out_of_sample=0)']){
    if(!text.includes(marker)) throw new Error('SAFETY_CONSTRAINT_MISSING:'+marker);
  }
  return parts;
}
function rows(result){return Array.isArray(result?.results)?result.results:[];}
async function all(db,sql){return rows(await db.prepare(sql).all());}
async function names(db,names){
  const quoted=names.map(x=>`'${x.replaceAll("'","''")}'`).join(',');
  return new Set((await all(db,`SELECT name FROM sqlite_master WHERE name IN (${quoted})`)).map(r=>String(r.name)).filter(Boolean));
}
async function status(db){
  const have=await names(db,OBJECTS); const n=OBJECTS.filter(x=>have.has(x)).length;
  if(n===0) return ['PENDING',n];
  if(n===OBJECTS.length) return ['APPLIED',n];
  return ['PARTIAL_BLOCKED',n];
}
async function main(){
  const parts=verifyMigration();
  const mode=process.argv[2]||'';
  if(!['--check','--apply'].includes(mode)) throw new Error('MODE_REQUIRED');
  const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:45000});
  const have=await names(db,BASE_TABLES); const missing=BASE_TABLES.filter(x=>!have.has(x));
  if(missing.length) throw new Error('BASE_SCHEMA_MISSING:'+missing.join(','));
  const before=await status(db);
  console.log('R8_20_D1_BEFORE='+JSON.stringify({status:before[0],objects:before[1]}));
  if(before[0]==='PARTIAL_BLOCKED') throw new Error('PARTIAL_SCHEMA_BLOCKED');
  if(mode==='--check'){
    console.log('R8_20_D1_MIGRATION_CHECK=PASS');
    console.log('REMOTE_D1_CHANGED=NO');
    console.log('D1_USAGE='+JSON.stringify(db.usageSnapshot()));
    return;
  }
  let changed=false;
  if(before[0]==='PENDING'){
    await db.batch(parts.map(s=>db.prepare(s)));
    changed=true;
  }
  const after=await status(db);
  if(after[0]!=='APPLIED') throw new Error('MIGRATION_READBACK_FAIL:'+JSON.stringify(after));
  const tableRows=await all(db,"SELECT name,sql FROM sqlite_master WHERE type='table' AND name LIKE 'tz101_entry_area_calibration_%'");
  const by=new Map(tableRows.map(r=>[String(r.name),String(r.sql||'')]));
  for(const t of ['tz101_entry_area_calibration_signal','tz101_entry_area_calibration_outcome','tz101_entry_area_calibration_state']) if(!by.has(t)) throw new Error('TABLE_READBACK_MISSING:'+t);
  const safety=[...by.values()].join('\n');
  for(const marker of ['calibration_only','live_promotion_allowed','automatic_rule_promotion']) if(!safety.includes(marker)) throw new Error('SAFETY_READBACK_MISSING:'+marker);
  const usage=db.usageSnapshot();
  if(Number(usage.unknown_ops||0)!==0) throw new Error('UNKNOWN_D1_OPS');
  console.log('R8_20_D1_AFTER='+JSON.stringify({status:after[0],objects:after[1]}));
  console.log('D1_USAGE='+JSON.stringify(usage));
  console.log('REMOTE_D1_CHANGED='+(changed?'YES_ADDITIVE_ONLY':'NO_ALREADY_APPLIED'));
  console.log('R8_20_D1_MIGRATION_RESULT=PASS');
}

main().catch(err=>{
  console.error('R8_20_D1_MIGRATION_FAIL='+err.name+':'+String(err.message||err));
  console.error('PRODUCTION_MAIN_CHANGED=NO');
  process.exit(1);
});
