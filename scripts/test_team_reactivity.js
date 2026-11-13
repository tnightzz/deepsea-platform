'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');let farm=null,ledger=null;
const c={console,localStorage:{getItem:()=>null},API:{farm:()=>farm,farmDevices:()=>ledger}};c.window=c;vm.createContext(c);
for(const file of ['frontend/vendor/vue.global.prod.js','frontend/pages/fish.js','frontend/pages/ai.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
function state(def){const p=c.Vue.reactive(def.data());for(const [key,get] of Object.entries(def.computed)){const v=c.Vue.computed(()=>get.call(p));Object.defineProperty(p,key,{get:()=>v.value});}return p;}
const p=state(c.PAGES['/fish/monitor']);p.cageId='cage_01';c.Vue.effect(()=>p.longCharts);
assert.equal(p.longCharts.weight.length,0);
farm={cages:[{cage_id:'cage_01',current_count:1145,stocking:{date:'2026-04-10',plan_harvest:'2027-03-01',init_size_g:420,target_size_g:600}}]};
p.tick++;p.growth=[{cage_id:'cage_01',ts:Date.now()-86400000,avg_weight_g:500}];assert.equal(p.longCharts.weight.length,2,'late farm cache must invalidate initially empty graph');
const l=state(c.PAGES['/ai/light']);c.Vue.effect(()=>l.lightLocation);assert.equal(l.lightLocation,'—');
ledger={devices:[{device_id:'light_01',location:'一号水下3m'},{device_id:'light_02',location:'二号水下3m'}]};l.tick++;
assert.equal(l.lightLocation,'一号水下3m','late official ledger must invalidate missing location');l.cageFilter='cage_02';assert.equal(l.lightLocation,'二号水下3m');
console.log('PASS Vue cold-start reactivity: late farm updates growth and late ledger updates both cage light locations');
