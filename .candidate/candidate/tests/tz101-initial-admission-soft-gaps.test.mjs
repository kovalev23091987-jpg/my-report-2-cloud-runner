import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raw = fs.readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const source = raw.replace(/from "(\.\/[^"\n]+\.mjs)"/g, (_, rel) =>
  `from ${JSON.stringify(new URL("../src/" + rel.slice(2), import.meta.url).href)}`
);
const api = await import("data:text/javascript;base64," + Buffer.from(
  source + "\nexport {buildDeepCheckQueue,buildDiscoveryPrefilter};"
).toString("base64"));

function row(contract, {
  status="CLOSED", market=true, oi=true, funding=true, history=true, missing=[],
  turnover=500000, oiValue=250000, p1=0, p4=0, o1=0, o4=0
}={}) {
  return {
    contract_code:contract,
    data_status:status,
    freshness:{stale:false,market_age_sec:5},
    quality:{
      market_present:market,
      oi_present:oi,
      funding_present:funding,
      history_available:history,
      missing,
    },
    symbol_fingerprint:{resolution_status:"RESOLVED_HTX_EXACT"},
    instrument_scope:{classification:"CRYPTO_CONFIRMED"},
    turnover_24h_usdt:turnover,
    open_interest:oi ? {value_usdt:oiValue,contracts:oiValue} : null,
    funding:funding ? {funding_rate:0.0001,funding_rate_pct:0.01,interval_hours:4} : null,
    transitions:history ? {
      "5m":{price_change_pct:p1/12,oi_change_pct:o1/12},
      "15m":{price_change_pct:p1/4,oi_change_pct:o1/4},
      "1h":{price_change_pct:p1,oi_change_pct:o1},
      "4h":{price_change_pct:p4,oi_change_pct:o4},
    } : {},
  };
}

const scan={contracts:[
  row("BTC-USDT",{turnover:9e9,oiValue:5e9,p1:0.2,p4:0.8,o1:0.1,o4:0.2}),
  row("ETH-USDT",{turnover:7e9,oiValue:4e9,p1:0.3,p4:0.9,o1:0.1,o4:0.2}),
  row("SOFT-USDT",{status:"PARTIAL",funding:false,missing:["funding"],turnover:2e6,oiValue:2e6,p1:4,p4:7,o1:2,o4:3}),
  row("NOOI-USDT",{status:"PARTIAL",oi:false,missing:["oi"],turnover:1.5e6,p1:3,p4:5}),
  row("UNEXPLAINED-USDT",{status:"PARTIAL",turnover:2e6,oiValue:2e6,p1:5,p4:8,o1:3,o4:4}),
  row("NOMARKET-USDT",{status:"PARTIAL",market:false,missing:["market"],turnover:2e6,oiValue:2e6,p1:5,p4:8,o1:3,o4:4}),
  ...Array.from({length:12},(_,i)=>row(`F${i}-USDT`,{
    turnover:300000+i*90000,oiValue:180000+i*70000,
    p1:(i%3-1)*0.2,p4:(i%4-2)*0.3,o1:(i%3)*0.1,o4:(i%4)*0.15,
  }))
]};

test("initial HTX admission keeps noncritical funding/OI gaps explicit instead of rejecting the asset",()=>{
  const q=api.buildDeepCheckQueue(scan);
  const by=new Map(q.queue.map(x=>[x.contract,x]));
  assert.ok(by.has("SOFT-USDT"));
  assert.deepEqual(by.get("SOFT-USDT").soft_data_gaps,["FUNDING_UNKNOWN"]);
  assert.equal(by.get("SOFT-USDT").data_readiness,"PARTIAL_NEEDS_ENRICHMENT");
  assert.ok(by.has("NOOI-USDT"));
  assert.ok(by.get("NOOI-USDT").soft_data_gaps.includes("OPEN_INTEREST_UNKNOWN"));
  assert.ok(!by.has("UNEXPLAINED-USDT"),"unexplained PARTIAL must remain fail-closed");
  assert.ok(!by.has("NOMARKET-USDT"),"missing HTX market is a hard technical blocker");
});

test("missing funding does not erase a strong candidate from cheap discovery",()=>{
  const q=api.buildDeepCheckQueue(scan);
  const d=api.buildDiscoveryPrefilter(scan,q,{max_shortlist:24,min_anomaly_flags:2,min_early_flags:2});
  const soft=d.shortlist.find(x=>x.contract==="SOFT-USDT");
  assert.ok(soft,"funding UNKNOWN must not remove a candidate whose other discovery facts are usable");
  assert.equal(soft.long_watch,true);
  assert.equal(soft.funding_directional_vote,false);
  assert.equal(soft.funding_context_only,true);
  assert.ok(d.insufficient_liquidity_contracts.includes("NOOI-USDT"),"missing OI must remain explicit rather than fabricated");
});
