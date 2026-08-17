import assert from 'node:assert/strict';

function overlaps(a,b){return !(a.x+a.l<=b.x||b.x+b.l<=a.x||a.y+a.w<=b.y||b.y+b.w<=a.y||a.z+a.h<=b.z||b.z+b.h<=a.z)}
function rotations(box){return [[box.l,box.w,box.h],[box.l,box.h,box.w],[box.w,box.l,box.h],[box.w,box.h,box.l],[box.h,box.l,box.w],[box.h,box.w,box.l]]}
function pack3d(container,instances){
  const placed=[],unloaded=[]; let candidates=[{x:0,y:0,z:0}];
  for(const box of [...instances].sort((a,b)=>(b.l*b.w*b.h)-(a.l*a.w*a.h))){
    candidates=candidates.filter((p,i,arr)=>arr.findIndex(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)===i).sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x);
    let best=null;
    outer: for(const p of candidates){for(const [l,w,h] of rotations(box)){if(p.x+l>container.l||p.y+w>container.w||p.z+h>container.h)continue;const test={...box,x:p.x,y:p.y,z:p.z,l,w,h};if(placed.some(q=>overlaps(test,q)))continue;best=test;break outer;}}
    if(best){placed.push(best);candidates.push({x:best.x+best.l,y:best.y,z:best.z},{x:best.x,y:best.y+best.w,z:best.z},{x:best.x,y:best.y,z:best.z+best.h});}else unloaded.push(box);
  }
  return {placed,unloaded};
}

const container={l:589.8,w:235.2,h:239.3};
const instances=[];
for(let setNo=1;setNo<=20;setNo++){
  instances.push({setNo,code:'A',l:128,w:54,h:13,weight:49});
  instances.push({setNo,code:'B',l:128,w:54,h:11,weight:49});
}
const result=pack3d(container,instances);
assert.equal(result.placed.length + result.unloaded.length, 40, 'carton count must be conserved');
for(const p of result.placed){
  assert.ok(p.x>=0&&p.y>=0&&p.z>=0,'non-negative placement');
  assert.ok(p.x+p.l<=container.l+1e-9,'within length');
  assert.ok(p.y+p.w<=container.w+1e-9,'within width');
  assert.ok(p.z+p.h<=container.h+1e-9,'within height');
}
for(let i=0;i<result.placed.length;i++)for(let j=i+1;j<result.placed.length;j++)assert.equal(overlaps(result.placed[i],result.placed[j]),false,'placements may not overlap');
console.log(`Smoke OK: ${result.placed.length} placed, ${result.unloaded.length} unloaded`);
