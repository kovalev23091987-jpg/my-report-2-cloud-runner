import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('post-v7 uses one canonical sender for OBSERVE WAIT and ENTRY',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(runner,/infoEnabled: envText\("REPORT2_TELEGRAM_INFO_ENABLED"/);
 assert.match(runner,/infoObserveEnabled: envText\("REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED"/);
 assert.match(runner,/enabled: postV7UnifiedEnabled \? \(postV7OwnerTelegramTestEnabled \? "1" : "0"\)/);
 assert.match(runner,/shadowDecisionAuto: envText\("REPORT2_TELEGRAM_SHADOW_DECISION_AUTO"/);
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 assert.match(workflow,/REPORT2_TELEGRAM_SHADOW_DECISION_AUTO: "0"/);
 assert.match(workflow,/REPORT2_TELEGRAM_WATCH70_ENABLED: "1"/);
 assert.match(workflow,/REPORT2_TELEGRAM_WATCH70_THRESHOLD: "70"/);
 assert.match(workflow,/REPORT2_TELEGRAM_INFO_ENABLED: "1"/);
 assert.match(workflow,/REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED: "1"/);
 assert.match(workflow,/REPORT2_EVIDENCE_HTTP_CAP: \$\{\{ github\.event_name == 'schedule' && '10' \|\| '24' \}\}/);
});
