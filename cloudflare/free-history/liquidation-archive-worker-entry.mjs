import {runPrivateForecastConsumer} from './private-forecast-consumer.mjs';
import {privateCanonicalBindings} from '../../current-generation/files/src/private-canonical-history.mjs';

export default {
  async fetch(){return new Response('Not found',{status:404});},
  async scheduled(controller,env){
    const bindings=privateCanonicalBindings(env);
    const result=await runPrivateForecastConsumer({source_db:env?.DATA_DB,archive_db:env?.ARCHIVE_DB,private_db:bindings.archive_db,private_dbs:bindings.archive_dbs,scheduled_ts:controller?.scheduledTime??Date.now()});
    console.log('REPORT2_LIQ_FORECAST_ARCHIVE',JSON.stringify(result));
  }
};
