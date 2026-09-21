import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const expected=Object.freeze({
  '.github/workflows/report2.yml':'ccd5a369bfd5dcd7705cc6bf1cb460b96896b85d07f1840c2240ef1b7dff4c94',
  'payload/report2-runtime.enc':'30f9d3b589b0caa8d409707e7e38f0a04c5080130fdd27ea7fa25826e234cf88',
  'runner/runner-main.mjs':'596f4cd9f6f23d314f5853c110212fcead1874d0cd6a7b9f87f415ae1e401242',
  'runner/telegram-zero-reason.mjs':'3f565009fbd1c4411b24602687616d6c9cc4415ef562096b08f4cd66330d64ad',
  'runner/telegram-info-runtime.mjs':'3d020fbb32b6217da7c175a3ca51be82b03c0cc4194a63f3b8426763f9f92d65',
  'runner/telegram-output.mjs':'fbb9785e768dce8e897b1aa3b2c987a88f1da16d02c6aaae07192083d560ff67',
  'runner/apply-telegram-runtime-overlay.mjs':'cef3465a6e3769bec9791ae65dcc52720b81b6f548800af55dda1ec6995ac819',
  'runner/telegram-runtime-overlay.json':'7428d835584bd98827852d5999eb5fd2bdade5f895f40c031ac54361e753f604',
  'tz101-shadow-overlay/apply-runtime-overlay.mjs':'8d37610afcf27432144e061ab3fdbc0d8087a72c8f992e67a705485fab6c642d',
  'tz101-shadow-overlay/src/tz101-publication-runtime.mjs':'0c64b51cc78b99ea5f71e86ae6210d6ad28f8ff85b669d9d39f418d3af1d3c73',
  'tz101-shadow-overlay/src/tz101-publication-input-runtime.mjs':'c1ce465a1cfebc2c00083fc02024c1c28660955682953aad17285b7501e0ee09',
  'tz101-shadow-overlay/src/tz101-liquidation-context.mjs':'f1109fa881d122399aff17e25a2bed938dc3a951a64bc757c57bb6259b0ede9d',
  'tz101-shadow-overlay/src/tz101-scenario-plan.mjs':'f8a340c879bc2e858b51bd78dc27e4bf4897ffc2c38fe7db304cd2649116230b',
  'tz101-shadow-overlay/src/tz101-cost-assessment.mjs':'bb46da233429f46320e69e9ccefd1fb093fa27821dd0254ff44254a27b405ae5',
  'tz101-shadow-overlay/migrations/20260921_tz101_publication_input_shadow.sql':'99bea74e21a9147086ece4e6072e4441f70db2527c136897843a0825712edc89',
});

const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const [file,want] of Object.entries(expected)){
  if(!fs.existsSync(path.join(root,file)))throw new Error(`CANDIDATE_FILE_MISSING:${file}`);
  const got=sha(file);if(got!==want)throw new Error(`CANDIDATE_HASH_MISMATCH:${file}:${got}`);
}
const productionWorkflow=fs.readFileSync(path.join(root,'.github/workflows/report2.yml'),'utf8');
if(/REPORT2_TELEGRAM_SHADOW_DECISION_AUTO:\s*["']?1\b/.test(productionWorkflow))throw new Error('FINAL_AUTO_MUST_REMAIN_OFF');
if(/force-with-lease|--force\b/.test(productionWorkflow))throw new Error('FORCE_PUSH_FORBIDDEN');
console.log(JSON.stringify({
  status:'PASS',
  exact_production_base:'3cb2d9bdcb344e6034cd419824f31fd4f6ac1fd3',
  production_changed:false,
  telegram_network_enabled:false,
  final_auto_enabled:false,
}));
