import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadEffectivePresentationModules,outputContractScenarios,renderScenario} from './output-contract-support.mjs';

const fixtureDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'fixtures/output-contract');
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha256=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('K01: approved V4 user output is byte-for-byte frozen for identical canonical input',async t=>{
  const modules=await loadEffectivePresentationModules();t.after(modules.cleanup);
  for(const scenario of outputContractScenarios()){
    await t.test(`${scenario.id} (${scenario.mode})`,async()=>{
      const fixturePath=path.join(fixtureDir,`${scenario.id}.json`);
      assert.equal(fs.existsSync(fixturePath),true,`missing immutable golden ${fixturePath}`);
      const frozen=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
      const actual=await renderScenario(modules,scenario);
      assert.deepEqual(actual.canonical,frozen.canonical);
      assert.equal(actual.expected.manual.text,frozen.expected.manual.text);
      assert.equal(actual.expected.compact.message,frozen.expected.compact.message);
      assert.equal(actual.expected.telegram.text,frozen.expected.telegram.text);
      assert.deepEqual(actual.expected,frozen.expected);
    });
  }
});

test('K01: all required directions, lifecycle states and manual modes are represented',()=>{
  const scenarios=outputContractScenarios();
  assert.deepEqual(new Set(scenarios.map(x=>x.canonical.direction)),new Set(['LONG','SHORT']));
  assert.deepEqual(new Set(scenarios.map(x=>x.event)),new Set(['OBSERVE','WAIT','ENTRY','IDEA_REMOVED']));
  assert.deepEqual(new Set(scenarios.map(x=>x.mode)),new Set(['FULL_MANUAL','MANUAL_COIN','LIQUIDATION_ONLY']));
  assert.equal(scenarios.some(x=>x.id==='missing-data'&&x.canonical.status!=='CLOSED'),true);
});

test('K01: golden initializer refuses to overwrite existing fixtures',()=>{
  for(const scenario of outputContractScenarios())assert.equal(fs.existsSync(path.join(fixtureDir,`${scenario.id}.json`)),true);
  const source=fs.readFileSync(new URL('./initialize-output-contract-fixtures.mjs',import.meta.url),'utf8');
  assert.match(source,/GOLDEN_ALREADY_EXISTS/);
  assert.doesNotMatch(source,/force:\s*true/);
});

test('K01: formatter and fixture hashes match the frozen manifest',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(fixtureDir,'MANIFEST.json'),'utf8'));
  assert.equal(manifest.automatic_golden_update,false);
  for(const [relative,expected] of Object.entries(manifest.effective_modules))assert.equal(sha256(path.join(repoRoot,relative)),expected,relative);
  for(const [name,expected] of Object.entries(manifest.fixtures))assert.equal(sha256(path.join(fixtureDir,name)),expected,name);
});
