import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const EXPECTED=Object.freeze({
  worker_before:'7a3c73770e516db9e7ef17ca3e582947769c0fa3f8cb2814e915ee0303695a83',
  worker_after:'1bf1012db1e1f7913d8dd132f7ad95bab7e2c914f2f5f9ece2eb313811a1dd12',
  publication_before:'2c78617a6d2d62086f64a96b2a862a342c467671de553d48cdb71a535fe1d300',
  publication_after:'0c64b51cc78b99ea5f71e86ae6210d6ad28f8ff85b669d9d39f418d3af1d3c73',
  scenario_before:'c26effff0a029fd877d1c79bee995c03985cc3fea9c05c2d43074d9b73496de4',
  scenario_after:'f8a340c879bc2e858b51bd78dc27e4bf4897ffc2c38fe7db304cd2649116230b',
  cost_before:'aa73f74aeeaf502729430fcf9fdf1e1bcfa57a1cd7a35c305a92b46e45a6f294',
  cost_after:'bb46da233429f46320e69e9ccefd1fb093fa27821dd0254ff44254a27b405ae5',
  input_runtime:'c1ce465a1cfebc2c00083fc02024c1c28660955682953aad17285b7501e0ee09',
  liquidation_context:'f1109fa881d122399aff17e25a2bed938dc3a951a64bc757c57bb6259b0ede9d',
  migration:'99bea74e21a9147086ece4e6072e4441f70db2527c136897843a0825712edc89',
});

function replaceOnce(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0||source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`OVERLAY_CONTEXT_MISMATCH:${label}`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

export async function applyTz101PublicationOverlay(runtime){
  const workerPath=path.join(runtime,'src/worker.js');
  const publicationPath=path.join(runtime,'src/tz101-publication-runtime.mjs');
  let worker=await fs.readFile(workerPath,'utf8');
  const workerHash=sha(worker);
  if(![EXPECTED.worker_before,EXPECTED.worker_after].includes(workerHash))throw new Error('TZ101_WORKER_BASE_CHANGED');
  const publication=await fs.readFile(publicationPath);
  const publicationHash=sha(publication);
  if(![EXPECTED.publication_before,EXPECTED.publication_after].includes(publicationHash))throw new Error('TZ101_PUBLICATION_BASE_CHANGED');
  const scenarioPath=path.join(runtime,'src/tz101-scenario-plan.mjs'),costPath=path.join(runtime,'src/tz101-cost-assessment.mjs');
  const scenarioHash=sha(await fs.readFile(scenarioPath)),costHash=sha(await fs.readFile(costPath));
  if(![EXPECTED.scenario_before,EXPECTED.scenario_after].includes(scenarioHash))throw new Error('TZ101_SCENARIO_BASE_CHANGED');
  if(![EXPECTED.cost_before,EXPECTED.cost_after].includes(costHash))throw new Error('TZ101_COST_BASE_CHANGED');

  if(workerHash===EXPECTED.worker_before){
    const importOld=`import {\n  runTz101PublicationShadow,\n} from "./tz101-publication-runtime.mjs";\n\n`;
    const importNew=`${importOld}import {\n  buildTz101LiquidationContext,\n} from "./tz101-liquidation-context.mjs";\n\n`;
    worker=replaceOnce(worker,importOld,importNew,'worker-import');
    const callOld=`  // TZ 10.1 publication stays separate from analytical Final Decision.\n  // Publication runtime derives prospective scenario/cost assessments from the\n  // exact committed receipts; null here means "derive internally", not absent\n  // producers. Missing entry-area/fee/holding proofs remain fail-closed and spend\n  // zero Telegram-sidecar D1 statements.\n  const finalDecisionPublicationShadow = await runTz101PublicationShadow({\n`;
    const callNew=`  // TZ 10.1 publication stays separate from analytical Final Decision.\n  // The runtime may read one exact immutable input bundle only after the score\n  // can reach publication. Missing entry-area/fee/holding receipts remain\n  // fail-closed. Projected liquidation context is optional and never a target,\n  // factual user position or ENTRY blocker.\n  const publicationBid = num(futures?.data?.bbo?.best_bid);\n  const publicationAsk = num(futures?.data?.bbo?.best_ask);\n  const publicationCurrentPrice = futures?.data?.coverage?.htx_futures_liquidity === "closed" &&\n    publicationBid !== null && publicationAsk !== null && publicationBid > 0 && publicationAsk >= publicationBid\n      ? (publicationBid + publicationAsk) / 2\n      : null;\n  const publicationMove24h = trajectory?.data?.coverage?.price_24h === "closed"\n    ? num(trajectory?.data?.windows?.["24h"]?.price?.change_pct)\n    : null;\n  const publicationLiquidationContext = buildTz101LiquidationContext({\n    projected_record: liquidationIntelligence,\n    contract_code: contract,\n    current_price: publicationCurrentPrice,\n    move_24h_pct: publicationMove24h,\n    observed_ts: now,\n  });\n  const finalDecisionPublicationShadow = await runTz101PublicationShadow({\n`;
    worker=replaceOnce(worker,callOld,callNew,'worker-publication-call');
    worker=replaceOnce(worker,'    liquidation_context: null,\n','    liquidation_context: publicationLiquidationContext,\n','worker-liquidation-context');
    worker=worker.replace(/\n+$/,'\n');
    if(sha(worker)!==EXPECTED.worker_after)throw new Error(`TZ101_WORKER_OVERLAY_RESULT_MISMATCH:${sha(worker)}`);
  }

  const copies=[
    ['src/tz101-publication-runtime.mjs','src/tz101-publication-runtime.mjs',EXPECTED.publication_after],
    ['src/tz101-publication-input-runtime.mjs','src/tz101-publication-input-runtime.mjs',EXPECTED.input_runtime],
    ['src/tz101-liquidation-context.mjs','src/tz101-liquidation-context.mjs',EXPECTED.liquidation_context],
    ['src/tz101-scenario-plan.mjs','src/tz101-scenario-plan.mjs',EXPECTED.scenario_after],
    ['src/tz101-cost-assessment.mjs','src/tz101-cost-assessment.mjs',EXPECTED.cost_after],
    ['migrations/20260921_tz101_publication_input_shadow.sql','migrations/20260921_tz101_publication_input_shadow.sql',EXPECTED.migration],
  ];
  const planned=[];
  for(const [sourceRel,targetRel,expected] of copies){
    const content=await fs.readFile(path.join(ROOT,sourceRel));
    if(sha(content)!==expected)throw new Error(`TZ101_OVERLAY_SOURCE_HASH_MISMATCH:${sourceRel}`);
    planned.push([path.join(runtime,targetRel),content]);
  }
  await fs.writeFile(workerPath,worker);
  for(const [target,content] of planned){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content);}
  if(sha(await fs.readFile(workerPath))!==EXPECTED.worker_after||sha(await fs.readFile(publicationPath))!==EXPECTED.publication_after)
    throw new Error('TZ101_OVERLAY_READBACK_FAILED');
  return {status:'CLOSED',worker_sha256:EXPECTED.worker_after,publication_sha256:EXPECTED.publication_after,production_changed:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(await applyTz101PublicationOverlay(path.resolve(process.argv[2]||'runtime'))));
}
