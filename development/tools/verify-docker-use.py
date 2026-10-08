"""Verify local Docker UI with KB files and synthetic AI commands.

Run from repo root: python3 development/tools/verify-docker-use.py <new-result-dir> <orca-page-id>
Open localhost:8080 in Orca first. Raw artifacts stay in private.local; no Bedrock calls.
"""
import json,subprocess,xml.etree.ElementTree as E,hashlib,sys
from pathlib import Path
page=sys.argv[2]
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);assert not (out/'browser-use-proof.json').exists(), 'Keep previous evidence; choose a new result directory';private=out/'private.local';private.mkdir(exist_ok=True)
manifest=json.loads(Path('development/fixtures/baseline/kb-inputs.json').read_text())['inputs']
def cmd(*args):
 r=json.loads(subprocess.check_output(['orca',*args,'--page',page,'--json'],text=True));assert r['ok'],str(r.get('error'));return r['result']
def evaluate(js):return json.loads(cmd('eval','--expression',js)['result'])
def settled():
 return evaluate('''(async()=>{for(let i=0;i<400;i++){if(!document.querySelector('#btn-open').disabled&&!document.querySelector('#chat-messages [id^="loading-"]'))return JSON.stringify(true);await new Promise(r=>setTimeout(r,50));}throw new Error('UI busy timeout')})()''')
def upload(source):
 settled();evaluate('document.querySelector("#diagram-file-input").hidden=false;JSON.stringify(true)')
 snapshot=cmd('snapshot');(private/'last-snapshot.json').write_text(json.dumps(snapshot))
 ref=next(k for k,v in snapshot['refs'].items() if v['name']=='draw.io 그림 파일')
 cmd('upload','--element',ref,'--files',str(Path(source['path']).resolve()));settled()
 evaluate('document.querySelector("#diagram-file-input").hidden=true;JSON.stringify(true)')
def download(stem):
 record=evaluate('''(async()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob,name;URL.createObjectURL=function(b){blob=b;return create.call(this,b)};HTMLAnchorElement.prototype.click=function(){name=this.download};try{document.querySelector('#btn-download').click();for(let i=0;i<400&&!blob;i++)await new Promise(r=>setTimeout(r,50));if(!blob)throw new Error('Missing Blob');return JSON.stringify({xml:await blob.text(),filename:name,mime:blob.type})}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}})()''')
 xml=record.pop('xml');(private/(stem+'.drawio')).write_text(xml);record['sha256']=hashlib.sha256(xml.encode()).hexdigest();return xml,record
# This runs production buttons; only the AI response is a synthetic stub. No model inference.
def chat(kind):
 body={'message':'로컬 연결 검사','commands':[{'type':'add_service','params':{'serviceType':'s3','label':'__docker_smoke_s3__','pageId':manifest[1]['pages'][0]['id']}}]} if kind=='add' else {'message':'전체 교체 검사','commands':[{'type':'replace_all','params':{'architecture':{'groups':[],'services':[],'connections':[]}}}]}
 expression='''(async()=>{const native=window.fetch;let request;window.fetch=async(url,options)=>{if(url!='/api/chat')return native(url,options);const body=JSON.parse(options.body);request={url,pageId:body.architecture.pageId,channel:body.channel};return new Response(JSON.stringify(RESPONSE),{status:200,headers:{'Content-Type':'application/json'}})};try{const input=document.querySelector('#chat-input');input.value='현재 페이지에 S3 하나 추가해줘';input.dispatchEvent(new Event('input'));document.querySelector('#chat-send').click();for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,50));if(!document.querySelector('#chat-messages [id^="loading-"]'))return JSON.stringify({request,mockResponse:true})}throw new Error('Chat timeout')}finally{window.fetch=native}})()'''.replace('RESPONSE',json.dumps(body))
 return evaluate(expression)
counts=lambda p:{'vertices':sum(c.get('vertex')=='1' for c in p.iter('mxCell')),'edges':sum(c.get('edge')=='1' for c in p.iter('mxCell')),'cells':len(list(p.iter('mxCell')))}
def canonical(e):return (e.tag,sorted(e.attrib.items()),(e.text or '').strip(),[canonical(c) for c in e])
cmd('reload');settled()
records=[]
for s in manifest:
 assert hashlib.sha256(Path(s['path']).read_bytes()).hexdigest()==s['sha256'], 'Input hash mismatch'
 upload(s);xml,d=download(s['id']);original=E.fromstring(Path(s['path']).read_text()).findall('diagram');loaded=E.fromstring(xml).findall('diagram')
 assert len(original)==len(loaded)==len(s['pages'])
 pages=[]
 for i,(a,b) in enumerate(zip(original,loaded)):
  preserved=counts(a)==counts(b) and sorted(c.get('id') for c in a.iter('mxCell'))==sorted(c.get('id') for c in b.iter('mxCell')) and a.get('id')==b.get('id')
  assert preserved;pages.append({'pageIndex':i,'counts':counts(b),'preserved':preserved})
 records.append({'input':s['id'],'download':d,'pages':pages})
# Preserve page two as the natural-language target with draw.io's existing page URL option.
evaluate('''(async()=>{const frame=document.querySelector('iframe');const ready=new Promise((resolve,reject)=>{const h=e=>{if(e.origin!=='https://embed.diagrams.net'||e.source!==frame.contentWindow)return;let m;try{m=JSON.parse(e.data)}catch{return}if(m.event==='init'){clearTimeout(t);window.removeEventListener('message',h);resolve()}};window.addEventListener('message',h);const t=setTimeout(()=>reject(new Error('init timeout')),15000)});const u=new URL(frame.src);u.searchParams.set('page','1');frame.src=u.href;await ready;return JSON.stringify(true)})()''')
upload(manifest[1]);before,_=download('homepage-before-chat');request=chat('add');after,_=download('homepage-after-chat')
assert request['request']['pageId']==manifest[1]['pages'][1]['id']
a=E.fromstring(before).findall('diagram');b=E.fromstring(after).findall('diagram')
for i,(x,y) in enumerate(zip(a,b)):
 old={c.get('id'):canonical(c) for c in x.find('mxGraphModel/root')};new={c.get('id'):canonical(c) for c in y.find('mxGraphModel/root')}
 assert all(new.get(k)==v for k,v in old.items())
 assert counts(y)['vertices']==counts(x)['vertices']+(i==1) and counts(y)['edges']==counts(x)['edges']
blocked=chat('replace');unchanged,_=download('homepage-after-rejected-replace');assert canonical(E.fromstring(after))==canonical(E.fromstring(unchanged))
# Undo the synthetic add; this also exercises the acknowledged-load path.
evaluate('document.querySelector("#btn-undo").click();JSON.stringify(true)')
restored=None
for _ in range(5):
 restored,_=download('homepage-restored')
 if canonical(E.fromstring(restored))==canonical(E.fromstring(before)):break
assert canonical(E.fromstring(restored))==canonical(E.fromstring(before))
# Invalid browser input never replaces the loaded diagram.
evaluate('''JSON.stringify((()=>{const f=document.querySelector('#diagram-file-input');const t=new DataTransfer();t.items.add(new File(['<invalid>'],'invalid.drawio',{type:'application/xml'}));f.files=t.files;f.dispatchEvent(new Event('change'));return true})())''');settled()
invalid,_=download('homepage-after-invalid-file');assert canonical(E.fromstring(restored))==canonical(E.fromstring(invalid))
proof={'origin':'http://localhost:8080','imports':records,'syntheticChat':request,'selectedPageOnlyAdded':True,'existingCellSubtreesUnchanged':True,'replaceAllRejectedWithoutChanges':True,'undoRestoredDrawing':True,'invalidFilePreservedDrawing':True,'realBedrockTested':False,'nativeDownloadDialogTested':False,'downloadCheck':'Production download button Blob captured into private.local; native browser save bypassed to avoid raw company data outside private artifacts'}
(out/'browser-use-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
