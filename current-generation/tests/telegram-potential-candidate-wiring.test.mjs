import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('post-v7 keeps canonical final delivery unique but enables deduplicated OBSERVE and WAIT notices',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(runner,/infoEnabled: postV7UnifiedEnabled \? \(v3TelegramNetworkEnabled \? envText\("REPORT2_TELEGRAM_INFO_ENABLED"/);
 assert.match(runner,/infoObserveEnabled: postV7UnifiedEnabled \? \(v3TelegramNetworkEnabled \? envText\("REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED"/);
 assert.match(runner,/enabled: postV7UnifiedEnabled \? \(v3TelegramNetworkEnabled \? "1" : "0"\)/);
 assert.match(runner,/shadowDecisionAuto: envText\("REPORT2_TELEGRAM_SHADOW_DECISION_AUTO"/);
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 assert.match(workflow,/REPORT2_TELEGRAM_SHADOW_DECISION_AUTO: "0"/);
 assert.match(workflow,/REPORT2_TELEGRAM_INFO_ENABLED: "1"/);
 assert.match(workflow,/REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED: "1"/);
});
