import json, pathlib, subprocess, sys, time
root=pathlib.Path(sys.argv[1]).resolve()
spec=json.loads(pathlib.Path('.candidate/green64.json').read_text())
fail=[]
for item in spec:
    t=time.monotonic()
    try:
        p=subprocess.run(item['command'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60,text=True)
        ok=p.returncode==0
        status='PASS' if ok else 'FAIL'
        out=p.stdout
    except subprocess.TimeoutExpired as e:
        status='TIMEOUT'; out=(e.stdout or '') if isinstance(e.stdout,str) else ''
        ok=False
    print(f"GREEN64 {item['test']} {status} {time.monotonic()-t:.2f}s")
    if not ok:
        print(out[-5000:])
        fail.append(item['test'])
if fail:
    print('GREEN64_RESULT=FAIL',','.join(fail)); sys.exit(1)
print('GREEN64_RESULT=PASS count=64')
