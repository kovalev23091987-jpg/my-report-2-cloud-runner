import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(process.env.REPORT2_TEST_RUNTIME+'/src/'):new URL('../current-generation/files/src/',import.meta.url);
const {auditExactN11RenderedSourceBindings}=await import(new URL('execution-report-context.mjs',root));
let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>8*1024*1024)throw Error('BOUNDED_ORIGINAL_REPORT_REQUIRED');}
console.log(JSON.stringify(auditExactN11RenderedSourceBindings(JSON.parse(text))));
