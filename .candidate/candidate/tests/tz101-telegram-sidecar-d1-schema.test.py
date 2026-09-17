import hashlib, json, sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIG=ROOT/'migrations/20260917_final_decision_telegram_context_shadow.sql'
FINAL=ROOT/'migrations/20260914_final_decision_integration_shadow.sql'
con=sqlite3.connect(':memory:')
con.executescript(MIG.read_text())
obs=1789639171000
c={
 'schema':'telegram-final-context-v1','score_semantics':'FOUR_BLOCK_35_30_20_15_V1','is_probability':False,
 'decision_id':'FDI:X','material_digest':'abcdef0123456789','snapshot_id':'SNAP:X','observation_ts':obs,'direction':'LONG',
 'decision_evidence_receipt_id':'DER:X','full_evidence_receipt_id':'FER:X','safety_gate_receipt_id':'SGR:X',
 'score_lower_bound':78,'score_upper_bound':78,
 'weighted_blocks':[
   {'id':'DERIVATIVES_CROSS_VENUE','weight':35,'state':'CLOSED','contribution_lower':28,'contribution_upper':28},
   {'id':'RELATIVE_STRENGTH_SPOT','weight':30,'state':'CLOSED','contribution_lower':22,'contribution_upper':22},
   {'id':'SMART_MONEY_ONCHAIN','weight':20,'state':'CLOSED','contribution_lower':16,'contribution_upper':16},
   {'id':'SUPPORTING_RISK','weight':15,'state':'CLOSED','contribution_lower':12,'contribution_upper':12}],
 'valid_until_ts':obs+600000,'entry':{'area':'100–101','target':'108','invalidation':'97'},
 'funding':{'rate_pct':-0.02,'interval_hours':8,'observed_ts':obs-30000},'reasons':['a','b'],'risk':'r'
}
raw=json.dumps(c,separators=(',',':'),ensure_ascii=False)
digest=hashlib.sha256(raw.encode()).hexdigest()
row=('FTC:X','FDI:X','abcdef0123456789','SNAP:X','X-USDT',obs,'LONG','DER:X','FER:X','SGR:X',
 'telegram-final-context-v1','FOUR_BLOCK_35_30_20_15_V1',78,78,obs+600000,raw,digest,'CLOSED',obs+1000)
con.execute('''INSERT INTO final_decision_telegram_context_shadow
(context_id,decision_id,material_digest,snapshot_id,contract_code,observation_ts,direction,decision_evidence_receipt_id,full_evidence_receipt_id,safety_gate_receipt_id,score_schema,score_semantics,score_lower_bound,score_upper_bound,valid_until_ts,context_json,context_digest,status,persisted_ts)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',row)
assert con.execute('select count(*) from final_decision_telegram_context_shadow').fetchone()[0]==1
# Immutable sidecar.
try:
 con.execute("update final_decision_telegram_context_shadow set score_lower_bound=79 where decision_id='FDI:X'")
 raise AssertionError('update unexpectedly allowed')
except sqlite3.IntegrityError as e:
 assert 'IMMUTABLE' in str(e)
# Mismatched JSON binding must fail.
bad=dict(c);bad['snapshot_id']='OTHER';badraw=json.dumps(bad,separators=(',',':'),ensure_ascii=False)
baddigest=hashlib.sha256(badraw.encode()).hexdigest()
badrow=list(row);badrow[0]='FTC:Y';badrow[1]='FDI:Y';badrow[3]='SNAP:Y';badrow[15]=badraw;badrow[16]=baddigest
# also align context decision id except deliberately snapshot mismatch
bad['decision_id']='FDI:Y';badraw=json.dumps(bad,separators=(',',':'),ensure_ascii=False);badrow[15]=badraw;badrow[16]=hashlib.sha256(badraw.encode()).hexdigest()
try:
 con.execute('''INSERT INTO final_decision_telegram_context_shadow
(context_id,decision_id,material_digest,snapshot_id,contract_code,observation_ts,direction,decision_evidence_receipt_id,full_evidence_receipt_id,safety_gate_receipt_id,score_schema,score_semantics,score_lower_bound,score_upper_bound,valid_until_ts,context_json,context_digest,status,persisted_ts)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',badrow)
 raise AssertionError('binding mismatch unexpectedly allowed')
except sqlite3.IntegrityError as e:
 assert 'BINDING_GUARD' in str(e)
# The existing Final Decision schema guard remains exactly 48 fields and is not edited to admit Telegram context.
final_text=FINAL.read_text()
assert 'COUNT(*) FROM json_each(NEW.decision_json))!=48' in final_text
assert 'telegram_context_v1' not in final_text
print('PASS TZ10.1 Telegram sidecar schema, immutability, binding guard, and Final Decision JSON isolation')
