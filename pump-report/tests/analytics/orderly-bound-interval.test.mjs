import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {factUsable} from '../../contracts/index.mjs';

// Test the exact proposed bytes in memory; never apply the ROOT patch/import
// the kernel, SOURCE transport, runtime, budget, store or delivery.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),folder=resolve(root,'pump-report/handoffs/analytics/package-ai');
const hash=s=>createHash('sha256').update(s).digest('hex'),clone=structuredClone,proof=[];
const patch=await readFile(resolve(folder,'proposal.patch'),'utf8'),freeze=JSON.parse(await readFile(resolve(folder,'proposal-freeze.json'),'utf8'));
assert.equal(hash(patch),freeze.patch_sha256);
const lines=patch.split('\n');if(lines.at(-1)==='')lines.pop();const proposed=new Map();let i=0;
while(i<lines.length){
  assert.ok(lines[i].startsWith('--- '));const old=lines[i++].slice(4),name=lines[i++].slice(6),baseline=old==='/dev/null'?'':await readFile(resolve(root,name),'utf8');
  const meta=freeze.proposed_files.find(f=>f.path===name);assert.ok(meta);if(meta.base_sha256)assert.equal(hash(baseline),meta.base_sha256);
  const original=baseline?baseline.split('\n'):[];if(original.at(-1)==='')original.pop();let pos=0,out=[];
  while(i<lines.length&&!lines[i].startsWith('--- ')){
    const header=lines[i++].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);assert.ok(header);const start=Math.max(0,Number(header[1])-1);out.push(...original.slice(pos,start));pos=start;
    while(i<lines.length&&!lines[i].startsWith('@@ ')&&!lines[i].startsWith('--- ')){
      const op=lines[i][0],s=lines[i++].slice(1);if(op===' '||op==='-')assert.equal(original[pos++],s);if(op===' '||op==='+')out.push(s);
    }
  }
  out.push(...original.slice(pos));const source=out.join('\n')+'\n';assert.equal(hash(source),meta.proposed_sha256);proposed.set(name,source);
}
const absolute=(s,name)=>s.replace(/from\s*'([^']+)'/g,(all,p)=>p.startsWith('.')?"from '"+pathToFileURL(resolve(dirname(resolve(root,name)),p)).href+"'":all);
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const clockName='pump-report/contracts/zone-clock.mjs',clockURL=data(absolute(proposed.get(clockName),clockName));
const {assessZoneClock,zoneClockText,ORDERLY_CLOCK_PROOF}=await import(clockURL);
const zonesName='pump-report/analytics/zones.mjs',zonesSource=absolute(proposed.get(zonesName),zonesName).replace(pathToFileURL(resolve(root,clockName)).href,clockURL);
const {selectZones}=await import(data(zonesSource));
const T=1800200000000,ids=['b','c','d'].map(x=>'ORDERLY:POSITION:SHA256:'+x.repeat(64));
const instrument={instrument_id:'ARTIFICIAL:AI:币-USDT',asset_id:'ARTIFICIAL:AI:币',identity_evidence_ref:'ARTIFICIAL_AI_IDENTITY',canonical_cross_venue_identity_qualified:true};
const binding={evidence_ref:'ARTIFICIAL_AI_SAME_ASSET',status:'VERIFIED_SAME_UNDERLYING',source_venue:'ORDERLY',source_market_id:'ARTIFICIAL_ORDERLY_MARKET',source_symbol:'ARTIFICIAL_币_USDC',
  bingx_instrument_id:instrument.instrument_id,bingx_asset_id:instrument.asset_id,bingx_identity_evidence_ref:instrument.identity_evidence_ref,price_quote:'USDC',price_quote_evidence_ref:'ARTIFICIAL_AI_NATIVE_USDC',
  position_semantics:{evidence_ref:'ARTIFICIAL_AI_SIDE_AND_ESTIMATE',side_field:'side',long_value:'LONG',short_value:'SHORT',liquidation_price_field:'est_liq_price',liquidation_price_kind:'ESTIMATED_CURRENT_OPEN_POSITION_LIQUIDATION_PRICE'},
  position_identity:{evidence_ref:'ARTIFICIAL_AI_STABLE_ID_NOT_VENDOR_SCHEMA',kind:'SOURCE_STABLE_POSITION_ID',scope:'PLATFORM_UNIQUE_CURRENT_POSITION',field:'artificial_position_id'},
  position_value:{evidence_ref:'ARTIFICIAL_AI_NOTIONAL',field:'notional',unit:'USDC'},
  price_mapping:{evidence_ref:'ARTIFICIAL_AI_MAPPING',kind:'EXPLICIT_QUOTE_RATE_AND_VENUE_PRICE_BASIS',quote_conversion_evidence_ref:'ARTIFICIAL_AI_QUOTE_RATE',price_basis_evidence_ref:'ARTIFICIAL_AI_PRICE_BASIS',
    from_market_id:'ARTIFICIAL_ORDERLY_MARKET',to_instrument_id:instrument.instrument_id,from_quote:'USDC',to_quote:'USDT',from_price_basis:'ORDERLY_EST_LIQ_PRICE',to_price_basis:'BINGX_NATIVE_PRICE',
    quote_rate_to_usdt:1.01,venue_price_basis_multiplier:1.02,event_ts:T,expires_ts:T+30000}};
function point({ts=T,id=ids[0],nativePrice=100,notional=10,ttl=120000}={}){
  const b=clone(binding);b.price_mapping.event_ts=ts;b.price_mapping.expires_ts=ts+30000;const price=nativePrice*1.01*1.02,money=notional*1.01;
  return {zone_id:'ARTIFICIAL_AI_ZONE_'+id.at(-1),usable:true,asset_id:instrument.asset_id,source:'ORDERLY_PLATFORM_POSITIONS',primary_provider:'ORDERLY',venue:'ORDERLY',market_id:b.source_market_id,native_symbol:b.source_symbol,
    basis_type:'OBSERVED_POSITION',price_currency:'USDT',lower:price,upper:price,magnitude_value:money,magnitude_unit:'USDT',liquidated_side:'LONG',margin_mode:'CROSS',
    native_est_liq_price:nativePrice,native_mark_price:120,native_price_quote:'USDC',native_reported_position_notional:notional,native_notional_unit:'USDC',notional_basis:'SOURCE_REPORTED_OPEN_POSITION_NOTIONAL_NOT_VALUE_AT_LIQUIDATION',
    projected_bingx_liquidation_price_usdt:price,projected_position_notional_usdt:money,quote_rate_to_usdt:1.01,venue_price_basis_multiplier:1.02,price_mapping_evidence_ref:b.price_mapping.evidence_ref,
    position_id:id,position_ids:[id],overlap_group:id,evidence_ref:'ARTIFICIAL_AI_RECEIPT_'+ts,event_ts:null,generation_event_ts:null,expires_ts:null,received_ts:ts,source_response_ts:ts,
    source_asof_bound:{earliest_ts:ts-5000,latest_ts:ts,documented_max_age_ms:5000,basis:'DOCUMENTED_MAX_SNAPSHOT_AGE_AT_SERVER_RESPONSE',evidence_ref:ORDERLY_CLOCK_PROOF.evidence_ref},
    conservative_bound_expires_ts:Math.min(ts-5000+ttl,ts+30000),orderly_qualification:{schema:'ORDERLY_BOUNDED_ZONE_PREREQUISITES_V1',raw_position_receipt_ref:'ARTIFICIAL_AI_RECEIPT_'+ts,source_clock_evidence_sha256:ORDERLY_CLOCK_PROOF.sha256,binding:b}};
}
const assess=(z,at=T+1000,profile=START_PROFILE,i=instrument)=>assessZoneClock(z,{instrument:i,reference:200,at,ttl:profile.freshness_ms.observed_positions,price_ttl_ms:profile.freshness_ms.price});
const select=(zones,at=T+1000,profile=START_PROFILE)=>selectZones({status:'PARTIAL',zones,checked_sources:['ARTIFICIAL_AI_ORDERLY']},instrument,200,5,at,profile);

test('AI01 proposed Orderly interval conservatively consumes earliest bound with full explicit prerequisites, null event and no mandatory-clock weakening',()=>{
  const z=point(),frozen=clone(z),c=assess(z);assert.equal(c.usable,true);assert.equal(c.kind,'BOUNDED_SOURCE_ASOF');assert.equal(c.event_ts,null);assert.equal(c.earliest_ts,T-5000);assert.equal(c.latest_ts,T);assert.equal(c.conservative_expires_ts,T+30000);assert.deepEqual(z,frozen);
  const selected=select([z]),level=selected.zones_down[0];assert.equal(selected.qualified_zone_count,1);assert.equal(level.event_ts,null);assert.equal(level.generation_event_ts,null);assert.equal(level.expires_ts,null);assert.equal(level.conservative_bound_expires_ts,T+30000);assert.equal(level.components[0].source_asof_bound.earliest_ts,T-5000);
  assert.match(zoneClockText(level,T+1000),/время формирования неизвестно; возраст от 1 до 6 с/);assert.match(zoneClockText(level,T+1000,true),/возраст ≤6 с; точное время неизвестно/);
  const strict={...START_PROFILE,freshness_ms:{...START_PROFILE.freshness_ms,observed_positions:5000}},edge=point({ttl:5000});assert.equal(assess(edge,T,strict).usable,true);assert.equal(assess(edge,T+1,strict).usable,false);assert.equal(select([edge],T+1,strict).map_mode,'WITHOUT_MAP');
  const bad=[['invented_event',x=>x.event_ts=T],['invented_generation',x=>x.generation_event_ts=T],['invented_expiry',x=>x.expires_ts=T+30000],['lower_alias',x=>x.source_asof_bound.earliest_ts=T-4999],['upper_alias',x=>x.source_asof_bound.latest_ts=T-1],['wrong_max_age',x=>x.source_asof_bound.documented_max_age_ms=5001],['missing_primary',x=>x.source_asof_bound.evidence_ref=null],['missing_prerequisites',x=>delete x.orderly_qualification],['wrong_primary_sha',x=>x.orderly_qualification.source_clock_evidence_sha256='0'.repeat(64)],['fake_id_field',x=>x.orderly_qualification.binding.position_identity.field='opened_at'],['wrong_asset',x=>x.orderly_qualification.binding.bingx_asset_id='ARTIFICIAL_OTHER'],['wrong_market',x=>x.orderly_qualification.binding.source_market_id='ARTIFICIAL_OTHER'],['renamed_quote',x=>x.native_price_quote='USDT'],['missing_conversion',x=>x.orderly_qualification.binding.price_mapping.quote_rate_to_usdt=null],['missing_basis',x=>x.orderly_qualification.binding.price_mapping.price_basis_evidence_ref=null],['default_multiplier',x=>delete x.orderly_qualification.binding.price_mapping.venue_price_basis_multiplier],['liquidation_notional_fabrication',x=>x.magnitude_value=x.native_reported_position_notional*x.native_est_liq_price],['future_mapping',x=>x.orderly_qualification.binding.price_mapping.event_ts=T+2000],['future_receipt',x=>x.received_ts=T+2000],['future_response',x=>x.source_response_ts=T+2000],['invented_area',x=>x.upper+=1],['wrong_side',x=>x.liquidated_side='SHORT'],['other_provider',x=>x.primary_provider='ARTIFICIAL_OTHER']];
  for(const [name,mutate]of bad){const x=point();mutate(x);assert.equal(assess(x).usable,false,name);assert.equal(select([x]).map_mode,'WITHOUT_MAP',name);}
  assert.equal(assess(point(),T+1000,START_PROFILE,{...instrument,canonical_cross_venue_identity_qualified:false}).usable,false);
  const late=point();late.orderly_qualification.binding.price_mapping.expires_ts=T+500;assert.equal(assess(late).usable,false);const enlarged=point();enlarged.conservative_bound_expires_ts=T+30001;assert.equal(assess(enlarged).usable,false);
  const observation=point();observation.usable=false;delete observation.zone_id;delete observation.orderly_qualification;assert.equal(select([observation]).qualified_zone_count,0);
  const old=point({ts:T-1000});old.zone_id='ARTIFICIAL_AI_OLDER';const dedup=select([old,z]).zones_down[0];assert.equal(dedup.components.length,2);assert.equal(dedup.event_ts,null);assert.equal(dedup.clock_assessment.earliest_ts,T-6000);assert.equal(dedup.clock_assessment.latest_ts,T);assert.equal(dedup.conservative_bound_expires_ts,T+29000);assert.equal(dedup.magnitude_value,z.magnitude_value);assert.match(zoneClockText(dedup,T+1000),/от 1 до 7 с/);
  const other=point({id:ids[1],nativePrice:101,notional:15}),merged=select([z,other]);assert.equal(merged.qualified_zone_count,1);assert.equal(merged.zones_down[0].components.length,2);assert.equal(merged.zones_down[0].event_ts,null);assert.equal(merged.zones_down[0].magnitude_value,other.magnitude_value);assert.ok(merged.zones_down[0].limitations.includes('MERGED_MAGNITUDE_MAX_SINGLE_COMPONENT_NOT_SUMMED'));
  const otherTime=point({ts:T-1000,id:ids[2],nativePrice:101});assert.equal(select([z,otherTime]).qualified_zone_count,2);
  const exact=point();delete exact.source_asof_bound;delete exact.generation_event_ts;delete exact.orderly_qualification;exact.source='ARTIFICIAL_AI_EXACT';exact.primary_provider='ARTIFICIAL_AI_EXACT';exact.venue='BINGX';exact.basis_type='EXTERNAL_MODEL';exact.model_id='ARTIFICIAL_AI_MODEL';exact.model_version='ARTIFICIAL_AI_V1';exact.event_ts=T-1000;exact.expires_ts=T+20000;
  const retained=select([exact]).zones_down[0];assert.equal(retained.event_ts,T-1000);assert.equal(retained.expires_ts,T+20000);assert.equal(retained.clock_assessment.kind,'EXACT_SOURCE_EVENT');assert.match(zoneClockText(retained,T+1000),/^данные .* МСК \(2 с назад\)$/);
  assert.equal(factUsable({status:'USABLE',value:1,event_ts:null,received_ts:T,expires_ts:T+30000},T),false);assert.equal(factUsable({status:'USABLE',value:1,event_ts:T,received_ts:T,expires_ts:T+15000},T+15001),false);assert.equal(START_PROFILE.freshness_ms.price,30000);assert.equal(START_PROFILE.freshness_ms.orderbook,15000);assert.equal(START_PROFILE.freshness_ms.candles,90000);
  proof.push({case:'AI01',evidence:'ARTIFICIAL_ONLY_NOT_NATIVE',invalid_variants:bad.length,lower_bound_at_TTL_accepted_one_ms_later_rejected:true,full_prerequisites_required:true,event_generation_expiry_stay_null:true,conservative_mapping_expiry_preserved:true,dedup_and_merge_no_null_to_epoch_or_money_sum:true,exact_clock_neighbor_control_unchanged:true,mandatory_clocks_not_weakened:true,production_files_modified:0,source_web_HTTP_SQL_TG_deploy:0});
});
after(async()=>{await writeFile(resolve(folder,'new-qualification-case.json'),JSON.stringify({schema:'AI_NEW_SINGLE_AFFECTED_CASE_V1',cases:proof,old_tests_replayed:0,native_IO:0},null,2)+'\n');});
