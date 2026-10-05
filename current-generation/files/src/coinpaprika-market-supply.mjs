import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {verifyCoinpaprikaProviderReference} from './coinpaprika-htx-identity.mjs';
export function normalizeCoinpaprikaMarketSupply({reference,ticker,contract,observed_ts=Date.now()}={}){
 if(!verifyCoinpaprikaProviderReference(reference,contract,observed_ts)||ticker?.id!==reference.coinpaprika_id||ticker?.symbol!==contract.replace(/-USDT$/,''))return{status:'EXACT_PROVIDER_ASSET_AND_QUOTE_REQUIRED',evidence:[]};
 const ts=Date.parse(ticker.last_updated);
 if(!Number.isSafeInteger(ts)||ts>observed_ts||observed_ts-ts>900000)return{status:'EXACT_FRESH_PROVIDER_SUPPLY_RECORD_REQUIRED',evidence:[]};
 const values={};for(const key of ['circulating_supply','total_supply','max_supply']){const n=ticker[key];if(typeof n==='number'&&Number.isFinite(n)&&n>0)values[key]=n;}
 if(!Object.keys(values).length)return{status:'NO_REPORTED_POSITIVE_SUPPLY_FIELDS',evidence:[]};
 if(values.circulating_supply&&values.total_supply&&values.circulating_supply>values.total_supply||values.total_supply&&values.max_supply&&values.total_supply>values.max_supply)return{status:'CONTRADICTORY_PROVIDER_SUPPLY_FIELDS',evidence:[]};
 const evidence=buildEvidenceV2({provider_id:'COINPAPRIKA_SECTOR',upstream_id:'COINPAPRIKA_AGGREGATED_VENUES',asset_id:reference.asset_id,htx_contract:contract,block_id:'N02',metric_family:'PROVIDER_AGGREGATED_SUPPLY_CONTEXT',origin_event_id:`${reference.coinpaprika_id}:supply:${ts}`,dependency_group:`COINPAPRIKA_ASSET:${reference.coinpaprika_id}:${ts}`,source_ts:ts,observed_ts,expires_at:Math.min(observed_ts+300000,ts+900000),coverage_fraction:0,coverage_status:'REPORTED_PROVIDER_SUPPLY_NOT_FINALIZED_CHAIN',directional_strength:null,risk_strength:null,extra:{provider_reference:reference,provider_ticker:{id:ticker.id,symbol:ticker.symbol,last_updated:ticker.last_updated,...values},supply_values:values,supply_unit:'PROVIDER_REPORTED_ASSET_UNITS',source_clock_policy:'PROVIDER_RECORD_TIMESTAMP_NOT_CHAIN_FINALITY',chain_finality_verified:false,supply_change_or_unlock_inferred:false,entry_authorized:false,score_contribution:0}});
 return{status:'CLOSED_AGGREGATED_SUPPLY_CONTEXT',evidence:[evidence],summary:values};
}
