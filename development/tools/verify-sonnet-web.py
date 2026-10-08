"""Real paid Sonnet chat smoke on an EMPTY synthetic browser origin only.
Usage: python3 development/tools/verify-sonnet-web.py <orca-page-id> <NEW-result-dir>
Never run this against a customer drawing. Raw XML stays in private.local.
"""
import json,subprocess,xml.etree.ElementTree as E,hashlib,sys
from pathlib import Path
page=sys.argv[1]
out=Path(sys.argv[2]);private=out/'private.local';private.mkdir(parents=True,exist_ok=False)
def evaluate(expression):
 r=subprocess.run(['orca','eval','--page',page,'--expression',expression,'--json'],capture_output=True,text=True,timeout=55)
 receipt=json.loads(r.stdout);assert receipt.get('ok'),str(receipt.get('error'));return json.loads(receipt['result']['result'])
proof=evaluate(r'''(async()=>{
 for(let i=0;i<300&&document.querySelector('#btn-open').disabled;i++)await new Promise(r=>setTimeout(r,50));
 if(document.querySelector('#btn-open').disabled)throw new Error('Editor not ready');
 if(localStorage.getItem('davinci_diagram'))throw new Error('Synthetic origin must be empty');
 const native=window.fetch;let captured;
 window.fetch=async function(url,options){
  const response=await native.call(this,url,options);
  if(url==='/api/chat'){
   const request=JSON.parse(options.body);captured={status:response.status,channel:request.channel,servicesBefore:request.architecture.services.length,connectionsBefore:request.architecture.connections.length,response:await response.clone().json()};
  }
  return response;
 };
 try{
  const input=document.querySelector('#chat-input');input.value='다른 변경 없이 로그 보관용 S3 한 개만 추가해줘.';input.dispatchEvent(new Event('input'));document.querySelector('#chat-send').click();
  for(let i=0;i<900;i++){await new Promise(r=>setTimeout(r,50));if(!document.querySelector('#chat-messages [id^="loading-"]'))break;}
  if(!captured||captured.status!==200||document.querySelector('#chat-messages [id^="loading-"]'))throw new Error('AI request failed or timed out');
  const applied=[...document.querySelectorAll('.chat-message--system')].some(e=>e.textContent.includes('커맨드 실행 완료'));
  const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob,name;
  URL.createObjectURL=function(b){blob=b;return create.call(this,b)};HTMLAnchorElement.prototype.click=function(){name=this.download};
  try{
   document.querySelector('#btn-download').click();for(let i=0;i<300&&!blob;i++)await new Promise(r=>setTimeout(r,50));
   if(!blob)throw new Error('Download did not finish');
   return JSON.stringify({captured,applied,filename:name,xml:await blob.text(),mockResponse:false});
  }finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}
 }finally{window.fetch=native}
})()''')
(private/'browser-final.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));xml=proof.pop('xml');(private/'synthetic-s3.drawio').write_text(xml)
root=E.fromstring(xml);cells=list(root.iter('mxCell'));vertices=[c for c in cells if c.get('vertex')=='1'];edges=[c for c in cells if c.get('edge')=='1']
assert proof['captured']['servicesBefore']==0 and proof['captured']['connectionsBefore']==0
assert proof['applied'] and len(vertices)==1 and len(edges)==0 and 's3' in vertices[0].get('style','').lower()
commands=proof['captured']['response']['commands'];assert len(commands)==1 and commands[0]['type']=='add_service' and commands[0]['params']['serviceType']=='s3'
proof.update({'scope':'real browser chat + actual Sonnet 5.5 + real iframe controller, empty synthetic drawing','verticesAfter':len(vertices),'edgesAfter':len(edges),'xmlSha256':hashlib.sha256(xml.encode()).hexdigest(),'modelInferenceVerified':True})
(out/'browser-smoke-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False))
