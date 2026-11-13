'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const root=path.resolve(__dirname,'..'), DAY=86400000, now=Date.parse('2026-10-30T12:00:00Z');
class Clock extends Date { static now(){return now;} }
let current='cage_01';const pending=[];
const farm=JSON.parse(fs.readFileSync(path.join(root,'data/farm.json'),'utf8'));
const cages=farm.sites.flatMap(s=>(s.cages||[]).map(c=>({...c,current_count:c.cage_id==='cage_01'?1145:883})));
const c={console,Date:Clock,Math,Number,Promise,localStorage:{getItem:()=>null},CurrentCage:{get:()=>current,site:()=>farm.sites.find(s=>(s.cages||[]).some(c=>c.cage_id===current)).site_id},
 API:{farm:()=>({cages}),sites:()=>farm.sites,fish:()=>Promise.resolve([]),fishGrowth:id=>new Promise((resolve,reject)=>pending.push({id,resolve,reject}))}};
c.window=c;vm.createContext(c);
for(const f of ['frontend/components.js','frontend/vendor/exhibit-equipment.js','frontend/pages/fish.js','frontend/pages/ai.js','frontend/pages/env.js','frontend/pages/mgmt.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);
function instance(def){const p=Object.assign(def.data(),def.methods);for(const [k,get] of Object.entries(def.computed||{}))Object.defineProperty(p,k,{get:()=>get.call(p)});return p;}
async function main(){
 const d=c.PAGES['/fish/monitor'],p=instance(d);assert.equal(typeof d.computed.longCharts,'function','monitor must use long-term growth, not hourly noise');
 p.load();current='cage_02';p.load();
 pending[1].resolve([{cage_id:'cage_02',ts:now-DAY,avg_weight_g:280},{cage_id:'cage_02',ts:now,avg_weight_g:null}]);await new Promise(setImmediate);
 pending[0].resolve([{cage_id:'cage_01',ts:now,avg_weight_g:999}]);await new Promise(setImmediate);
 assert.equal(p.growth[0].cage_id,'cage_02','old request cannot overwrite selected cage');
 assert.equal(p.longCharts.weight[1].data.at(-1)[1],null,'offline sample stays missing');
 assert.ok(p.longCharts.bio[0].data.every(x=>x[1]>0),'offline must retain known ledger count for plan, not zero');
 p.growth=Array.from({length:151},(_,i)=>({cage_id:current,ts:now-(150-i)*DAY,avg_weight_g:250+i*.2}));
 assert.equal(p.longCharts.weight[0].data.length,120);assert.equal(p.longCharts.weight[1].data.length,120);
 const st=cages[1].stocking,t0=Date.parse(st.date),t1=Date.parse(st.plan_harvest),u=(p.longCharts.weight[0].data[0][0]-t0)/(t1-t0);
 assert.equal(p.longCharts.weight[0].data[0][1],Math.round((st.init_size_g+(st.target_size_g-st.init_size_g)*(3*u*u-2*u*u*u))*10)/10);
 p.load();pending.at(-1).reject(Error('network'));await new Promise(setImmediate);assert.equal(p.growth.length,0,'failed growth fetch clears stale graph');
 const a=instance(c.PAGES['/ai/devices']);assert.equal(a.dimensionRows.length,9);
 for(const r of a.dimensionRows){assert.ok(r.size.includes('×'));assert.ok(r.evidence);assert.equal(r.size,c.MarineEquipmentSpec[r.key].size.join(' × '));}
 for(const name of ['/env/sea','/env/water']){const e=instance(c.PAGES[name]);e.site='site_03';c.API.ndbcStatus=()=>({stations:[{station_id:'DCN',first_local:'2024-07-01 00:00',last_local:'2025-08-31 23:00'}]});assert.ok(e.obsRangeText().includes('2024-07-01'));assert.ok(e.obsRangeText().includes('北京时间'));}
 const m=instance(c.PAGES['/mgmt/cages']);assert.equal(m.sites.length,5,'directory includes unlinked observation stations');
 let option;const chart={setOption:x=>{option=x;},isDisposed:()=>false,resize(){}};c.echarts={getInstanceByDom:()=>chart};
 const t={alive:true,empty:false,dateAxis:true,series:[{name:'sample',data:[[now,300]]}],thresholds:[],$refs:{canvas:{}},$nextTick:f=>f()};
 c.C.TrendChart.methods.render.call(t);assert.equal(option.series[0].showSymbol,true,'single point must be visible');
 const fmt=option.xAxis.axisLabel.formatter;assert.notEqual(fmt(now-DAY),fmt(now),'daily x-axis must show distinct dates');
 console.log('PASS team integration: 120-day monitor, S plan, stale request/network/offline, actual model dimensions, two environment time ranges and five-station directory');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
