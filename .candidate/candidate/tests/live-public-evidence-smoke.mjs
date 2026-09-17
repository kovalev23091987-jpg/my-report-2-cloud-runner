import { collectPublicFullEvidence } from "../src/public-evidence-adapters.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Symbol-safety canary: Unicode/exotic contract must never be guessed into an
// ASCII external alias. This check is local and must pass even if the network is down.
let unicodeFetchCalls = 0;
const unicode = await collectPublicFullEvidence({
  contract_code: "龙虾-USDT",
  now_ts: Date.now(),
  fetch_impl: async () => {
    unicodeFetchCalls += 1;
    throw new Error("Unicode contract must not call external venue APIs without verified alias");
  },
});
assert(unicodeFetchCalls === 0, "Unicode symbol safety failed: external fetch was attempted");
assert(
  (unicode?.evidence || []).some((row) => row?.status === "SOURCE_INCOMPATIBLE"),
  "Unicode symbol safety failed: SOURCE_INCOMPATIBLE evidence missing",
);

// Real public-market smoke. At least one factual Chain 2/3 public evidence lane
// must work before deployment; otherwise 3.7 stops PREDEPLOY and production
// remains unchanged.
const result = await collectPublicFullEvidence({
  contract_code: "ETHFI-USDT",
  now_ts: Date.now(),
});
const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
const safety = result?.safety || {};
assert(safety.strategy_weights_changed === false, "strategy weight safety invariant failed");
assert(safety.missing_data_directional_penalty === false, "missing-data safety invariant failed");
assert(safety.live_promotion === false, "live promotion safety invariant failed");
assert(safety.telegram === false, "Telegram safety invariant failed");
assert(safety.execution === false, "execution safety invariant failed");
assert(evidence.length > 0, "public evidence collector returned no evidence rows");

const smokeNow = Date.now();
const factualVenueObservations = evidence.filter((x) => {
  const sourceTs=Number(x?.source_ts), maxAgeSec=Number(x?.max_age_sec);
  const ageSec=(smokeNow-sourceTs)/1000;
  return x?.venue_observation_status === "CLOSED" && x?.value !== null && !x?.error && x?.alias_verified === true && Number.isFinite(sourceTs) && Number.isFinite(maxAgeSec) && maxAgeSec>0 && ageSec>=-60 && ageSec<=maxAgeSec;
});
const chain2Closed = factualVenueObservations.filter((x) => x?.chain === "CROSS_EXCHANGE_DERIVATIVES");
const chain3Closed = factualVenueObservations.filter((x) => x?.chain === "MARKET_STRENGTH_SPOT");
const fundingVenues = new Set(chain2Closed.filter((x) => x?.metric === "funding_rate").map((x) => x?.venue).filter(Boolean));
const hasOiTrajectory = chain2Closed.some((x) => /^oi_change_/i.test(String(x?.metric || "")));
const rsRequired = [
  "rs_vs_btc_1h", "rs_vs_eth_1h",
  "rs_vs_btc_4h", "rs_vs_eth_4h",
  "rs_vs_btc_24h", "rs_vs_eth_24h",
];
const closedRsMetrics = new Set(chain3Closed.map((x) => x?.metric));
const closedRequiredRs = rsRequired.filter((m) => closedRsMetrics.has(m));

assert(
  fundingVenues.size >= 1 || chain3Closed.length >= 1,
  "live smoke got no factual venue-level Chain 2 or Chain 3 observation",
);
assert(
  factualVenueObservations.every((x) => x?.status === "SOURCE_INCOMPATIBLE" && x?.asset_identity_verified === false && x?.eligible_for_chain_closure === false),
  "venue-symbol-only observations must not look eligible for chain closure",
);
assert(
  (result?.evidence || []).some((x) => x?.chain === "SMART_MONEY_ONCHAIN" && x?.status === "NOT_CLOSED"),
  "Chain 4 must remain explicitly NOT_CLOSED in autonomous 3.7",
);
assert(
  (result?.evidence || []).some((x) => x?.chain === "SUPPORTING_RISK" && x?.status === "NOT_CLOSED"),
  "Chain 5 must remain explicitly NOT_CLOSED in autonomous 3.7",
);

const output = {
  ok: true,
  contract: result.contract_code,
  adapter_version: result.version,
  unicode_zero_fetch_verified: unicodeFetchCalls === 0,
  closed_rows: evidence.filter((x)=>x?.status==="CLOSED").length,
  factual_venue_observations: factualVenueObservations.length,
  total_rows: evidence.length,
  aliases: {
    bybit: result?.alias_verification?.bybit?.status || null,
    okx_swap: result?.alias_verification?.okx_swap?.status || null,
    okx_spot: result?.alias_verification?.okx_spot?.status || null,
    binance_futures: result?.alias_verification?.binance_futures?.status || null,
  },
  chain2: {
    closed_rows: chain2Closed.length,
    funding_venues: [...fundingVenues].sort(),
    has_oi_trajectory: hasOiTrajectory,
  },
  chain3: {
    closed_rows: chain3Closed.length,
    required_rs_metrics_closed: closedRequiredRs,
    required_rs_metrics_total: rsRequired.length,
  },
  chain4_status: [...new Set(evidence.filter((x) => x?.chain === "SMART_MONEY_ONCHAIN").map((x) => x?.status))],
  chain5_status: [...new Set(evidence.filter((x) => x?.chain === "SUPPORTING_RISK").map((x) => x?.status))],
  note: "At least one factual public Chain 2/3 lane is required predeploy. Missing venues remain fail-closed DQ and never create a live decision.",
};
console.log(JSON.stringify(output, null, 2));
