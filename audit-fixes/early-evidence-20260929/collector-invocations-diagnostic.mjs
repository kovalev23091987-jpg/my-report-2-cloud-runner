import fs from 'node:fs';

const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const query=`query GetWorkersAnalytics($accountTag: string, $datetimeStart: string, $datetimeEnd: string, $scriptName: string) {
  viewer { accounts(filter: {accountTag: $accountTag}) {
    workersInvocationsAdaptive(limit: 500, filter: {scriptName: $scriptName, datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd}) {
      sum { requests errors subrequests }
      quantiles { cpuTimeP50 cpuTimeP99 }
      dimensions { datetime scriptName status }
    }
  } }
}`;
const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{
  method:'POST',headers:{Authorization:`Bearer ${required('CLOUDFLARE_API_TOKEN')}`,'Content-Type':'application/json'},
  body:JSON.stringify({query,variables:{accountTag:required('CLOUDFLARE_ACCOUNT_ID'),datetimeStart:'2026-09-29T08:15:00.000Z',datetimeEnd:'2026-09-29T09:25:00.000Z',scriptName:'my-report-2-hub'}}),
  signal:AbortSignal.timeout(45000)
});
const payload=await response.json();
if(!response.ok||payload.errors?.length)throw new Error(`CLOUDFLARE_ANALYTICS_UNAVAILABLE_HTTP_${response.status}:${(payload.errors||[]).map(row=>String(row.message).slice(0,120)).join('|')}`);
const rows=payload.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
if(!Array.isArray(rows))throw new Error('CLOUDFLARE_ANALYTICS_ROWS_ABSENT');
const result={schema:'report2-collector-invocations-read-only-v1',window_start:'2026-09-29T08:15:00Z',window_end:'2026-09-29T09:25:00Z',script:'my-report-2-hub',rows:rows.map(row=>({datetime:row.dimensions?.datetime,status:row.dimensions?.status,requests:row.sum?.requests,errors:row.sum?.errors,subrequests:row.sum?.subrequests,cpu_p99:row.quantiles?.cpuTimeP99}))};
fs.writeFileSync(process.argv[2]||'report2-collector-invocations.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'CLOSED_READ_ONLY',count:result.rows.length,errors:result.rows.reduce((n,row)=>n+Number(row.errors||0),0)}));
