"""Reconcile the LIQ 105-asset matrix using saved provider evidence only.

No provider requests are made. Historical numeric opportunity never means a
fresh level was delivered to a report.
"""

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINTS = ROOT / "checkpoints"
MATRIX = CHECKPOINTS / "LIQ_105_SAVED_SOURCE_EVIDENCE_MATRIX_20261013.json"


def read(name):
    return json.loads((CHECKPOINTS / name).read_text())


def numeric(value):
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


matrix = json.loads(MATRIX.read_text())
rows = matrix["rows"]
by_asset = {row["asset"]: row for row in rows}
assert len(rows) == len(by_asset) == 105
eligible = set(by_asset) - {"BTC", "ETH"}

release = read("liquidation-coverage-audit-release-evidence-20261004.json")
assert release["checked_cells"] == 816 and release["assets"] == 102
covered = {
    row["contract"].removesuffix("-USDT")
    for row in release["covered_asset_sources"]
    if "HYPERLIQUID_NATIVE" in row["source_ids"]
}
assert len(covered) == release["real_level_assets_by_source"]["HYPERLIQUID_NATIVE"] == 55
old_assets = {row["asset"] for row in rows if row["sources"]["HYPERLIQUID_NATIVE"]["historical_status"] != "NO_OLD_MATRIX_ROW"}
assert len(old_assets) == 102 and covered <= old_assets
for asset in old_assets:
    for source in matrix["old_native_source_columns"]:
        entry = by_asset[asset]["sources"][source]
        entry["historical_status"] = (
            "HISTORICAL_NUMERIC_VERIFIED" if source == "HYPERLIQUID_NATIVE" and asset in covered
            else "HISTORICAL_CHECKED_NO_NUMERIC_LEVEL"
        )
        entry["numeric_level_count_min"] = 1 if source == "HYPERLIQUID_NATIVE" and asset in covered else 0
        entry["proof"] = "checkpoints/liquidation-coverage-audit-release-evidence-20261004.json"
        entry["source_ts"] = None  # Release receipt does not retain exact per-asset source clocks.
        entry["fresh_for_current_report"] = False

dydx = read("DYDX_ACTUAL_DENSE_NATIVE_PAGE_20261007.json")
dy_levels = {}
for row in rows:
    row["sources"].setdefault("DYDX_PINNED_NATIVE", {
        "historical_status": "NO_SAVED_NUMERIC_LEVEL_FOR_EXACT_ASSET",
        "numeric_level_count": 0,
        "independent_upstream": "DYDX_MAINNET_CHAIN",
        "fresh_for_current_report": False,
    })
for item in dydx["model"]["levels"]:
    if item["asset"] in eligible and numeric(item.get("price")):
        dy_levels.setdefault(item["asset"], []).append(item)
assert len(dy_levels) == 16
for asset, levels in dy_levels.items():
    by_asset[asset]["sources"]["DYDX_PINNED_NATIVE"] = {
        "historical_status": "HISTORICAL_CONDITIONAL_NUMERIC_ESTIMATE",
        "numeric_level_count": len(levels),
        "source_ts": max(item["source_ts"] for item in levels),
        "evidence_role": "BOUNDED_PUBLIC_ACCOUNT_POSITION_WITH_CONDITIONAL_CALCULATED_PRICE",
        "independent_upstream": "DYDX_MAINNET_CHAIN",
        "full_market_census": False,
        "fresh_for_current_report": False,
        "proof": "checkpoints/DYDX_ACTUAL_DENSE_NATIVE_PAGE_20261007.json",
    }

gtrade = read("GTRADE_ACTUAL_ADDITIONAL_ASSET_LEVELS_20261007.json")
g_assets = set()
for item in gtrade["rows"]:
    asset = item["contract"].removesuffix("-USDT")
    if asset not in eligible:
        continue
    levels = [level for level in item["levels"] if numeric(level.get("native_price"))]
    if not levels:
        continue
    g_assets.add(asset)
    entry = by_asset[asset]["sources"]["GTRADE_NATIVE"]
    entry.update(
        historical_status="HISTORICAL_PINNED_POSITION_NUMERIC_ESTIMATE",
        numeric_level_count=len(levels),
        source_ts=item["source_ts"],
        evidence_role="VERIFIED_OPEN_POSITION_OFFICIAL_SDK_ESTIMATE",
        full_market_census=False,
        fresh_for_current_report=False,
        proof="checkpoints/GTRADE_ACTUAL_ADDITIONAL_ASSET_LEVELS_20261007.json",
    )
ray = read("GTRADE_ACTUAL_THREE_READ_AND_HINTS_20261007.json")
ray_levels = ray["scoped_consumer"]["above"] + ray["scoped_consumer"]["below"]
assert ray["contract"] == "RAY-USDT" and len(ray_levels) == ray["future_levels"] == 4
assert all(numeric(level.get("native_price")) for level in ray_levels)
g_assets.add("RAY")
by_asset["RAY"]["sources"]["GTRADE_NATIVE"].update(
    historical_status="HISTORICAL_PINNED_POSITION_NUMERIC_ESTIMATE",
    numeric_level_count=len(ray_levels),
    source_ts=ray["scoped_consumer"]["source_ts"],
    evidence_role="VERIFIED_OPEN_POSITION_OFFICIAL_SDK_ESTIMATE",
    full_market_census=False,
    fresh_for_current_report=False,
    proof="checkpoints/GTRADE_ACTUAL_THREE_READ_AND_HINTS_20261007.json",
)
assert len(g_assets) == 5

orderly = read("LIQ_ORDERLY_PUBLIC_POSITIONS_AND_STRK_NATURAL_ARCHIVE_20261012.json")
source = (ROOT / "current-generation/files/src/orderly-public-liquidation-positions.mjs").read_text()
match = re.search(r"ORDERLY_VERIFIED_HTX_MARKETS=new Set\('([^']+)'", source)
assert match
orderly_assets = set(match.group(1).split())
assert len(orderly_assets) == orderly["orderly"]["position_census"]["approved_assets_with_valid_side_and_price"] == 38
assert orderly_assets <= eligible
for asset in orderly_assets:
    by_asset[asset]["sources"]["ORDERLY_PUBLIC_POSITIONS"].update(
        historical_status="HISTORICAL_SOURCE_SNAPSHOT_NUMERIC",
        numeric_level_count_min=1,
        source_ts=orderly["orderly"]["position_census"]["corrected_response_ts"],
        evidence_role="PUBLIC_OPEN_POSITION_WITH_ESTIMATED_LIQUIDATION_PRICE",
        independent_upstream="ORDERLY",
        full_market_census=False,
        fresh_for_current_report=False,
        saved_useful_position_payload_for_this_asset=True,
        proof="checkpoints/LIQ_ORDERLY_PUBLIC_POSITIONS_AND_STRK_NATURAL_ARCHIVE_20261012.json",
    )

coinboss = {row["asset"] for row in rows if row["sources"]["COINBOSS_MODEL"]["old_probe_class"] == "fresh_numeric"}
swole = {row["asset"] for row in rows if row["sources"]["SWOLECHARTS_MODEL"]["saved_numeric_payload"]}
for asset in coinboss:
    by_asset[asset]["sources"]["COINBOSS_MODEL"].update(
        historical_status="HISTORICAL_NUMERIC_AGGREGATE_MODEL",
        evidence_role="AGGREGATED_CEX_MODELED_LEVELS",
        independent_primary_source=False,
        fresh_for_current_report=False,
        proof="checkpoints/source-inputs/coinboss-model-priority-hints-20261013.json",
    )
for asset in swole:
    by_asset[asset]["sources"]["SWOLECHARTS_MODEL"].update(
        historical_status="HISTORICAL_NUMERIC_AGGREGATE_MODEL",
        evidence_role="AGGREGATED_CEX_MODELED_LEVELS",
        independent_primary_source=False,
        fresh_for_current_report=False,
        proof="checkpoints/source-inputs/swolecharts-liq-levels-bounded-20261013.json",
    )

position_union = (covered | set(dy_levels) | g_assets | orderly_assets) & eligible
numeric_union = position_union | coinboss | swole
assert len(position_union) == 58 and len(numeric_union) == 68
primary_positive = {
    "HISTORICAL_NUMERIC_VERIFIED",
    "HISTORICAL_CONDITIONAL_NUMERIC_ESTIMATE",
    "HISTORICAL_PINNED_POSITION_NUMERIC_ESTIMATE",
    "HISTORICAL_SOURCE_SNAPSHOT_NUMERIC",
}
primary_names = ("HYPERLIQUID_NATIVE", "DYDX_PINNED_NATIVE", "GTRADE_NATIVE", "ORDERLY_PUBLIC_POSITIONS")
multi_primary = sorted(
    asset for asset in eligible
    if sum(by_asset[asset]["sources"][name].get("historical_status") in primary_positive for name in primary_names) >= 2
)
assert len(multi_primary) == 41
missing_queue = []
for asset in sorted(eligible - numeric_union):
    sources = by_asset[asset]["sources"]
    if sources["SWOLECHARTS_MODEL"]["catalog_route_hint"]:
        tier, next_probe = "A", "Check exact Swolecharts numeric payload and source clock under an admitted one-call research slot."
    elif sources["COINBOSS_MODEL"]["old_probe_class"] == "stale_numeric":
        tier, next_probe = "B", "Check whether the old CoinBoss number has become current, under an admitted one-call research slot."
    elif sources["COINBOSS_MODEL"]["old_probe_class"] == "invalid":
        tier, next_probe = "D", "Resolve exact identity against the approved HTX contract before any provider HTTP."
    else:
        tier, next_probe = "C", "Search an exact free route or a new independent primary venue before requesting a provider payload."
    missing_queue.append({"asset": asset, "priority_tier": tier, "next_probe": next_probe, "new_provider_http_consumed": 0})
missing_queue.sort(key=lambda item: (item["priority_tier"], item["asset"]))
matrix.update(
    schema="LIQ_105_ASSET_ALL_SAVED_SOURCE_EVIDENCE_MATRIX_V2",
    generated_utc=datetime.now(timezone.utc).isoformat(),
    source_columns=12,
    counts={
        "eligible_assets_excluding_btc_eth": len(eligible),
        "historical_hyperliquid_numeric": len(covered & eligible),
        "historical_dydx_conditional_numeric": len(dy_levels),
        "historical_gtrade_pinned_numeric": len(g_assets),
        "historical_orderly_public_position_numeric": len(orderly_assets),
        "historical_position_origin_numeric_union": len(position_union),
        "historical_two_or_more_distinct_primary_venues_not_time_aligned": len(multi_primary),
        "historical_coinboss_aggregate_model_numeric": len(coinboss),
        "historical_swole_aggregate_model_numeric": len(swole),
        "historical_any_numeric_union": len(numeric_union),
        "historical_no_numeric_proof": len(eligible - numeric_union),
        "current_105_live_report_coverage": None,
    },
    source_deduplication_note="BYK tracked bands and 0xArchive Hyperliquid buckets share the Hyperliquid upstream; CoinBoss/Swole aggregate models cannot establish independent primary exchange agreement.",
    missing_numeric_archive_assets=sorted(eligible - numeric_union),
    missing_numeric_archive_probe_queue=missing_queue,
    historical_two_or_more_primary_venue_assets=multi_primary,
    position_origin_archive_gap_assets=sorted(eligible - position_union),
    limits=[
        "All counts are a union of saved observations from different dates, not simultaneous current report coverage.",
        "Hyperliquid release evidence retains a checked per-asset result but not the exact source clock or payload count; never reuse it as a fresh level.",
        "dYdX and gTrade use bounded public account samples and conditional estimated prices, not a full market liquidation census.",
        "Orderly 38-market numeric snapshot is source research, not proof that each current HTX reference check or report display passed.",
        "CoinBoss and Swolecharts provide modeled levels, not observed open positions or independent primary exchange confirmation.",
        "35 assets without saved numeric proof are a prioritized audit gap, not proven to have no obtainable levels.",
    ],
)
matrix["evidence_paths"] = list(dict.fromkeys(matrix["evidence_paths"] + [
    "checkpoints/liquidation-coverage-audit-release-evidence-20261004.json",
    "checkpoints/DYDX_ACTUAL_DENSE_NATIVE_PAGE_20261007.json",
    "checkpoints/GTRADE_ACTUAL_ADDITIONAL_ASSET_LEVELS_20261007.json",
    "checkpoints/GTRADE_ACTUAL_THREE_READ_AND_HINTS_20261007.json",
    "checkpoints/LIQ_ORDERLY_PUBLIC_POSITIONS_AND_STRK_NATURAL_ARCHIVE_20261012.json",
]))
MATRIX.write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(matrix["counts"], ensure_ascii=False))
