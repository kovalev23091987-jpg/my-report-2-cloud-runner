#!/usr/bin/env python3
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'manifests/STAGE39_PRESERVATION.json').read_text())
worker=(root/'src/worker.js').read_text()

def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha(p): return sha_bytes(Path(p).read_bytes())
def extract_block(src, marker):
    start=src.index(marker); brace=src.index('{',start)
    depth=0; i=brace; ins=ind=intpl=False; esc=False
    while i<len(src):
        c=src[i]
        if esc: esc=False; i+=1; continue
        if c=='\\': esc=True; i+=1; continue
        if not ind and not intpl and c=="'": ins=not ins; i+=1; continue
        if not ins and not intpl and c=='"': ind=not ind; i+=1; continue
        if not ins and not ind and c=='`': intpl=not intpl; i+=1; continue
        if not(ins or ind or intpl):
            if c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: return src[start:i+1]
        i+=1
    raise ValueError('unterminated '+marker)

assert 'runMultiWaveCampaignShadowCycle' in worker
assert 'multiWaveCampaignDataPlaneSummary' in worker
assert 'multi_wave_campaign_shadow' in worker
assert sha_bytes(extract_block(worker,'async function sendTelegramMessage').encode()) == manifest['telegram_sender_sha256'], 'Telegram sender changed'
assert sha_bytes(extract_block(worker,'if (url.pathname === "/telegram-test")').encode()) == manifest['telegram_test_route_sha256'], '/telegram-test route changed'
assert worker.count('fetch(') == manifest['worker_fetch_token_count'], 'worker direct network call count changed'
for rel,expected in manifest['core_sha256'].items():
    assert sha(root/rel)==expected,f'core changed: {rel}'
for rel in ['src/multi-wave-campaign-engine.mjs','src/multi-wave-campaign-runtime.mjs']:
    txt=(root/rel).read_text()
    assert 'fetch(' not in txt, f'new direct network call: {rel}'
    for forbidden in ['sendTelegramMessage','TELEGRAM_BOT_TOKEN','trading_execution: true','live_signal: true','validated_signal: true']:
        assert forbidden not in txt, f'forbidden token {forbidden} in {rel}'
sql=(root/'migrations/20260913_multi_wave_campaign_shadow.sql').read_text().upper()
for forbidden in ['ALTER TABLE','DROP TABLE','DELETE FROM','INSERT INTO']:
    assert forbidden not in sql, f'non-additive migration token {forbidden}'
assert sql.count('CREATE TABLE IF NOT EXISTS')==2
assert 'MULTI_WAVE_CAMPAIGN_TRANSITION_SHADOW' not in sql, 'transition history must stay in bounded campaign_json to preserve D1 budget'
print('PASS stage391-multi-wave-static')
