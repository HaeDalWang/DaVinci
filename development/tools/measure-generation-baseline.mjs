import {JSDOM} from 'jsdom';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {summarizeXml} from '../../src/core/xml-summarizer.js';
import {buildXml} from '../../src/core/json-to-xml-builder.js';
const output=process.argv[2];
if(!output || existsSync(output)) throw new Error('Usage: node development/tools/measure-generation-baseline.mjs <new-output-json>; existing results cannot be overwritten');
const codePaths=['src/core/xml-summarizer.js','src/core/json-to-xml-builder.js','src/core/layout-engine.js'];
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer;
const parse=s=>new DOMParser().parseFromString(s,'text/xml');
const hash=s=>createHash('sha256').update(s).digest('hex');
const inventory=doc=>({vertices:doc.querySelectorAll('mxCell[vertex="1"]').length,edges:doc.querySelectorAll('mxCell[edge="1"]').length,edgesWithEndpoints:doc.querySelectorAll('mxCell[edge="1"][source][target]').length});
const codeHashes=Object.fromEntries(codePaths.map(p=>[p,hash(readFileSync(p))]));
const manifest=JSON.parse(readFileSync('development/fixtures/baseline/kb-inputs.json'));
const records=[];const originalWarn=console.warn;console.warn=()=>{};
for(const source of manifest.inputs)for(let i=0;i<source.pages.length;i++){
 const path=`development/results/2026-10-07-integrated-addition/private.local/live-addition/${source.id}-p${i+1}-before.drawio`;
 const xml=readFileSync(path,'utf8'),doc=parse(xml),page=doc.querySelectorAll('diagram')[i];
 const model=new XMLSerializer().serializeToString(page.querySelector('mxGraphModel'));
 const input=summarizeXml(model);let generated=null,error=false;try{generated=inventory(parse(buildXml(input)))}catch{error=true;}
 records.push({fixture:source.id,page:i+1,inputSha256:hash(model),original:inventory(parse(model)),legacyInput:{groups:input.groups.length,services:input.services.length,connections:input.connections.length},generated,error});
}
console.warn=originalWarn;
for(const p of codePaths)if(codeHashes[p]!==hash(readFileSync(p)))throw new Error('Source changed during measurement');
const result={date:new Date().toISOString(),codeHashes,scope:'legacy XML summarization and deterministic regeneration; no model or browser',records};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(records));
