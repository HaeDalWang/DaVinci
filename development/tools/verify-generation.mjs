// Offline generator/controller check. This does not call a model or run draw.io/browser/Docker.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {generateArchitecture} from '../../src/core/architecture-generator.js';
import {extractTemplate} from '../../src/core/architecture-template.js';
import {DiagramController} from '../../src/core/diagram-controller.js';
import {SnapshotManager} from '../../src/core/snapshot-manager.js';
import {measureXml} from '../../scripts/layout-metrics.js';

const output=process.argv[2];
assert(output && !existsSync(`${output}/proof.json`),'Usage: node development/tools/verify-generation.mjs <new-result-directory>');
mkdirSync(`${output}/private.local`,{recursive:true});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer;
const parse=s=>new DOMParser().parseFromString(s,'text/xml');
const serialize=e=>new XMLSerializer().serializeToString(e);
const hash=s=>createHash('sha256').update(s).digest('hex');
const codePaths=['src/core/architecture-generator.js','src/core/architecture-template.js','src/core/json-to-xml-builder.js','src/core/layout-engine.js','src/core/edge-router.js','src/core/diagram-controller.js'];
const codeHashes=Object.fromEntries(codePaths.map(p=>[p,hash(readFileSync(p))]));
const input=JSON.parse(readFileSync(process.argv[3] || 'development/fixtures/generation/explicit.json'));
const expectedNodes=[...input.groups,...input.services];
const assertGenerated=(xml,appearance)=>{
 const doc=parse(xml),measurement=measureXml(xml);
 assert.equal(doc.querySelectorAll('mxCell[vertex="1"]').length,expectedNodes.length);
 assert.equal(doc.querySelectorAll('mxCell[edge="1"]').length,input.connections.length);
 for(const item of expectedNodes){const cell=[...doc.querySelectorAll('mxCell')].find(c=>c.id===item.id);assert(cell);assert.equal(cell.getAttribute('value'),item.label);
 const parent=input.services.some(s=>s.id===item.id)?item.group:(input.groups.find(g=>g.children.includes(item.id))?.id);
 assert.equal(cell.getAttribute('parent'),parent || '1');
 const style=input.services.some(s=>s.id===item.id)?appearance?.serviceStyles[item.type]:appearance?.groupStyles[item.type];
 if(style)assert.equal(cell.getAttribute('style'),style);
 }
 for(const item of input.services){
  const cell=[...doc.querySelectorAll('mxCell')].find(c=>c.id===item.id);
  const style=cell.getAttribute('style');
  assert(/(?:^|;)shape=mxgraph\.aws4\.[A-Za-z0-9_]+(?:;|$)/.test(style),'AWS icon shape missing');
  if(style.includes('shape=mxgraph.aws4.resourceIcon;'))assert(/(?:^|;)resIcon=mxgraph\.aws4\.[A-Za-z0-9_]+(?:;|$)/.test(style),'Resource icon glyph missing');
 }
 const actualEdges=[...doc.querySelectorAll('mxCell[edge="1"]')].map(e=>[e.getAttribute('source'),e.getAttribute('target'),e.getAttribute('value')]);
 assert.deepEqual(actualEdges,input.connections.map(c=>[c.from,c.to,c.label]));
 const cells=measurement.cells.filter(c=>c.vertex),byId=new Map(measurement.cells.map(c=>[c.id,c]));
 const ancestor=(parent,node)=>{for(let id=node.parent;id && byId.has(id);id=byId.get(id).parent)if(id===parent.id)return true;return false;};
 for(const cell of cells){
  const r=cell.rect;assert(r && [r.x,r.y,r.width,r.height].every(Number.isFinite));
  const p=byId.get(cell.parent);if(p?.rect){const b=p.rect;assert(r.x>=b.x && r.y>=b.y && r.x+r.width<=b.x+b.width && r.y+r.height<=b.y+b.height);}
 }
 for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
  const a=cells[i],b=cells[j];if(ancestor(a,b)||ancestor(b,a))continue;
  assert(!(a.rect.x<b.rect.x+b.rect.width && b.rect.x<a.rect.x+a.rect.width && a.rect.y<b.rect.y+b.rect.height && b.rect.y<a.rect.y+a.rect.height),'Sibling elements overlap');
 }
 for(const s of input.services){const source=appearance?.serviceSizes[s.type];if(!source)continue;const c=byId.get(s.id);assert.equal(c.rect.width,source.width);assert.equal(c.rect.height,source.height);}
 return {vertices:cells.length,edges:actualEdges.length,contentPassed:true,siblingOverlaps:0,parentOverflows:0};
};
const basic=generateArchitecture(input);assert.equal(basic.status,'ready');
const baseline=assertGenerated(basic.xml);writeFileSync(`${output}/private.local/catalog.drawio`,basic.xml);
const manifest=JSON.parse(readFileSync('development/fixtures/baseline/kb-inputs.json'));
const records=[];
for(const source of manifest.inputs)for(let i=0;i<source.pages.length;i++){
 const stem=`${source.id}-p${i+1}`;
 const before=readFileSync(`development/results/2026-10-07-integrated-addition/private.local/live-addition/${stem}-before.drawio`,'utf8');
 const originalPages=[...parse(before).querySelectorAll('diagram')];
 const model=serialize(originalPages[i].querySelector('mxGraphModel'));
 const appearance=extractTemplate(model);
 const result=generateArchitecture(input,{templateXml:model});assert.equal(result.status,'ready');
 const measured=assertGenerated(result.xml,appearance);
 let current=before;
 const bridge={getCurrentXml:async()=>current,getEditingState:async()=>({xml:current,pageIndex:i}),merge:async xml=>{current=xml;return {};}};
 const done=await new DiagramController(bridge,new SnapshotManager()).executeCommands([{type:'generate_architecture',params:{architecture:input,pageId:originalPages[i].id,title:'Generated Example'}}]);
 assert.equal(done.success,true,done.message);
 const pages=[...parse(current).querySelectorAll('diagram')];assert.equal(pages.length,originalPages.length+1);
 for(let j=0;j<originalPages.length;j++)assert.equal(serialize(pages[j]),serialize(originalPages[j]));
 assertGenerated(serialize(pages.at(-1).querySelector('mxGraphModel')),appearance);
 writeFileSync(`${output}/private.local/${stem}-generated.drawio`,result.xml);
 records.push({fixture:source.id,page:i+1,inputSha256:hash(model),...measured,templateUsed:result.templateUsed,originalPagesPreserved:true,outputSha256:hash(result.xml)});
}
const questions=generateArchitecture({...input,connections:undefined});assert.equal(questions.status,'needs_input');assert(!('xml' in questions));
const explicitNone=generateArchitecture({...input,connections:[]});assert.equal(explicitNone.status,'ready');
for(const p of codePaths)assert.equal(hash(readFileSync(p)),codeHashes[p],'Source changed during measurement');
const proof={codeHashes,date:new Date().toISOString(),scope:'public explicit input through generator and controller with KB page styles; not KB architecture reconstruction or browser proof',inputSha256:hash(JSON.stringify(input)),catalog:baseline,missingConnectionsQuestion:true,explicitEmptyConnectionsAllowed:true,records};
writeFileSync(`${output}/proof.json`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({records:records.length,passed:records.length,catalog:baseline}));
