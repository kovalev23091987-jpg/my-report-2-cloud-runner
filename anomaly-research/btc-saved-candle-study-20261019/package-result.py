"""Serialize existing completed output only; does not recalculate feature/path semantics."""
import gzip,hashlib,json,shutil,time
from pathlib import Path
P=Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
original=(P/'result.json').read_bytes();d=json.loads(original);items={};archive=Path('/private/tmp/report2-btc-saved-study-uncompressed-20261019');archive.mkdir(exist_ok=True)
for name in ['events.jsonl','historical-paths.jsonl']:
 src=P/name;b=src.read_bytes();old=d['artifacts'][name];assert sha(b)==old['sha256'] and len(b)==old['bytes'];z=gzip.compress(b,mtime=0);target=name+'.gz';(P/target).write_bytes(z);assert gzip.decompress(z)==b
 items[target]={'sha256':sha(z),'bytes':len(z),'uncompressed_sha256':sha(b),'uncompressed_bytes':len(b),'lines':old['lines'],'gzip_mtime':0};shutil.move(str(src),str(archive/name))
d['artifacts']=items;d['packaging']={'semantic_recalculation':False,'original_result_sha256_before_packaging':sha(original),'original_raw_results_retained_local':str(archive),'original_validation_result_hashes':'validation.txt retains exact uncompressed original results; new gzip bindings below are serialization only','initial_parser_failure_retained':'initial-parser-failure.txt; failure before execution/data reading. Valid UTF8 bytes and compile diagnostic passed; explicit encoding header added; exact parser cause UNKNOWN. Only unfinished new calculation repeated.'}
out=(json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode();(archive/'result-before-packaging.json').write_bytes(original);(P/'result.json').write_bytes(out)
r={'schema':'BTC_STUDY_LOSSLESS_PACKAGING_V1','recorded_ts':int(time.time()*1000),'inputs':{'result_before_packaging_sha256':sha(original),'executed_replay_py_sha256':sha((P/'replay.py').read_bytes()),'executed_features_mjs_sha256':sha((P/'compute-features.mjs').read_bytes()),'raw_validation_sha256':sha((P/'validation.txt').read_bytes()),'initial_parser_failure_sha256':sha((P/'initial-parser-failure.txt').read_bytes())},'outputs':items,'final_result_sha256':sha(out),'semantic_recalculation':False,'new_gzip_roundtrip_assertions':2,'old_suites_rerun':0};(P/'packaging.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'packaging':'lossless_only','semantic_recalculation':False,'outputs':items,'final_result_sha256':sha(out)}))
