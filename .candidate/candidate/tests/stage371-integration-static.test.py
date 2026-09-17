#!/usr/bin/env python3
import sys, pathlib, json
p=pathlib.Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
checks={
 'version':s.count('3.7.1-cross-venue-liquidation-shadow')==3,
 'core_once':s.count('STAGE371_CROSS_VENUE_LIQUIDATION_INTELLIGENCE')==1,
 'collector_once':s.count('LIQUIDATION_INTELLIGENCE_API.collectCrossVenueLiquidationIntelligence')==1,
 'persist_once':s.count('LIQUIDATION_INTELLIGENCE_API.persistShadow')==1,
 'dataplane_once':s.count('LIQUIDATION_INTELLIGENCE_API.dataPlaneSummary')==1,
 'secret_reference': 'env?.BYKARANTELI_API_KEY' in s,
 'no_secret_literal': 'Bearer free-key' not in s and 'BYKARANTELI_API_KEY="' not in s,
 'projected_realized_note': 'projected liquidation clusters, factual realized liquidations and cross-source consensus physically/logically separate' in s,
 'health_module':'cross_venue_liquidation_intelligence: true' in s,
 'weights_unchanged': all(x in s for x in ['CROSS_EXCHANGE_DERIVATIVES: 35','MARKET_STRENGTH_SPOT: 30','SMART_MONEY_ONCHAIN: 20','SUPPORTING_RISK: 15']),
 'no_synthetic_heatmap':'synthetic_leverage_heatmap_generated: false' in s,
 'provider_alias_confirmation':'providerAliasVerified = !responseMismatch' in s and 'symbolRegistry.exact_match === true' in s,
 'lifecycle_state_fail_closed':'lifecycleStateEligible' in s and 'record?.alias_verified === true' in s and 'record?.projected_freshness === "CURRENT"' in s,
}
assert all(checks.values()),checks
print(json.dumps({'ok':True,'suite':'stage371-integration-static','checks':checks},indent=2))
