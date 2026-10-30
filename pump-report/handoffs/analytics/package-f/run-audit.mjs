import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditCohortSample,auditPairedAnalyses} from '../../../analytics/cohort-audit.mjs';

const base=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const sources={};
async function source(name){const raw=await readFile(new URL(name,base));sources[name]={bytes:raw.length,sha256:sha(raw)};return JSON.parse(raw);}
const b=await source('package-b/examples.json'),a=await source('examples.json'),d=await source('package-d/examples.json');
const aManifest=await source('qualification.json'),bManifest=await source('package-b/qualification.json'),dManifest=await source('package-d/qualification.json');
const bindings=[];
for(const [manifest,name,path] of [[aManifest,'examples.json','pump-report/handoffs/analytics/examples.json'],[bManifest,'package-b/examples.json','pump-report/handoffs/analytics/package-b/examples.json'],[dManifest,'package-d/examples.json','pump-report/handoffs/analytics/package-d/examples.json']]){
  const original=manifest.files.find(f=>f.path===path),actual=sources[name];
  if(!original||original.sha256!==actual.sha256||original.bytes!==actual.bytes)throw Error('SAVED_EXAMPLE_MANIFEST_MISMATCH:'+name);
  bindings.push({source:name,manifest_sha256_matches:true,bytes_match:true});
}
// Read saved examples, never regenerate accepted A/B/C/D analyses or tests.
// The split is explicitly post hoc: it is a diagnostic and cannot be promoted
// to a prospective holdout by pretending its declaration existed earlier.
const sample=auditCohortSample(b.records,{as_of_ts:b.options.as_of_ts,split_plan:{split_ts:b.options.as_of_ts-7200000,declared_ts:b.options.as_of_ts,plan_ref:'POST_HOC_F_DIAGNOSTIC_NOT_PROSPECTIVE_RESEARCH'}});
const pairs=auditPairedAnalyses([
  {pair_id:'A_RETAINED_MAP_PAIR',contrast:'MAP',evidence_class:'ARTIFICIAL',baseline:{...a.without_map,implementation_sha256:sources['qualification.json'].sha256},enriched:{...a.with_map,implementation_sha256:sources['qualification.json'].sha256}},
  {pair_id:'D_RETAINED_MAP_PAIR_RAW_INPUT_NOT_SAVED',contrast:'MAP',evidence_class:'ARTIFICIAL',baseline:{analysis:d.no_map,implementation_sha256:sources['package-d/qualification.json'].sha256},enriched:{analysis:d.with_map,implementation_sha256:sources['package-d/qualification.json'].sha256}}
],{as_of_ts:b.options.as_of_ts});
const result={scope:'BOUNDED_LOCAL_ARTIFICIAL_RETAINED_EXAMPLES_ONLY',sources,source_manifest_bindings:bindings,sample,paired_comparisons:pairs,
  missing_blocking_inputs:['Prospective immutable original analyses with saved feature clocks and implementation manifest','Receipt/possible-send/terminal UNSENT anchors from ROOT runtime','A genuinely predeclared time split and training manifest','Precommitted forecasts for their own mode/map/rules/profile cohort','Independent observed episodes over later times and qualified comparable block variants'],
  probability_pct:null,map_benefit_pct:null,native_IO:0};
await writeFile(new URL('./audit-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({sample_records:sample.input_records,declared_waves:sample.declared_independent_waves,assets:sample.assets,distinct_t0:sample.distinct_origin_times,cohorts:sample.cohorts.length,partitions:sample.partitions,quality_reason_wave_counts:sample.quality_reason_wave_counts,
 pairs:pairs.pairs,qualified_pairs:pairs.qualified_pairs,paired_independent_waves:pairs.declared_independent_waves,probability_pct:null,map_benefit_pct:null})+'\n');
