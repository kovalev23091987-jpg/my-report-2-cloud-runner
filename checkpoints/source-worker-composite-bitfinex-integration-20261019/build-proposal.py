"""Prepare exact patch text only; shared production files are never edited."""
from pathlib import Path
import json,subprocess,hashlib,difflib
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parents[1]
scope=json.loads((ROOT/'scope.json').read_text());base=scope['fixed_working_base']
def original(path):return subprocess.check_output(['git','show',base+':'+path],cwd=REPO).decode()
def replace(text,old,new):
 assert text.count(old)==1,(old[:80],text.count(old))
 return text.replace(old,new)
changes={}
for path,dependency in scope['frozen_dependencies'].items():changes[path]=('',(REPO/dependency['copy']).read_text())
changes['current-generation/files/src/bitfinex-n10-memory-context.mjs']=('',(ROOT/'proposed-files/bitfinex-n10-memory-context.mjs').read_text())
path='current-generation/files/src/bitfinex-native-flow-collector.mjs';before=original(path)
after="import {attachBitfinexN10Memory} from './bitfinex-n10-memory-context.mjs';\n"+before
old="evidence.push(...sample.evidence.filter(e=>validateBitfinexN12BoundedTradeSample(e,now)));return{...root,status:c.status"
new="evidence.push(...sample.evidence.filter(e=>validateBitfinexN12BoundedTradeSample(e,now)));const {cache_observed_ts,cache_expires_ts,cache_status,network_calls,...payload}=old;attachBitfinexN10Memory({contract,component:c,payload,observed_ts:cache_observed_ts,expires_ts:cache_expires_ts,now:clock()});return{...root,status:c.status"
after=replace(after,old,new)
old="  components.push({...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256),n12_bounded_sample_status:sample.status});"
new="  const returned={...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256),n12_bounded_sample_status:sample.status};components.push(returned);"
after=replace(after,old,new)
old="  const payload={version:VERSION,observed_ts:ts,catalog,candles,trades,trade_receipt:receipts.at(-1)};"
after=replace(after,old,old+"\n  attachBitfinexN10Memory({contract,component:returned,payload,observed_ts:ts,expires_ts:end+300000,now:clock()});")
changes[path]=(before,after)
path='current-generation/files/src/htx-technical-structure.mjs';before=original(path)
after="import {deriveBitfinexN10MemoryEvidence} from './bitfinex-n10-memory-context.mjs';\n"+before
after=replace(after,'const groups=new Map(),memory=[];','const groups=new Map(),memory=[],bitfinexMemory=[];')
old="  if(c?.venue==='KRAKEN'){memory.push(c);continue;}"
after=replace(after,old,old+"\n  if(c?.venue==='BITFINEX'){bitfinexMemory.push(c);continue;}")
old=' native_unclosed||=nativeSourceUsageUnclosed(db);'
new=" for(const component of bitfinexMemory){\n  const facts=deriveBitfinexN10MemoryEvidence({contract,component,htx_spot_kline,htx_window:h,now});\n  evidence.push(...facts);receipts.push({venue:'BITFINEX',status:facts.length?'CLOSED_WITHIN_BITFINEX_USD_PRICE_PATH':'NO_USEFUL_FRESH_CLOSED_USD_PRICE_PATH',provider_http:0,cache_reads:0,producer_receipt_not_native_cache_ACK:true});\n }\n"+old
after=replace(after,old,new);changes[path]=(before,after)
path='current-generation/files/src/block-result-context.mjs';before=original(path)
after="import {n12CompositeFirstKnown} from './n12-composite-first-known.mjs';\nimport {verifyBitfinexN10MemoryEvidence} from './bitfinex-n10-memory-context.mjs';\n"+before
old=" if(row.block_id==='N10'&&row.metric_family==='CLOSED_15M_KRAKEN_REUSED_PRICE_PATH_CONTEXT'){"
new=""" if(row.block_id==='N10'&&row.metric_family==='CLOSED_15M_BITFINEX_USD_PRICE_CONTEXT'){
  if(!verifyBitfinexN10MemoryEvidence(row,now))return null;
  const p=row.price_path,price=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:12}).format(v);
  return{source:'Bitfinex / исходные спотовые свечи USD',label:'Цена за 15 минут на Bitfinex',value:`15 закрытых активных минут: ${price(p.path_open)} → ${price(p.path_close)} USD (${p.change_pct>0?'+':''}${fmt(p.change_pct)}%); диапазон ${price(p.path_low)}–${price(p.path_high)} USD. Цены в долларах США, без пересчёта и сравнения с HTX. Баллы, цели и вход этим не меняются`};
 }
"""+old
after=replace(after,old,new)
after=replace(after,"...(origins?{component_origins:origins,physical_root_keys:","...(origins?{component_origins:origins,composite_first_known_ts:n12CompositeFirstKnown({contract,evidence_ids:[row.evidence_id,...related],component_origins:origins,decision_ts:now}),physical_root_keys:")
after=replace(after,"...(row.component_origins?{component_origins:row.component_origins}:{}),source_ts:row.source_ts","...(row.component_origins?{component_origins:row.component_origins,composite_first_known_ts:n12CompositeFirstKnown({contract,evidence_ids:row.evidence_ids||[row.evidence_id],component_origins:row.component_origins,decision_ts:now})}:{}),source_ts:row.source_ts")
after=replace(after,"...(row.component_origins?{component_origins:row.component_origins,physical_root_keys:row.physical_root_keys}:{}),source_ts:row.source_ts","...(row.component_origins?{component_origins:row.component_origins,physical_root_keys:row.physical_root_keys,composite_first_known_ts:n12CompositeFirstKnown({contract,evidence_ids:row.evidence_ids||[row.evidence_id],component_origins:row.component_origins,decision_ts:now})}:{}),source_ts:row.source_ts")
changes[path]=(before,after)
path='current-generation/files/src/telegram-plain-facts.mjs';before=original(path)
after="import {verifyBitfinexN10MemoryEvidence} from './bitfinex-n10-memory-context.mjs';\n"+before
old='export function isApprovedTelegramContextFact(f,c){'
after=replace(after,old,old+"\n if(f?.block_id==='N10'&&f.field==='CLOSED_15M_BITFINEX_USD_PRICE_CONTEXT'&&f.label==='Цена за 15 минут на Bitfinex'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return verifyBitfinexN10MemoryEvidence(row,c.observed_ts);}")
changes[path]=(before,after)
path='current-generation/apply-runtime-overlay.mjs';before=original(path)
after=replace(before,"'src/bitfinex-native-flow-collector.mjs',","'src/bitfinex-native-flow-collector.mjs','src/bitfinex-n10-price-path.mjs','src/bitfinex-n10-memory-context.mjs','src/n12-composite-first-known.mjs',")
changes[path]=(before,after)
patch=''
for path,(before,after) in changes.items():patch+=''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='a/'+path if before else '/dev/null',tofile='b/'+path))
patch=patch.replace('\n \n','\n\n')
(ROOT/'shared-integration.proposed.patch').write_text(patch)
inventory={path:{'before_sha256':hashlib.sha256(before.encode()).hexdigest() if before else None,'after_sha256':hashlib.sha256(after.encode()).hexdigest(),'before_bytes':len(before.encode()),'after_bytes':len(after.encode())} for path,(before,after) in changes.items()}
(ROOT/'proposal-file-hashes.json').write_text(json.dumps({'base':base,'files':inventory,'production_changed':False},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'proposal_files':len(changes),'base':base,'patch_sha256':hashlib.sha256(patch.encode()).hexdigest(),'tests_executed':0}))
