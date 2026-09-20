#!/usr/bin/env python3
"""Guarded owner-run installation. No Cloudflare deployment; no secrets printed."""
import argparse,datetime,hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,time,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
REPO='kovalev23091987-jpg/my-report-2-cloud-runner'
BASE='f12d7c12441c3ddd710b2fd333d90ab402fa6785'
class SafetyFailure(RuntimeError): pass
class ObservationFailure(RuntimeError): pass
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def candidate_id():
    h=hashlib.sha256()
    for name in ['runner/telegram-output.mjs','runner/telegram-info-runtime.mjs','runner/runner-main.mjs']:
        h.update(name.encode());h.update(b'\0');h.update(bytes.fromhex(sha(ROOT/'candidate'/name)))
    return h.hexdigest()
def verify_proof(p,head,candidate,mode):
    if p.get('schema')!='telegram-info-proof-v1' or p.get('head')!=head or p.get('candidate_sha')!=candidate:raise SafetyFailure('PROOF_IDENTITY_MISMATCH')
    if any(p.get(k) is not False for k in ['validated_signal','execution','automatic_weight_tuning','v3_telegram_network_enabled']):raise SafetyFailure('LIVE_SAFETY_FLAG')
    if p.get('live_probability') is not None:raise SafetyFailure('LIVE_PROBABILITY')
    o=p.get('output',{})
    if o.get('final_chain_auto') is not False:raise SafetyFailure('FINAL_CHAIN_AUTO_NOT_OFF')
    if mode=='no-send':
        if o.get('enabled') is not False or o.get('info_enabled') is not False:raise SafetyFailure('NO_SEND_GATE_NOT_CLOSED')
    else:
        if o.get('info_enabled') is not True:raise SafetyFailure('INFO_NOT_ENABLED')
        for name in ['morning','early_info']:
            state=o.get(name,{})
            if 'ERROR' in state.get('status','') or any(k in state.get('status','') for k in ['ACK_UNKNOWN','READBACK_FAILED','CORRUPT','IDENTITY_COLLISION','CONFLICT']):raise SafetyFailure('INFO_RUNTIME_NOT_CLOSED:'+state.get('status','UNKNOWN'))
        if mode=='test':
            m=o.get('morning',{})
            if m.get('status') not in ['SENT','ALREADY_SENT'] or m.get('delivery_confirmed') is not True or not str(m.get('message_id','')).isdigit():raise SafetyFailure('DELIVERY_NOT_CONFIRMED')
    return True

def verify_natural_log(text):
    if not isinstance(text,str) or 'REPORT2_RUNNER_FATAL' in text:raise SafetyFailure('NATURAL_LOG_FATAL_OR_UNKNOWN')
    required=['TELEGRAM_OUTPUT_LAYER','"info_enabled":true','"final_chain_auto":false','V3_TELEGRAM_DELIVERY_SIDECAR','"network_send":false','"ok":true']
    if any(token not in text for token in required):raise SafetyFailure('NATURAL_LOG_SAFETY_MARKER_MISSING')
    return True

def preflight_workflow():
    return '''name: Report2 informational repair preflight
on:
  push:
    branches: ["report2-info-repair-preflight-*"]
permissions:
  contents: read
concurrency:
  group: my-report-2-production-cycle
  cancel-in-progress: false
jobs:
  check:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    env:
      REPORT2_D1_BRIDGE_URL: ${{ secrets.REPORT2_D1_BRIDGE_URL }}
      REPORT2_D1_BRIDGE_TOKEN: ${{ secrets.REPORT2_D1_BRIDGE_TOKEN }}
      REPORT2_PAYLOAD_KEY: ${{ secrets.REPORT2_PAYLOAD_KEY }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - name: Exact isolation and payload
        shell: bash
        run: |
          set -Eeuo pipefail
          git fetch origin main --depth=1
          test "$(git rev-parse origin/main)" = f12d7c12441c3ddd710b2fd333d90ab402fa6785
          test "$(git rev-parse HEAD^)" = f12d7c12441c3ddd710b2fd333d90ab402fa6785
          python3 .info-repair/tools/owner.py --self-test
          mkdir -p .info-repair/runtime
          node runner/payload-crypto.mjs decrypt payload/report2-runtime.enc "$REPORT2_PAYLOAD_KEY" .info-repair/runtime/payload.tar.gz
          tar -xzf .info-repair/runtime/payload.tar.gz -C .info-repair/runtime
          rm .info-repair/runtime/payload.tar.gz
          test "$(sha256sum .info-repair/runtime/src/worker.js | cut -d' ' -f1)" = 7a3c73770e516db9e7ef17ca3e582947769c0fa3f8cb2814e915ee0303695a83
      - name: Read-only schema gate
        run: node .info-repair/tools/d1-preflight.mjs --check
      - name: Bounded additive index and exact readback
        run: node .info-repair/tools/d1-preflight.mjs --apply-index
      - name: Main unchanged
        run: |
          git fetch origin main --depth=1
          test "$(git rev-parse origin/main)" = f12d7c12441c3ddd710b2fd333d90ab402fa6785
      - uses: actions/upload-artifact@v4
        if: ${{ always() }}
        with:
          name: report2-info-preflight-proof
          path: .info-repair/proof/*.json
          if-no-files-found: warn
          retention-days: 30
'''

def self_test():
    manifest=json.loads((ROOT/'MANIFEST.json').read_text())
    if manifest.get('candidate_id')!=candidate_id():raise SafetyFailure('CANDIDATE_ID_MISMATCH')
    workflow=(ROOT/'candidate/.github/workflows/report2.yml').read_text()
    if ('REPORT2_TELEGRAM_INFO_TEST_ID: "'+manifest['candidate_id']+'"') not in workflow:raise SafetyFailure('WORKFLOW_CANDIDATE_ID_MISMATCH')
    for name,digest in manifest['sha256'].items():
        p=ROOT/name
        if not p.is_file() or sha(p)!=digest:raise SafetyFailure('PACKAGE_CHECKSUM:'+name)
    for name in manifest['production_files']:
        if name not in ['runner/telegram-output.mjs','runner/telegram-info-runtime.mjs','runner/runner-main.mjs','.github/workflows/report2.yml']:raise SafetyFailure('PRODUCT_SCOPE')
    for p in (ROOT/'candidate/runner').glob('*.mjs'):subprocess.run(['node','--check',str(p)],check=True,capture_output=True)
    for name in ['telegram-info-sqlite.test.mjs','preflight-contract.test.mjs','final-chain-regression.mjs']:
        command=['node',str(ROOT/'tests'/name)]
        r=subprocess.run(command,text=True,capture_output=True)
        if r.returncode:raise SafetyFailure('LOCAL_TEST_FAIL:'+name+'\n'+r.stderr[-1000:])
    r=subprocess.run([sys.executable,str(ROOT/'tests/owner-safety.test.py')],text=True,capture_output=True)
    if r.returncode:raise SafetyFailure('LOCAL_TEST_FAIL:owner-safety.test.py\n'+r.stderr[-1000:])
    print('PACKAGE_SELF_TEST=PASS',flush=True);return manifest

class Installer:
    def __init__(self,manifest):
        self.m=manifest;self.tag=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
        self.out=pathlib.Path.home()/'Downloads'/('MY_REPORT_2_INFO_REPAIR_RESULT_'+self.tag);self.out.mkdir(parents=True)
        self.tmp=pathlib.Path(tempfile.mkdtemp(prefix='report2-info-repair-'));self.repo=self.tmp/'repo';self.promoted=None;self.events=[]
    def log(self,key,value):
        print(key+'='+str(value),flush=True);self.events.append({'key':key,'value':value});(self.out/'PROGRESS.json').write_text(json.dumps(self.events,ensure_ascii=False,indent=2))
    def cmd(self,args,*,cwd=None,check=True):
        p=subprocess.run(args,cwd=cwd,text=True,capture_output=True,timeout=180)
        if check and p.returncode:raise ObservationFailure('COMMAND_FAILED:'+args[0]+':'+p.stderr[-1500:])
        return p
    def git(self,*args,check=True):return self.cmd(['git',*args],cwd=self.repo,check=check).stdout.strip()
    def api(self,route):
        for attempt in range(5):
            p=self.cmd(['gh','api',route],check=False)
            if not p.returncode:return json.loads(p.stdout)
            time.sleep(min(2**attempt,10))
        raise ObservationFailure('GITHUB_READ_UNAVAILABLE:'+route)
    def current(self):return self.api('repos/'+REPO+'/git/ref/heads/main')['object']['sha']
    def exact_main(self,wanted):
        actual=self.current()
        if actual!=wanted:raise SafetyFailure('MAIN_MOVED:'+actual)
    def commit(self,message):
        self.git('-c','user.name=Report2 Repair','-c','user.email=report2-repair@users.noreply.github.com','commit','-m',message)
        return self.git('rev-parse','HEAD')
    def push(self,ref):
        p=self.cmd(['git','push','origin',ref],cwd=self.repo,check=False)
        if not p.returncode:return
        # A lost client response may follow a successful push. Observe the
        # remote ref before stopping; never repeat an ambiguous mutation.
        dst=ref.split(':',1)[-1] if ':' in ref else ref
        intended=ref.split(':',1)[0] if ':' in ref else 'HEAD'
        intended_sha=self.git('rev-parse',intended)
        remote=self.git('ls-remote','--heads','origin','refs/heads/'+dst,check=False).split()
        if len(remote)>=1 and remote[0]==intended_sha:return
        raise ObservationFailure('PUSH_RESULT_UNCONFIRMED:'+ref)
    def runs(self,branch,event,head):
        data=self.api('repos/'+REPO+'/actions/runs?branch='+branch+'&event='+event+'&per_page=50')
        return [r for r in data['workflow_runs'] if r['head_sha']==head]
    def await_run(self,rid):
        deadline=time.time()+1800
        while time.time()<deadline:
            r=self.api('repos/'+REPO+'/actions/runs/'+str(rid))
            if r['status']=='completed':
                if r['conclusion']!='success':raise ObservationFailure('REMOTE_RUN_FAILED:'+str(rid)+':'+str(r['conclusion']))
                return r
            time.sleep(10)
        raise ObservationFailure('REMOTE_RUN_TIMEOUT:'+str(rid))
    def discover_run(self,branch,event,head,before=()):
        deadline=time.time()+360
        while time.time()<deadline:
            found=[r for r in self.runs(branch,event,head) if r['id'] not in before]
            if len(found)>1:raise ObservationFailure('AMBIGUOUS_RUN_ID_NO_REDISPATCH')
            if found:return found[0]['id']
            time.sleep(5)
        raise ObservationFailure('DISPATCH_NOT_CONFIRMED_NO_RETRY')
    def dispatch(self,branch,head,label,mode):
        before={r['id'] for r in self.runs(branch,'workflow_dispatch',head)}
        field='telegram_report_test=true' if mode=='test' else 'controlled_no_telegram=true'
        # Never retry this mutation when its response is ambiguous.
        self.cmd(['gh','workflow','run','report2.yml','-R',REPO,'--ref',branch,'-f','reason='+label+' '+self.tag,'-f',field],check=False)
        rid=self.discover_run(branch,'workflow_dispatch',head,before);self.log(label+'_RUN',rid);self.await_run(rid)
        self.read_proof(rid,head,mode);return rid
    def artifact(self,rid,name):
        dest=self.out/(str(rid)+'-'+name);dest.mkdir(exist_ok=True)
        for attempt in range(5):
            p=self.cmd(['gh','run','download',str(rid),'-R',REPO,'--name',name,'--dir',str(dest)],check=False)
            if p.returncode==0:return dest
            if list(dest.rglob('*.json')):return dest
            time.sleep(5)
        raise ObservationFailure('ARTIFACT_UNAVAILABLE:'+str(rid))
    def read_proof(self,rid,head,mode):
        dest=self.artifact(rid,'report2-telegram-info-proof');p=list(dest.rglob('telegram-info-proof.json'))
        if len(p)!=1:raise ObservationFailure('PROOF_FILE_AMBIGUOUS')
        proof=json.loads(p[0].read_text());verify_proof(proof,head,self.m['candidate_id'],mode)
    def read_natural_log(self,rid):
        for attempt in range(5):
            p=self.cmd(['gh','run','view',str(rid),'-R',REPO,'--log'],check=False)
            if p.returncode==0:return verify_natural_log(p.stdout)
            time.sleep(5)
        raise ObservationFailure('NATURAL_LOG_UNAVAILABLE:'+str(rid))
    def rollback(self):
        if not self.promoted or self.current()!=self.promoted:self.log('ROLLBACK','NOT_ATTEMPTED_MAIN_NOT_OWNED');return
        self.git('fetch','origin','main');self.git('switch','--detach',self.promoted)
        self.git('-c','user.name=Report2 Repair Rollback','-c','user.email=report2-repair@users.noreply.github.com','revert','--no-edit',self.promoted)
        if self.git('rev-parse','HEAD^{tree}')!=self.git('rev-parse',BASE+'^{tree}'):raise SafetyFailure('ROLLBACK_TREE_MISMATCH')
        self.push('HEAD:main');self.log('ROLLBACK','EXACT_BASE_TREE_RESTORED_INDEX_PRESERVED')
    def install(self):
        self.cmd(['gh','auth','status']);self.cmd(['gh','repo','clone',REPO,str(self.repo),'--','--quiet']);self.exact_main(BASE)
        self.git('fetch','origin','main');self.git('switch','--detach',BASE)
        for p,digest in self.m['protected_base'].items():
            if sha(self.repo/p)!=digest:raise SafetyFailure('BASE_PROTECTED_FILE_CHANGED:'+p)
        backup='report2-info-repair-backup-'+self.tag;self.git('branch',backup,BASE);self.push(backup);self.log('BACKUP_BRANCH',backup)
        pre='report2-info-repair-preflight-'+self.tag;self.git('switch','-c',pre,BASE)
        shutil.copytree(ROOT,self.repo/'.info-repair',ignore=shutil.ignore_patterns('evidence','__pycache__','*.zip','*.command'))
        # Evidence files hashed by the manifest are needed by package self-test.
        shutil.copytree(ROOT/'evidence',self.repo/'.info-repair/evidence',dirs_exist_ok=True)
        workflow=self.repo/'.github/workflows/report2-info-repair-preflight.yml';workflow.write_text(preflight_workflow())
        self.git('add','.info-repair','.github/workflows/report2-info-repair-preflight.yml');head=self.commit('Validate informational repair and bounded additive index')
        self.push(pre);rid=self.discover_run(pre,'push',head);self.log('PREFLIGHT_RUN',rid);self.await_run(rid)
        proof=list(self.artifact(rid,'report2-info-preflight-proof').rglob('schema-index-proof.json'))
        if len(proof)!=1:raise ObservationFailure('SCHEMA_PROOF_MISSING')
        p=json.loads(proof[0].read_text())
        if p.get('status')!='PASS' or p.get('head')!=head or p.get('index_present') is not True or p.get('legacy_unchanged') is not True or p.get('telegram_sent') is not False:raise SafetyFailure('SCHEMA_PROOF_INVALID')
        self.exact_main(BASE);branch='report2-info-repair-validate-'+self.tag;self.git('switch','-c',branch,BASE)
        for name in self.m['production_files']:
            dest=self.repo/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'candidate'/name,dest)
        self.git('add',*self.m['production_files']);candidate=self.commit('Repair informational Telegram reservations; keep trading outputs off')
        if sorted(self.git('diff-tree','--no-commit-id','--name-only','-r',candidate).splitlines())!=sorted(self.m['production_files']):raise SafetyFailure('PROMOTION_FILE_SCOPE')
        self.push(branch);self.log('CANDIDATE_HEAD',candidate)
        self.dispatch(branch,candidate,'VALIDATION_NO_SEND','no-send');self.dispatch(branch,candidate,'DELIVERY_TEST','test');self.dispatch(branch,candidate,'REHEARSAL_NO_SEND','no-send')
        self.exact_main(BASE)
        for name in self.m['production_files']:
            if sha(self.repo/name)!=self.m['sha256']['candidate/'+name]:raise SafetyFailure('CANDIDATE_BYTES_DRIFT')
        result=self.cmd(['git','push','origin',candidate+':main'],cwd=self.repo,check=False)
        actual=self.current()
        if actual!=candidate:raise ObservationFailure('PROMOTION_NOT_CONFIRMED:'+actual)
        self.promoted=candidate;self.log('PROMOTION_HEAD',candidate)
        self.dispatch('main',candidate,'PRODUCTION_NO_SEND_SMOKE','no-send')
        natural=[];deadline=time.time()+5400
        while len(natural)<3 and time.time()<deadline:
            self.exact_main(candidate)
            for run in sorted(self.runs('main','schedule',candidate),key=lambda r:r['id']):
                if run['id'] in natural or run['status']!='completed':continue
                if run['conclusion']!='success':raise ObservationFailure('NATURAL_RUN_FAILED:'+str(run['id']))
                self.read_natural_log(run['id']);natural.append(run['id']);self.log('NATURAL_PASS',run['id'])
                if len(natural)==3:break
            if len(natural)<3:time.sleep(20)
        if len(natural)!=3:raise ObservationFailure('NATURAL_PROOF_INCOMPLETE')
        self.exact_main(candidate);self.git('fetch','origin','main')
        if self.git('rev-parse','origin/main')!=candidate:raise SafetyFailure('FINAL_MAIN_DRIFT')
        result={'status':'INFORMATIONAL_REPAIR_PRODUCTION_CLOSED','main':candidate,'base':BASE,'backup':backup,'natural_runs':natural,'candidate_id':self.m['candidate_id'],'live_probability':False,'validated_signal':False,'execution':False,'automatic_weight_tuning':False,'statistically_validated':False,'scope':'informational repair; broader requirement coverage remains in report','events':self.events}
        (self.out/'FINAL_PROOF.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        proof_branch='report2-info-repair-proof-'+self.tag
        self.git('switch','-c',proof_branch,candidate);(self.repo/'proof').mkdir(exist_ok=True);shutil.copy2(self.out/'FINAL_PROOF.json',self.repo/'proof/INFO_REPAIR_FINAL_PROOF.json');self.git('add','proof/INFO_REPAIR_FINAL_PROOF.json');self.commit('Record exact informational repair production proof');self.push('HEAD:'+proof_branch);self.log('FINAL_STATUS',result['status'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--self-test',action='store_true');parser.add_argument('--install-informational',action='store_true');args=parser.parse_args()
    manifest=self_test()
    if args.self_test:return
    if not args.install_informational:raise SafetyFailure('EXPLICIT_INSTALL_FLAG_REQUIRED')
    inst=Installer(manifest);inst.log('RESULT_DIR',str(inst.out))
    try:inst.install()
    except SafetyFailure as e:
        inst.log('SAFETY_STOP',str(e))
        if inst.promoted:inst.rollback()
        raise
    except Exception as e:
        inst.log('OBSERVATION_OR_ACCESS_STOP',str(e));inst.log('CURRENT_PRODUCTION_PROVEN',False)
        # Loss of logs/network is not evidence of a safety defect. Never revert a
        # different owner's main or claim successful closure without proof.
        raise
    finally:inst.log('RESULT_DIR',str(inst.out))
if __name__=='__main__':
    try:main()
    except Exception as e:print('FINAL_STATUS=FAIL_CLOSED_OR_NEEDS_OBSERVATION\nREASON='+str(e),file=sys.stderr);sys.exit(1)
