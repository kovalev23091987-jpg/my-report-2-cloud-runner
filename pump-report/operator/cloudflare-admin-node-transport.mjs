// Bounded child transport only. The parent owns admission, call counting and
// exact code/settings/schedule guards. Credentials arrive through stdin.
let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>8388608)throw Error('ADMIN_INPUT_BOUND');}
const a=JSON.parse(input),u=new URL(a.url);
if(u.origin!=='https://api.cloudflare.com'||!/^\/client\/v4\/accounts\/70ee0af85191ea470e74c7383fdec772\/workers\/scripts\/(my-report-2-hub|my-report-2-free-history|my-report-2-liq-forecast-history)(\/settings|\/schedules|\/content)?$/.test(u.pathname)||!['GET','PATCH','PUT'].includes(a.method))throw Error('ADMIN_ROUTE');
const r=await fetch(u,{method:a.method,headers:a.headers,body:a.body===null?undefined:Buffer.from(a.body,'base64'),redirect:'manual',signal:AbortSignal.timeout(40000)});
let count=0;const chunks=[];for await(const chunk of r.body){count+=chunk.length;if(count>10485760)throw Error('ADMIN_RESPONSE_BOUND');chunks.push(chunk);}
if(r.status!==200)throw Error('ADMIN_HTTP_'+r.status);
process.stdout.write(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.concat(chunks).toString('base64')}));
