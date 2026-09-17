import assert from "node:assert/strict";
import {
  providerSymbolFromContract,
  parseProviderSymbolRegistry,
  parseProjectedMap,
  parseRealizedSummary,
  parseCoverage,
  collectCrossVenueLiquidationIntelligence,
} from "../src/liquidation-intelligence.mjs";

const NOW = Date.parse("2026-09-13T09:00:00Z");

function response(data, status=200, headers={}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name){ return headers[String(name).toLowerCase()] ?? null; } },
    async json(){ return data; },
  };
}

const projectedFixture = {
  generatedAt: "2026-09-13T08:55:00Z",
  symbol: "BTC",
  current_price: 100,
  venues: ["Binance","Bybit","OKX","HTX"],
  projected_levels: [
    { price: 95, side: "long", notional_usd: 100000, strength: 0.8, major: true },
    { price: 92, side: "long", notional_usd: 250000, strength: 0.9 },
    { price: 105, side: "short", notional_usd: 120000, strength: 0.7, major: true },
    { price: 108, side: "short", notional_usd: 300000, strength: 0.95 },
  ],
  real_levels: {
    totals: { long_usd: 1111, short_usd: 2222 },
    levels: [ { price: 99, side: "long", notional_usd: 999999 } ],
  },
};

const realizedFixture = {
  generatedAt: "2026-09-13T08:57:00Z",
  by_exchange: [
    { exchange: "Bybit", symbol: "BTCUSDT", long_usd: 1000, short_usd: 500 },
    { exchange: "OKX", symbol: "BTCUSDT", long_usd: 200, short_usd: 300 },
    { exchange: "Bybit", symbol: "ETHUSDT", long_usd: 9000, short_usd: 9000 },
  ],
};

const symbolsFixture = {
  generatedAt: "2026-09-13T08:58:30Z",
  totalSymbols: 2,
  symbols: [
    { symbol: "BTCUSDT", lastPrice: 100 },
    { symbol: "ETHUSDT", lastPrice: 50 },
  ],
};

const coverageFixture = {
  generatedAt: "2026-09-13T08:58:00Z",
  liquidations: [
    { venue: "Bybit", kind: "full", events_24h: 123, last_record: "2026-09-13T08:57:30Z" },
    { venue: "Binance", kind: "sampled", events_24h: 99, last_record: "2026-09-13T08:57:20Z" },
  ],
};

{
  const a = providerSymbolFromContract("BTC-USDT");
  assert.equal(a.provider_symbol, "BTC");
  assert.equal(a.alias_verified, false);
  assert.equal(a.asset_identity_verified, false);
  const u = providerSymbolFromContract("龙虾-USDT");
  assert.equal(u.provider_symbol, null);
  assert.equal(u.alias_verified, false);
}

{
  const p = parseProjectedMap(projectedFixture, { observedTs: NOW, expectedSymbol: "BTC" });
  assert.equal(p.clusters.length, 4, "real_levels must never be mixed into projected clusters");
  assert.equal(p.current_price, 100);
  assert.deepEqual(p.venues_covered, ["Binance","Bybit","OKX","HTX"]);
  assert.equal(p.response_symbol_match, true);
  assert.ok(p.clusters.every(x => x.evidence_type === "PROJECTED_LIQUIDATION_CLUSTER"));
  assert.equal(p.clusters.some(x => x.level_price === 99), false, "real level leaked into projected lane");
}

{
  const r = parseRealizedSummary(realizedFixture, "BTC", NOW);
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.every(x => x.evidence_type === "REALIZED_LIQUIDATION_AGGREGATE"));
  assert.equal(r.rows.some(x => x.venue === "Bybit"), true);
  assert.equal(r.rows.some(x => x.venue === "OKX"), true);
}

{
  const c = parseCoverage(coverageFixture, NOW);
  assert.equal(c.venues.length, 2);
  assert.equal(c.venues[0].coverage_kind, "full");
  assert.equal(c.venues[1].coverage_kind, "sampled");
}

{
  let fetches=0;
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"龙虾-USDT", api_key:"secret", now_ts:NOW,
    fetch_impl: async()=>{ fetches++; return response({}); },
  });
  assert.equal(fetches,0,"Unicode/unverified alias must cause zero guessed external fetch");
  assert.equal(out.projected_map_status,"SOURCE_INCOMPATIBLE");
  assert.equal(out.safety.synthetic_leverage_heatmap_generated,false);
}

{
  let fetches=0;
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"", now_ts:NOW,
    fetch_impl: async()=>{ fetches++; return response({}); },
  });
  assert.equal(fetches,0);
  assert.equal(out.projected_map_status,"CONFIG_REQUIRED_FREE_API_KEY");
  assert.equal(out.liquidation_dq_status,"CONFIG_REQUIRED");
}

{
  const calls=[];
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"free-key", now_ts:NOW,
    fetch_impl: async(url,opts)=>{
      calls.push({url,auth:opts?.headers?.authorization});
      if (url.includes("liqmap")) return response(projectedFixture);
      if (url.includes("liquidations")) return response(realizedFixture);
      if (url.includes("coverage")) return response(coverageFixture);
      if (url.includes("symbols")) return response(symbolsFixture);
      throw new Error("unexpected url");
    },
    htx_liquidation_tape:{
      timestamp:NOW,
      summary:{long_liquidations:{events:1,notional_usdt:10},short_liquidations:{events:2,notional_usdt:20},total_events:3},
      freshness:{latest_event_time:"2026-09-13T08:59:00Z"},
      coverage:{htx_factual_long_liquidations:"closed",htx_factual_short_liquidations:"closed"},
    },
  });
  assert.equal(calls.length,4);
  assert.ok(calls.every(x=>x.auth === "Bearer free-key"));
  assert.equal(out.projected_map_status,"OBSERVATION_ONLY_IDENTITY_UNVERIFIED");
  assert.equal(out.alias_verified,true);
  assert.equal(out.alias_verification_scope,"PROVIDER_RESPONSE_SYMBOL_EXACT_MATCH");
  assert.equal(out.asset_identity_verified,false);
  assert.equal(out.cross_source_consensus,"NOT_AVAILABLE_SINGLE_PROJECTED_PROVIDER");
  assert.equal(out.projected_clusters.length,4);
  assert.equal(out.realized.provider.length,2);
  assert.equal(out.realized.htx.total_events,3);
  assert.equal(out.derived.nearest_major_cluster_below.level_price,95);
  assert.equal(out.derived.nearest_major_cluster_above.level_price,105);
  assert.equal(out.derived.largest_cluster_below.level_price,92);
  assert.equal(out.derived.largest_cluster_above.level_price,108);
  assert.equal(out.derived.cross_venue_max_cluster,null);
  assert.equal(out.derived.covered_oi_share,null);
  assert.equal(out.safety.live_signal_generated,false);
  assert.equal(out.safety.guaranteed_tp_generated,false);
}


{
  const noSymbol = { ...projectedFixture };
  delete noSymbol.symbol;
  const registryWithoutBtc = { ...symbolsFixture, symbols:[{symbol:"ETHUSDT"}] };
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=> url.includes("liqmap") ? response(noSymbol) : (url.includes("liquidations") ? response(realizedFixture) : (url.includes("symbols") ? response(registryWithoutBtc) : response(coverageFixture))),
  });
  assert.equal(out.projected_map_status,"OBSERVATION_ONLY_ALIAS_UNVERIFIED");
  assert.equal(out.alias_verified,false,"derived ticker must not be promoted to verified alias without provider confirmation");
}

{
  const mismatch = { ...projectedFixture, symbol:"ETH" };
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=> url.includes("liqmap") ? response(mismatch) : (url.includes("liquidations") ? response(realizedFixture) : (url.includes("symbols") ? response(symbolsFixture) : response(coverageFixture))),
  });
  assert.equal(out.projected_map_status,"SOURCE_INCOMPATIBLE");
  assert.equal(out.alias_verified,false);
}

{
  const stale = { ...projectedFixture, generatedAt:"2026-09-13T06:00:00Z" };
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=> url.includes("liqmap") ? response(stale) : (url.includes("liquidations") ? response(realizedFixture) : (url.includes("symbols") ? response(symbolsFixture) : response(coverageFixture))),
  });
  assert.equal(out.projected_map_status,"STALE");
}

{
  const future = { ...projectedFixture, generatedAt:"2026-09-13T10:00:10Z" };
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=> url.includes("liqmap") ? response(future) : (url.includes("liquidations") ? response(realizedFixture) : (url.includes("symbols") ? response(symbolsFixture) : response(coverageFixture))),
  });
  assert.equal(out.projected_map_status,"FUTURE");
}

{
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"STEEM-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=>{
      if (url.includes("liqmap")) return response({generatedAt:"2026-09-13T08:55:00Z",symbol:"STEEM",status:"unsupported",projected_levels:[]});
      if (url.includes("liquidations")) return response({generatedAt:"2026-09-13T08:57:00Z",by_exchange:[]});
      if (url.includes("symbols")) return response(symbolsFixture);
      return response(coverageFixture);
    },
  });
  assert.equal(out.projected_map_status,"SOURCE_UNSUPPORTED");
  assert.equal(out.projected_clusters.length,0);
  assert.equal(out.safety.synthetic_leverage_heatmap_generated,false,"STEEM unsupported must not trigger synthetic leverage map");
}

{
  // Live provider semantics observed on 2026-09-13: unsupported LiqMap symbols
  // may be returned as a non-2xx API response with an explicit error message.
  // That is not a source outage and must remain a fail-closed SOURCE_UNSUPPORTED.
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"STEEM-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=>{
      if (url.includes("liqmap")) return response({error:"Unsupported symbol. LiqMap covers 201 perpetuals; see /liqmap for the list."},400);
      if (url.includes("liquidations")) return response({generatedAt:"2026-09-13T08:57:00Z",by_exchange:[]});
      if (url.includes("symbols")) return response(symbolsFixture);
      return response(coverageFixture);
    },
  });
  assert.equal(out.projected_map_status,"SOURCE_UNSUPPORTED");
  assert.equal(out.projected_clusters.length,0);
  assert.ok(out.errors.some(x=>x.includes("Unsupported symbol")));
  assert.equal(out.safety.synthetic_leverage_heatmap_generated,false);
}

{
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"bad", now_ts:NOW,
    fetch_impl: async()=>response({error:"invalid key"},401),
  });
  assert.equal(out.projected_map_status,"AUTH_ERROR");
  assert.ok(out.errors.some(x=>x.includes("AUTH_REQUIRED_OR_INVALID") || x.includes("invalid key")));
}

{
  const rl = { ...projectedFixture, generatedAt:"2026-09-13T08:59:00Z" };
  let n=0;
  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT", api_key:"k", now_ts:NOW,
    fetch_impl: async(url)=>{
      n++;
      if (url.includes("liqmap")) return response(rl,429,{"retry-after":"10"});
      if (url.includes("liquidations")) return response(realizedFixture);
      if (url.includes("symbols")) return response(symbolsFixture);
      return response(coverageFixture);
    },
  });
  assert.equal(out.projected_map_status,"SOURCE_ERROR");
  assert.ok(out.source_health.retry_after_sec >= 10);
}

{
  const huge = {
    generatedAt:"2026-09-13T08:59:00Z",
    symbol:"BTC",
    current_price:100,
    projected_levels:Array.from({length:2500},(_,index)=>({
      price:90 + index / 1000,
      side:"long",
      notional_usd:index + 1,
    })),
  };
  const parsed = parseProjectedMap(huge,{observedTs:NOW,expectedSymbol:"BTC"});
  assert.equal(parsed.raw_rows_scanned,2000);
  assert.equal(parsed.clusters.length,500);
  assert.equal(parsed.scan_truncated,true);
  assert.equal(parsed.cluster_output_truncated,true);

  const out = await collectCrossVenueLiquidationIntelligence({
    contract_code:"BTC-USDT",api_key:"k",now_ts:NOW,
    fetch_impl:async(url)=>url.includes("liqmap") ? response(huge) :
      (url.includes("liquidations") ? response(realizedFixture) :
        (url.includes("symbols") ? response(symbolsFixture) : response(coverageFixture))),
  });
  assert.equal(out.projected_map_status,"SOURCE_PAYLOAD_TRUNCATED");
  assert.equal(out.liquidation_dq_status,"SOURCE_PAYLOAD_TRUNCATED");
  assert.equal(out.source_health.projected_scan_truncated,true);
}

{
  const hugeRealized = {
    generatedAt:"2026-09-13T08:59:00Z",
    by_exchange:Array.from({length:6000},(_,index)=>({
      exchange:`venue-${index}`,
      symbol:"BTCUSDT",
      long_usd:index + 1,
      short_usd:index + 2,
    })),
  };
  const parsed = parseRealizedSummary(hugeRealized,"BTC",NOW);
  assert.equal(parsed.rows.length,100);
  assert.equal(parsed.scan_truncated,true);
  assert.ok(parsed.graph_nodes_scanned <= 5000);
}

{
  const hugeCoverage = {
    generatedAt:"2026-09-13T08:59:00Z",
    liquidations:Array.from({length:1500},(_,index)=>({venue:`venue-${index}`,kind:"sampled"})),
  };
  const parsed = parseCoverage(hugeCoverage,NOW);
  assert.equal(parsed.venues.length,1000);
  assert.equal(parsed.rows_scanned,1000);
  assert.equal(parsed.scan_truncated,true);

  const hugeRegistry = {
    symbols:[...Array.from({length:1000},(_,index)=>({symbol:`TOKEN${index}USDT`})),{symbol:"BTCUSDT"}],
  };
  const registry = parseProviderSymbolRegistry(hugeRegistry,"BTC");
  assert.equal(registry.exact_match,false,"a symbol outside the bounded scan must fail closed");
  assert.equal(registry.rows_scanned,1000);
  assert.equal(registry.scan_truncated,true);
}

{
  const cyclic = { generatedAt:"2026-09-13T08:59:00Z",symbol:"BTC",current_price:100,projected_levels:[{price:99}] };
  cyclic.loop = cyclic;
  const parsed = parseProjectedMap(cyclic,{observedTs:NOW,expectedSymbol:"BTC"});
  assert.equal(parsed.clusters.length,1);
  assert.ok(parsed.graph_nodes_scanned < 20,"cyclic provider data must not cause recursive amplification");
}

console.log(JSON.stringify({
  ok:true,
  suite:"cross-venue-liquidation-intelligence",
  assertions:[
    "projected/realized lanes physically distinct",
    "Unicode zero guessed fetch",
    "missing key fail-closed",
    "Bearer auth",
    "provider-response alias verification required",
    "symbol mismatch fail-closed",
    "stale/future rejection",
    "STEEM unsupported => no synthetic levels",
    "single provider != cross-source consensus",
    "no live signal/probability/TP/weight promotion",
    "coverage kinds preserved",
    "HTX realized aggregate kept separate",
    "provider payload graph and row scans are bounded",
    "truncated provider payloads fail closed"
  ]
},null,2));
