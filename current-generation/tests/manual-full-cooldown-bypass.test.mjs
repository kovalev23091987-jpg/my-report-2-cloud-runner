import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');

test('full manual report explicitly bypasses candidate cooldown',()=>{
  assert.match(worker,/const bypassCooldown\s*=\s*options\s*\?\.bypass_cooldown\s*===\s*true;/);
  assert.match(worker,/const cooldownActive\s*=\s*!bypassCooldown\s*&&\s*ageSec !== null/);
  assert.match(worker,/bypass_cooldown:\s*String\(env\?\.REPORT2_MANUAL_MODE\|\|''\)\.toUpperCase\(\)===['"]FULL_MANUAL['"]/);
});
