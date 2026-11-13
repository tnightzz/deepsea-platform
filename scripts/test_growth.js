'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const root=path.resolve(__dirname,'..'), DAY=86400000, now=Date.parse('2026-10-29T12:00:00Z');
let clockNow=now;
class Clock extends Date { static now(){return clockNow;} }
let current='cage_01'; const pending=[];
const cages=JSON.parse(fs.readFileSync(path.join(root,'data/farm.json'),'utf8')).sites.flatMap(s=>(s.cages||[]).map(c=>({...c,site_id:s.site_id})));
const context={console, Date:Clock, Math, Number, localStorage:{getItem:()=>null}, CurrentCage:{get:()=>current},
  API:{farm:()=>({cages}),fishGrowth:id=>({then:cb=>pending.push({id,cb})}),resolve:(v,cb)=>v&&v.then?v.then(cb):cb(v)}};
context.window=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'frontend/pages/fish.js'),'utf8'),context);
const def=context.PAGES['/fish/growth'];
const page=Object.assign(def.data(),def.methods,{farm:{cages}});
for(const [name,getter] of Object.entries(def.computed)) Object.defineProperty(page,name,{get:()=>getter.call(page)});
for(const cage of cages){
  page.cageId=current=cage.cage_id;
  const st=cage.stocking;
  page.live=[{ts:now-2*DAY,avg_weight_g:st.init_size_g+10},{ts:now-DAY,avg_weight_g:st.init_size_g+20},{ts:now,avg_weight_g:st.init_size_g+30}];
  const m=page.m, delta=st.target_size_g-st.init_size_g;
  assert.equal(m.planPts[0][1],st.init_size_g);
  assert.equal(m.planPts.at(-1)[1],st.target_size_g);
  assert.equal(m.planPts[20][1],Math.round((st.init_size_g+delta*0.15625)*10)/10,'quarter point follows S interpolation');
  assert.equal(m.obsPts.length,3);
  const u=Math.max(0,Math.min(1,(now-Date.parse(st.date))/(Date.parse(st.plan_harvest)-Date.parse(st.date))));
  assert.equal(m.planToday,Math.round((st.init_size_g+delta*(3*u*u-2*u*u*u))*10)/10);
  page.live.push({ts:now+1,avg_weight_g:null});
  assert.equal(page.m.obs,null,'offline latest sample must not reuse an earlier weight');
  assert.equal(page.m.obsPts.length,3,'daily history remains visible while latest sample is offline');
  page.live=[{ts:now,avg_weight_g:st.target_size_g+1}];
  assert.equal(page.m.etaDays,0,'target reached never yields negative remaining days');
  clockNow=Date.parse(st.plan_harvest)+DAY;
  assert.equal(page.m.planToday,st.target_size_g,'plan does not extrapolate after harvest date');
  clockNow=Date.parse(st.date)-DAY;
  assert.equal(page.m.planToday,st.init_size_g,'plan does not extrapolate before stocking date');
  assert.equal(page.m.etaDays,null,'no growth-rate prediction before stocking');
  clockNow=now;
}
page.load(); current='cage_01'; page.load();
pending[1].cb([{ts:now,avg_weight_g:550}]); pending[0].cb([{ts:now,avg_weight_g:999}]);
assert.equal(page.m.obs,550,'late previous-cage response cannot overwrite current cage');
assert.ok(!/实测体重|最近\s*5\s*分钟|W0\+r/.test(def.template),'growth UI does not describe generated history as measured or linear');
assert.ok(/形态为示意，参数取自台账/.test(def.template));
console.log('PASS growth: two-cage S interpolation, cross-day/offline samples, clamping, late-response isolation and honest labels');
