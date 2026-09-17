from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
w=(root/'src/worker.js').read_text()
def n(name):
 m=re.search(rf'const {name} = (\d+);',w); assert m,name; return int(m.group(1))
stage0=n('STAGE0_EXTERNAL_REQUESTS'); deep=n('DEEP_CHECK_EXTERNAL_REQUESTS'); smart=n('SMART_MONEY_EXTERNAL_REQUESTS'); limit=n('WORKERS_FREE_EXTERNAL_LIMIT'); reserve=n('EXTERNAL_REQUEST_RESERVE')
assert (stage0,deep,smart,limit,reserve)==(4,39,1,50,6)
assert stage0+deep+smart+reserve==limit
assert (limit-stage0-reserve)//(deep+smart)==1
assert w.count('await fetchByKaranteliSmartMoneyRaw({')==1
print({'ok':True,'suite':'tz101-smart-money-budget','stage0':stage0,'deep_check':deep,'smart_money':smart,'reserve':reserve,'total_envelope':stage0+deep+smart+reserve,'resource_max':1})
