import { collectCrossVenueLiquidationIntelligence } from "../src/liquidation-intelligence.mjs";

const key = String(process.env.BYKARANTELI_API_KEY || "").trim();
if (!key) {
  console.error(JSON.stringify({ok:false,status:"CONFIG_REQUIRED",error:"BYKARANTELI_API_KEY_MISSING"},null,2));
  process.exit(2);
}

const now=Date.now();
const btc=await collectCrossVenueLiquidationIntelligence({contract_code:"BTC-USDT",api_key:key,now_ts:now,fetch_impl:fetch});
const steem=await collectCrossVenueLiquidationIntelligence({contract_code:"STEEM-USDT",api_key:key,now_ts:Date.now(),fetch_impl:fetch});
const unicode=await collectCrossVenueLiquidationIntelligence({contract_code:"龙虾-USDT",api_key:key,now_ts:Date.now(),fetch_impl:async()=>{throw new Error("UNICODE_EXTERNAL_FETCH_MUST_NOT_HAPPEN")}});

const btcValid = btc.projected_map_status === "OBSERVATION_ONLY_IDENTITY_UNVERIFIED" && Array.isArray(btc.projected_clusters) && btc.projected_clusters.length > 0 && btc.projected_freshness === "CURRENT" && btc.safety?.synthetic_leverage_heatmap_generated === false;
const steemSafe = ["OBSERVATION_ONLY_IDENTITY_UNVERIFIED","OBSERVATION_ONLY_ALIAS_UNVERIFIED","SOURCE_UNSUPPORTED","NOT_CLOSED_NO_PROJECTED_LEVELS","STALE","MISSING_SOURCE_TIMESTAMP"].includes(steem.projected_map_status) && steem.safety?.synthetic_leverage_heatmap_generated === false;
const unicodeSafe = unicode.projected_map_status === "SOURCE_INCOMPATIBLE" && Number(unicode?.source_health?.external_fetches ?? -1) === 0;
const noPromotion=[btc,steem,unicode].every(x=>x?.safety?.live_probability_generated===false && x?.safety?.live_signal_generated===false && x?.safety?.validated_signal_generated===false && x?.safety?.telegram_started===false && x?.safety?.trading_execution===false && x?.safety?.strategy_weights_changed===false && x?.safety?.guaranteed_tp_generated===false);
const ok=btcValid&&steemSafe&&unicodeSafe&&noPromotion;
console.log(JSON.stringify({
  ok,
  timestamp_utc:new Date().toISOString(),
  btc:{status:btc.projected_map_status,clusters:btc.projected_clusters?.length??0,freshness:btc.projected_freshness,venues:btc.derived?.venues_covered??[],realized_rows:btc.realized?.provider?.length??0,errors:btc.errors},
  steem:{status:steem.projected_map_status,clusters:steem.projected_clusters?.length??0,freshness:steem.projected_freshness??null,realized_rows:steem.realized?.provider?.length??0,errors:steem.errors},
  unicode:{status:unicode.projected_map_status,external_fetches:unicode?.source_health?.external_fetches??null},
  safety:{no_live_promotion:noPromotion,cross_source_consensus:btc.cross_source_consensus,synthetic_heatmap_generated:false}
},null,2));
if(!ok) process.exit(1);
