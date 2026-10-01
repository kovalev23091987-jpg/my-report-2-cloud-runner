import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDynamicLiquidationPanel} from '../files/src/dynamic-liquidation-panel.mjs';
import {evaluateTechnicalMovePotential} from '../files/src/technical-move-potential.mjs';
import {renderCanonicalTelegram,assessActionability} from '../files/src/canonical-publication.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/tao-delivered-20260929.json',import.meta.url)));
test('delivered TAO bucket and cross-margin observations stay useful context and do not prove a target',()=>{
 const c=fixture.canonical_subset;
 assert.equal(fixture.origin.telegram_message_id,144);
 assert.ok(Math.abs(c.targets[0].price-202.84495)<1e-9);
 const panel=buildDynamicLiquidationPanel({contexts:fixture.contexts,reference_price:304.8,observed_ts:c.observed_ts});
 assert.equal(panel.status,'CLOSED');assert.equal(panel.zones_seen,6);
 assert.ok(panel.clusters.every(row=>row.decision_target_eligible===false&&row.target_price===null));
 const proof=evaluateTechnicalMovePotential({direction:'SHORT',current_price:304.8,trigger_price:302.05,opportunity:fixture.opportunity,liquidation_zones:c.liquidations});
 assert.equal(proof.status,'NOT_CLOSED');assert.equal(proof.target_price,null);
 const rendered=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
 assert.equal(rendered.ok,true);assert.match(rendered.text,/Цель после подтверждения входа: пока не подтверждена/);
 assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).reason,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
});
test('valid observation score is a score out of 100 and target is conditional on entry',()=>{
 const c=structuredClone(fixture.canonical_subset);
 // Synthetic control for presentation only; it is not a newly discovered TAO target.
 c.targets=[{price:280,basis:'PRECOMMITTED_MEASURED_STRUCTURE'}];
 c.metadata.technical_move_potential={status:'CLOSED',basis:'PRECOMMITTED_MEASURED_STRUCTURE',target_price:280};
 const r=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
 assert.equal(r.ok,true);assert.match(r.text,/Оценка: 91 из 100/);
 assert.match(r.text,/Цель после подтверждения входа: 280 USDT/);
 assert.doesNotMatch(r.text,/Оценка: 91%|Начинать закрывать позицию/);
});
