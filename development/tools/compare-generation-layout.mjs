// Explicit XML geometry comparison; not a draw.io rendering or typography measurement.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {measureXml} from '../../scripts/layout-metrics.js';
const [beforePath,afterPath,output]=process.argv.slice(2);
assert(beforePath && afterPath && output && !existsSync(output),'Pass before.drawio after.drawio new-output.json');
globalThis.DOMParser=new JSDOM('').window.DOMParser;
const parseStyle=s=>Object.fromEntries((s||'').split(';').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const inspect=path=>{
 const xml=readFileSync(path,'utf8'),doc=new DOMParser().parseFromString(xml,'text/xml');
 const cells=measureXml(xml).cells,byId=new Map(cells.map(c=>[c.id,c]));
 const rect=id=>{const r=byId.get(id)?.rect;assert(r,id);return r;};
 const pa=rect('public-a'),pc=rect('public-c'),da=rect('private-a'),dc=rect('private-c'),vpc=rect('vpc'),logs=rect('logs'),cloud=rect('cloud');
 const edges=[...doc.querySelectorAll('mxCell[edge="1"]')];
 let routed=0,iconIntersections=0,totalLength=0;
 const segments=[];
 for(const edge of edges){
  const style=parseStyle(edge.getAttribute('style'));
  if(!['exitX','exitY','entryX','entryY'].every(k=>Number.isFinite(Number(style[k]))))continue;
  const s=rect(edge.getAttribute('source')),t=rect(edge.getAttribute('target'));
  const points=[{x:s.x+s.width*Number(style.exitX),y:s.y+s.height*Number(style.exitY)},...[...edge.querySelectorAll('Array[as="points"] mxPoint')].map(p=>({x:Number(p.getAttribute('x')),y:Number(p.getAttribute('y'))})),{x:t.x+t.width*Number(style.entryX),y:t.y+t.height*Number(style.entryY)}];
  assert(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];assert(a.x===b.x || a.y===b.y,'Non orthogonal explicit segment');
   totalLength+=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
   segments.push({edge:edge.getAttribute('id'),a,b});
   for(const id of ['web-a','web-c','db-a','db-c','logs']){
    if(id===edge.getAttribute('source') || id===edge.getAttribute('target'))continue;
    const r=rect(id);
    const hit=a.x===b.x?a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height:a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width;
    if(hit)iconIntersections++;
   }
  }
  routed++;
 }
 let crossings=0;
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];if(a.edge===b.edge)continue;
  const ah=a.a.y===a.b.y,bh=b.a.y===b.b.y;if(ah===bh)continue;
  const h=ah?a:b,v=ah?b:a;
  if(v.a.x>Math.min(h.a.x,h.b.x)&&v.a.x<Math.max(h.a.x,h.b.x)&&h.a.y>Math.min(v.a.y,v.b.y)&&h.a.y<Math.max(v.a.y,v.b.y))crossings++;
 }
 return {vertices:cells.filter(c=>c.vertex).length,edges:edges.length,cloudWidth:cloud.width,cloudHeight:cloud.height,
  publicAbovePrivate:pa.y+pa.height<=da.y && pc.y+pc.height<=dc.y,
  subnetColumnsAligned:pa.x===da.x&&pc.x===dc.x,azRowsAligned:pa.y===pc.y&&da.y===dc.y,
  subnetWidthsAligned:[pa,pc,da,dc].every(r=>r.width===pa.width),logsRightOfVpc:logs.x>=vpc.x+vpc.width,
  explicitRoutes:routed,explicitRouteIconIntersections:routed?iconIntersections:null,explicitRouteTotalLength:routed?totalLength:null,
  explicitRouteStrictCrossings:routed===edges.length?crossings:null,
  inventory:cells.filter(c=>c.vertex).map(c=>[c.id,c.value,c.parent]).sort(),connections:edges.map(e=>[e.getAttribute('source'),e.getAttribute('target'),e.getAttribute('value')]).sort()};
};
const before=inspect(beforePath),after=inspect(afterPath);
assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.connections,before.connections);
for(const key of ['publicAbovePrivate','subnetColumnsAligned','azRowsAligned','subnetWidthsAligned','logsRightOfVpc'])assert(after[key],key);
assert.equal(after.explicitRoutes,after.edges);assert.equal(after.explicitRouteIconIntersections,0);
assert.equal(after.explicitRouteStrictCrossings,0);
assert(after.cloudWidth*after.cloudHeight < before.cloudWidth*before.cloudHeight,'Public example did not become more compact');
writeFileSync(output,JSON.stringify({scope:'Public fixture XML geometry only. Unspecified routes are unmeasured. Not browser-rendered routes, text bounds, or complete crossing metrics.',before,after},null,2)+'\n');
console.log(JSON.stringify({before,after}));
