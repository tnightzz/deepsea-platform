'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const s = { Math, Number }; s.window = s; vm.createContext(s);
for (const file of ['struct-truss-cage-standalone.js', 'exhibit-cage.js']) vm.runInContext(fs.readFileSync(path.join(root, 'frontend/vendor', file), 'utf8'), s);
const square = { shape: '桁架式', plan_shape: 'square', length_m: 18, width_m: 18, depth_m: 6 };
const hex = { shape: '桁架式', plan_shape: 'hexagon', across_flats_m: 20, side_m: 20 / Math.sqrt(3), length_m: 40 / Math.sqrt(3), width_m: 20, depth_m: 6 };
const area = p => Math.abs(p.reduce((n, a, i) => { const b = p[(i + 1) % p.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, a + ' != ' + b);
assert.equal(s.ExhibitCage.geometry, s.StructTrussCage.geometry, 'production and legacy model share one geometry function');
assert.equal(s.ExhibitCage.mapPoint, s.StructTrussCage.mapPoint);
for (const [spec, count, expectedArea] of [[square, 4, 324], [hex, 6, 200 * Math.sqrt(3)]]) {
  const g = s.ExhibitCage.geometry(spec);
  assert.equal(g.inner.length, count); assert.equal(g.outer.length, count);
  near(area(g.inner) / g.scale ** 2, expectedArea);
  near(g.depth / g.scale, 6); near(g.railHeight / g.scale, 1.2);
  for (let i = 0; i < count; i++) {
    const a = g.outer[i], b = g.outer[(i + 1) % count], c = g.inner[i];
    const width = Math.abs((b[0] - a[0]) * (a[1] - c[1]) - (a[0] - c[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    near(width / g.scale, 1.1);
  }
  const center = s.ExhibitCage.mapPoint({ x: spec.length_m / 2, y: spec.width_m / 2, z: 5 }, { x: spec.length_m, y: spec.width_m, z: 6 }, g);
  near(center[0], 0); near(center[1] / g.scale, -5); near(center[2], 0);
}
const h = s.ExhibitCage.geometry(hex);
assert.equal(s.ExhibitCage.mapPoint({ x: 0, y: 0, z: 3 }, { x: hex.length_m, y: 20, z: 6 }, h), null, 'hex bounding-box corner is outside the net');
vm.runInContext(fs.readFileSync(path.join(root, 'frontend/vendor/exhibit-equipment.js'), 'utf8'), s);
for (const scale of [5/18,5/(40/Math.sqrt(3))]) {
  let kind;
  const bounds = {};
  const add = points => { const b = bounds[kind] || (bounds[kind] = [[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]]); for (const p of points) for (let i=0;i<3;i++) { b[0][i]=Math.min(b[0][i],p[i]); b[1][i]=Math.max(b[1][i],p[i]); } };
  const positions = Object.fromEntries(['feed','feed_outlet','water','oxygen','water_mount','light','light_secondary','light_mount','camera','camera_mount','crane','crane_secondary','tension','pose','net','energy','battery'].map(k=>[k,[0,0,0]]));
  s.addMarineEquipment({ positions, scale, deck:0, edge:0, kind:n=>kind=n, tube:()=>{}, face:add,
    box:(x,y,z,w,h,d)=>add([[x-w/2,y-h/2,z-d/2],[x+w/2,y+h/2,z+d/2]]) });
  for (const name of ['feed','water','camera','light','crane','tension']) {
    const actual = bounds[name][1].map((v,i)=>(v-bounds[name][0][i])/scale);
    s.MarineEquipmentSpec[name].size.forEach((v,i)=>near(actual[i],v));
  }
}
console.log('PASS shared geometry: polygon area, real-metre walkway/rails, depth and hex point bounds');
