import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installed = fs.readFileSync(new URL('../../../runner/runner-main.mjs', import.meta.url), 'utf8');
const overlay = fs.readFileSync(new URL('../files/runner-main.mjs', import.meta.url), 'utf8');

test('post-V7 owner Telegram test has one narrow network-authorized compatibility gate', () => {
  assert.equal(installed, overlay);
  assert.match(installed, /postV7OwnerTelegramTestEnabled = postV7UnifiedEnabled && telegramInstallValidation && telegramReportTestRequested && v3TelegramNetworkEnabled/);
  assert.match(installed, /infoEnabled: postV7UnifiedEnabled \? \(postV7OwnerTelegramTestEnabled \? "1" : "0"\)/);
  assert.match(installed, /enabled: postV7UnifiedEnabled \? \(postV7OwnerTelegramTestEnabled \? "1" : "0"\)/);
  assert.match(installed, /currentLifecycle: telegramInstallValidation && telegramReportTestRequested \? null/);
});

test('ordinary post-V7 runs keep the legacy Telegram layer disabled', () => {
  const gate = (postV7, install, report, network) => postV7 && install && report && network;
  assert.equal(gate(true, true, true, true), true);
  for (const args of [
    [true, false, true, true], [true, true, false, true], [true, true, true, false], [false, true, true, true],
  ]) assert.equal(gate(...args), false);
});
