import urllib.request,urllib.parse,pathlib,hashlib,zipfile,io,os,json
class SafeArtifactRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,request,fp,code,msg,headers,newurl):
  if urllib.parse.urlparse(newurl).scheme!="https": raise ValueError("ARTIFACT_HTTPS_REQUIRED")
  redirected=super().redirect_request(request,fp,code,msg,headers,newurl)
  if urllib.parse.urlparse(newurl).netloc!=urllib.parse.urlparse(request.full_url).netloc: redirected.remove_header("Authorization")
  return redirected
opener=urllib.request.build_opener(SafeArtifactRedirect())
url='https://api.github.com/repos/kovalev23091987-jpg/my-report-2-cloud-runner/actions/artifacts/12346799964/zip'
r=urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json'})
b=opener.open(r,timeout=60).read(262145);assert len(b)==86763 and hashlib.sha256(b).hexdigest()=='d9b80d9545092e48f5f1335a45c0387cc0931ffc23794da9b856b3bd72f548fc'
z=zipfile.ZipFile(io.BytesIO(b));v=z.read('existing-store-contract.json');assert len(v)==63758 and hashlib.sha256(v).hexdigest()=='a81a31dad230c23a3ac3819057d7b6a4c3f19479a6c3b15b963d6e65114237b3'
p=pathlib.Path('contract-input');p.mkdir();(p/'existing-store-contract.json').write_bytes(v)
o=pathlib.Path('audit-output/native-domain-connected');o.mkdir(parents=True,exist_ok=True);(o/'existing-contract-input-receipt.json').write_text(json.dumps({'existing_artifact':12346799964,'bytes':len(v),'sha256':hashlib.sha256(v).hexdigest(),'new_private_source_read':False,'private_raw_input_exported_to_artifact':False,'private_JS_executed':False})+'\n')
