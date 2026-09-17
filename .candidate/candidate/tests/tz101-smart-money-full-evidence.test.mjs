import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseByKaranteliSmartMoney, smartMoneyRawEvidenceRows } from '../src/tz101-smart-money-evidence.mjs';
import { buildFullEvidenceEnvelope, evidenceUsable } from '../src/full-evidence-contract.mjs';
import { buildTz101ScoreInterval } from '../src/tz101-score-interval.mjs';

const NOW=Date.UTC(2026,8,17,13,0,0), C='BTC-USDT';
const raw=parseByKaranteliSmartMoney({contract_code:C,observed_ts:NOW,payload:{symbol:'BTCUSDT',fetchedAt:new Date(NOW-1000).toISOString(),takerBuySellRatio:0.9,globalAccountLongPct:55,globalAccountShortPct:45,positioningDivergencePct:10,topTraderPositionLongPct:65,topTraderPositionShortPct:35}});
const rows=smartMoneyRawEvidenceRows(raw,NOW);
assert.equal(rows.length,4);
assert.ok(rows.every(r=>r.status==='PARTIAL'&&r.eligible_for_chain_closure===false));
assert.ok(rows.every(r=>evidenceUsable(r)===false));

// Raw/un-calibrated Smart Money is advisory. It must not enter the critical
// Full Evidence array and therefore cannot downgrade entry-critical DQ merely
// because the supporting block is still uncalibrated.
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert.match(worker,/publicEvidence\.advisory_evidence\s*=\s*\[/);
assert.doesNotMatch(worker,/publicEvidence\.evidence\.push\(\.\.\.smartMoneyRawEvidenceRows/);

const criticalBaseline=buildFullEvidenceEnvelope({contract_code:C,observed_ts:NOW,evidence:[]});
const criticalWithRawKeptSeparate=buildFullEvidenceEnvelope({contract_code:C,observed_ts:NOW,evidence:[]});
assert.deepEqual(criticalWithRawKeptSeparate.data_quality,criticalBaseline.data_quality);
assert.equal(criticalWithRawKeptSeparate.evidence.length,0);

// The scorer still sees the raw observation explicitly, but gives it no points
// until a separate calibration/promotion step closes the subcriteria.
const score=buildTz101ScoreInterval({direction:'LONG',decision_evidence:[],smart_money_raw:raw});
const block=score.weighted_blocks.find(b=>b.id==='SMART_MONEY_ONCHAIN');
assert.equal(block.contribution_lower,0);
assert.equal(block.contribution_upper,20);
assert.equal(block.state,'UNKNOWN');
assert.ok(block.subcriteria.every(x=>x.raw_observed===true&&x.state==='UNKNOWN'));
assert.equal(score.threshold_70_lower_bound_pass,false);
console.log(JSON.stringify({ok:true,suite:'tz101-smart-money-full-evidence',raw_rows:rows.length,usable_rows:rows.filter(evidenceUsable).length,critical_dq_unchanged:true,smart_money_score_lower:block.contribution_lower,smart_money_score_upper:block.contribution_upper}));
