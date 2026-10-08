"""Verify real controller + iframe service addition on all seven KB pages.

Usage: python3 development/tools/verify-kb-addition.py <result-dir> <orca-page-id> [--integrated]
Open drawio-probe.html on localhost:5184 first. Raw exports stay in private.local.
"""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.parse

root = Path(__file__).resolve().parents[2]
output = Path(sys.argv[1]).resolve()
page_id = sys.argv[2]
integrated = '--integrated' in sys.argv[3:]
manifest = json.loads((root / 'development/fixtures/baseline/kb-inputs.json').read_text())
for source in manifest['inputs']:
    assert hashlib.sha256((root / source['path']).read_bytes()).hexdigest() == source['sha256'], 'Input hash mismatch'
private = output / 'private.local/live-addition'
private.mkdir(exist_ok=False)
reloaded = json.loads(subprocess.run(['orca', 'reload', '--page', page_id, '--json'],
                                    capture_output=True, text=True, check=True).stdout)
assert reloaded.get('ok'), 'Probe reload failed'
code_paths = ('src/core/diagram-controller.js', 'src/core/drawio-bridge.js', 'scripts/layout-metrics.js',
              'src/core/aws-service-catalog.js', 'src/core/snapshot-manager.js',
              'development/tools/verify-kb-addition.py', 'development/tools/drawio-probe.html')
code_hashes = {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in code_paths}
records = []
for source in manifest['inputs']:
    for index, page in enumerate(source['pages']):
        expression = r"""(async () => {
          for(let i=0;i<300&&!window.baselineProbe?.ready;i++)await new Promise(r=>setTimeout(r,50));
          if(!window.baselineProbe?.ready)throw new Error('Probe editor not ready');
          const {DiagramController} = await import('/src/core/diagram-controller.js');
          const {SnapshotManager} = await import('/src/core/snapshot-manager.js');
          const {measureXml,comparePreservation} = await import('/scripts/layout-metrics.js');
          const bridge = window.baselineProbe.bridge, iframe = document.querySelector('iframe');
          const waitEvent = kind => new Promise((resolve,reject) => {
            const handler = event => {
              if(event.origin !== 'https://embed.diagrams.net' || event.source !== iframe.contentWindow) return;
              let msg;try{msg=JSON.parse(event.data)}catch{return}
              if(msg.event !== kind) return;
              clearTimeout(timer);window.removeEventListener('message',handler);resolve();
            };
            window.addEventListener('message',handler);
            const timer=setTimeout(()=>{window.removeEventListener('message',handler);reject(new Error('Iframe '+kind+' timeout'))},15000);
          });
          // Select the page using draw.io's initial-page URL parameter, then verify its live index.
          const initialized=waitEvent('init'), url=new URL(iframe.src);
          url.searchParams.set('page',String(PAGE_INDEX));iframe.src=url.href;await initialized;
          const response=await fetch(INPUT_URL);if(!response.ok)throw new Error('Input fetch failed');
          const original=await response.text();
          const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
          if(await hash(original)!==INPUT_HASH)throw new Error('Browser input hash mismatch');
          const loaded=waitEvent('load');bridge.loadXml(original);await loaded;
          const before=await bridge.getEditingState();
          if(before.pageIndex!==PAGE_INDEX)throw new Error('Wrong active page before editing');
          const parser=new DOMParser(), serializer=new XMLSerializer();
          const diagrams=xml=>[...parser.parseFromString(xml,'text/xml').querySelectorAll('diagram')];
          const canonical=node=>node.nodeType===1
            ? [node.localName,[...node.attributes].map(a=>[a.name,a.value]).sort(),[...node.childNodes].filter(n=>n.nodeType!==3||n.textContent.trim()).map(canonical)]
            : [node.nodeType,node.textContent];
          const beforePages=diagrams(before.xml);
          if(beforePages.length!==PAGE_COUNT||!beforePages.every((p,i)=>p.id===PAGE_IDS[i]))throw new Error('Input pages changed on load');
          const beforeImage=await bridge.exportDiagram('svg');
          const params={serviceType:'s3',label:'__baseline_added_s3__'};
          if(EXPLICIT_PAGE)params.pageId=PAGE_ID;
          const command=await new DiagramController(bridge,new SnapshotManager()).executeCommands([{type:'add_service',params}]);
          if(!command.success)throw new Error('Service addition failed');
          const after=await bridge.getEditingState(), afterPages=diagrams(after.xml);
          const orderedPages=beforePages.length===afterPages.length&&beforePages.every((p,i)=>p.id===afterPages[i].id&&p.getAttribute('name')===afterPages[i].getAttribute('name'));
          const pages=beforePages.map((p,i)=>{
            const a=measureXml(serializer.serializeToString(p.querySelector('mxGraphModel')));
            const b=measureXml(serializer.serializeToString(afterPages[i].querySelector('mxGraphModel')));
            const preservation=comparePreservation(a,b,{allowGeometryChanges:i===PAGE_INDEX});
            const expectedAdded=i===PAGE_INDEX?1:0;
            return {pageIndex:i,preservationPassed:preservation.preservationPassed,
              input:a.counts,output:b.counts,added:preservation.addedIds.length,
              existingCellSubtreesUnchanged:[...p.querySelector('root').children].every(cell=>{
                const match=[...afterPages[i].querySelector('root').children].find(c=>c.getAttribute('id')===cell.getAttribute('id'));
                return match&&JSON.stringify(canonical(cell))===JSON.stringify(canonical(match));
              }),
              existingContentPreserved:[...p.querySelector('root').children].every(cell=>{
                const match=[...afterPages[i].querySelector('root').children].find(c=>c.getAttribute('id')===cell.getAttribute('id'));
                if(!match)return false;
                const original=cell.cloneNode(true),actual=match.cloneNode(true);
                if(preservation.changedGeometryIds.includes(cell.getAttribute('id'))){
                  const c=original.localName==='mxCell'?original:original.querySelector('mxCell');
                  if(i!==PAGE_INDEX||!/(^|;)resIcon=mxgraph\.aws4\./.test(c.getAttribute('style')||'')||c.getAttribute('locked')==='1')return false;
                  for(const el of [original,actual])for(const key of ['x','y'])el.querySelector('mxGeometry').removeAttribute(key);
                }
                return JSON.stringify(canonical(original))===JSON.stringify(canonical(actual));
              }),
              movedVertices:preservation.changedGeometryIds.length,
              otherPageUnchanged:i===PAGE_INDEX?null:JSON.stringify(canonical(p))===JSON.stringify(canonical(afterPages[i])),
              countContract:b.counts.vertices===a.counts.vertices+expectedAdded&&b.counts.edges===a.counts.edges&&preservation.addedIds.length===expectedAdded};
          });
          if(!orderedPages||after.pageIndex!==before.pageIndex||pages.some(p=>!p.preservationPassed||!p.countContract||!p.existingContentPreserved||p.otherPageUnchanged===false))throw new Error('Preservation contract failed');
          const target=measureXml(serializer.serializeToString(afterPages[PAGE_INDEX].querySelector('mxGraphModel')));
          const beforeTarget=measureXml(serializer.serializeToString(beforePages[PAGE_INDEX].querySelector('mxGraphModel')));
          const added=target.cells.find(c=>!beforeTarget.cells.some(old=>old.id===c.id));
          const layer=afterPages[PAGE_INDEX].querySelector('root').children;
          const parent=[...layer].find(c=>c.getAttribute('id')===added.parent);
          if(added.value!=='__baseline_added_s3__'||!parent||parent.getAttribute('visible')==='0'||parent.getAttribute('locked')==='1'||/(^|;)locked=1(;|$)/.test(parent.getAttribute('style')||''))throw new Error('Added cell is not on a writable visible layer');
          const peers=beforeTarget.cells.filter(c=>c.style.includes('resIcon=mxgraph.aws4.s3;')&&c.rect);
          const sameStyle=c=>c.style.replace(/html=1;?/, 'html=0;')===added.style;
          const matched=peers.filter(c=>c.parent===added.parent&&sameStyle(c)&&c.rect.width===added.rect.width&&c.rect.height===added.rect.height);
          const distance=matched.length?Math.min(...matched.map(c=>Math.hypot(c.rect.x-added.rect.x,c.rect.y-added.rect.y))):null;
          const contains=(a,b)=>a.x<=b.x&&a.y<=b.y&&a.x+a.width>=b.x+b.width&&a.y+a.height>=b.y+b.height;
          // Background overlap is intentional only where it already enclosed a matching peer.
          const backgroundIds=INTEGRATED?beforeTarget.cells.filter(c=>c.rect&&contains(c.rect,added.rect)&&
            !c.style.includes('resourceIcon')&&!/(^|;)(text|image)(;|=|$)/.test(c.style)&&
            matched.some(p=>contains(c.rect,p.rect))&&c.rect.width>=added.rect.width*2&&c.rect.height>=added.rect.height*2).map(c=>c.id):[];
          const addedPairs=target.overlapPairs.filter(pair=>pair.includes(added.id));
          const changedIds=new Set([added.id,...comparePreservation(beforeTarget,target,{allowGeometryChanges:true}).changedGeometryIds]);
          const oldPairs=new Set(beforeTarget.overlapPairs.map(pair=>pair.slice().sort().join('|')));
          const newOverlap=target.overlapPairs.filter(pair=>pair.some(id=>changedIds.has(id))&&
            !oldPairs.has(pair.slice().sort().join('|'))&&!pair.some(id=>backgroundIds.includes(id))).length;
          if(newOverlap)throw new Error('Added or moved cell introduces an overlap');
          const integration={peerCount:peers.length,matchedStyleAndSize:matched.length>0,nearestPeerDistance:distance,
            addedSize:{width:added.rect.width,height:added.rect.height},backgroundOverlaps:addedPairs.filter(pair=>pair.some(id=>backgroundIds.includes(id))).length};
          if(INTEGRATED&&peers.length&&(!matched.length||distance>300))throw new Error('Same-service integration failed');
          const afterImage=await bridge.exportDiagram('svg');
          return JSON.stringify({beforeXml:before.xml,afterXml:after.xml,beforeSvg:beforeImage.data,afterSvg:afterImage.data,
            sourceSha256:await hash(original),beforeSha256:await hash(before.xml),afterSha256:await hash(after.xml),
            beforePageIndex:before.pageIndex,afterPageIndex:after.pageIndex,orderedPages,commandSuccess:true,newOverlap,integration,pages,checkedAt:new Date().toISOString()});
        })()"""
        values = {'PAGE_INDEX': index, 'PAGE_IDS': [p['id'] for p in source['pages']], 'PAGE_ID': page['id'],
                  'PAGE_COUNT': len(source['pages']), 'EXPLICIT_PAGE': index % 2 == 1,
                  'INPUT_URL': '/' + urllib.parse.quote(source['path']), 'INPUT_HASH': source['sha256'], 'INTEGRATED': integrated}
        for key, value in values.items():
            expression = expression.replace(key, json.dumps(value))
        run = subprocess.run(['orca', 'eval', '--page', page_id, '--expression', expression, '--json'],
                             capture_output=True, text=True, timeout=60)
        receipt = json.loads(run.stdout)
        if not receipt.get('ok'):
            raise RuntimeError('Orca live verification failed: ' + receipt.get('error', {}).get('message', 'unknown'))
        record = json.loads(receipt['result']['result'])
        assert record['sourceSha256'] == source['sha256']
        stem = source['id'] + '-p' + str(index + 1)
        artifacts = {}
        for key, suffix in [('beforeXml', 'before.drawio'), ('afterXml', 'after.drawio'),
                            ('beforeSvg', 'before.svg'), ('afterSvg', 'after.svg')]:
            value = record.pop(key)
            if key.endswith('Svg'):
                prefix, encoded = value.split(',', 1)
                assert prefix == 'data:image/svg+xml;base64'
                data = base64.b64decode(encoded, validate=True)
            else:
                data = value.encode()
            target = private / (stem + '-' + suffix)
            target.write_bytes(data)
            if key.endswith('Xml'):
                assert hashlib.sha256(data).hexdigest() == record['beforeSha256' if key == 'beforeXml' else 'afterSha256']
            artifacts[key] = {'path': target.relative_to(output).as_posix(), 'sha256': hashlib.sha256(data).hexdigest()}
        records.append({'input': source['id'], 'pageIndex': index + 1, 'explicitPageId': values['EXPLICIT_PAGE'], 'artifacts': artifacts, **record})
        print('Verified live addition: ' + stem, flush=True)
assert len(records) == 7
assert all(hashlib.sha256((root / p).read_bytes()).hexdigest() == code_hashes[p] for p in code_paths), 'Code changed during verification'
(output / 'live-addition-proof.json').write_text(json.dumps({
    'scope': 'real controller and iframe, whole files, all seven target pages; native export normalized before comparison',
    'records': records,
    'sourceSha256': code_hashes,
}, indent=2) + '\n')
