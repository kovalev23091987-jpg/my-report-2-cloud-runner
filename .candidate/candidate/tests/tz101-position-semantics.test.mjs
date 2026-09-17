import assert from 'node:assert/strict';
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from '../src/final-decision-integration-engine.mjs';
import { positionFromLedgerRow } from '../src/stage392-proof-runtime.mjs';
import { completeInput, impulseCampaign, openPosition } from './final-decision-integration-fixtures.mjs';

// Do not change the persisted Final Decision JSON shape merely to relabel the
// shadow ledger: the existing D1 trigger intentionally guards exactly 48 keys.
const entry=buildFinalDecisionIntegrationShadow(completeInput('LONG'));
assert.equal(validateFinalDecisionOutput(entry).valid,true,validateFinalDecisionOutput(entry).errors.join(','));
assert.equal(entry.entry_action,'SHADOW_ENTRY_ELIGIBLE');
assert.equal(Object.hasOwn(entry,'position_semantics'),false,'no un-migrated Final Decision JSON field');

const activeCampaign=impulseCampaign('LONG');
const internalOpen=openPosition('LONG',activeCampaign);
const managed=buildFinalDecisionIntegrationShadow(completeInput('LONG',{campaign:activeCampaign,position:internalOpen}));
assert.equal(validateFinalDecisionOutput(managed).valid,true,validateFinalDecisionOutput(managed).errors.join(','));
assert.equal(managed.position_state,'OPEN_LONG','internal lifecycle remains intact');

const ledger=positionFromLedgerRow({state:'OPEN_LONG',state_revision:2,position_id:'VP:T:2',entry_ts:1000,direction:'LONG',campaign_id:'MWC:T',entry_wave_id:'W1',entry_decision_observation_ts:1100,entry_decision_material_digest:'0123456789abcdef',entry_decision_id:'FDI:T',entry_action_id:'FDE:T'},{contract_code:'TEST-USDT',snapshot_id:'SNAP:T',observed_ts:2000,committed_ts:2100});
assert.equal(ledger.position_scope,'INTERNAL_SHADOW_ANALYTICAL_EPISODE');
assert.equal(ledger.user_portfolio_state,'UNKNOWN');
assert.equal(ledger.user_position_confirmed,false);
assert.equal(ledger.user_position_quantity_contracts,null);
assert.equal(ledger.user_management_authorized,false);

console.log('PASS TZ10.1 shadow position proof is explicitly not user portfolio; persisted Final Decision shape unchanged');
