'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let alarms = [], passed = 0, failed = 0;
const subs = [];
const s = { console, location: { hash: '#/overview' },
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {}, C: {}, PAGES: {},
  API: { farm: () => ({ cages: [] }), alarms: () => alarms,
    subscribe: f => { subs.push(f); return () => {}; } },
  Exhibit: { init: () => {}, screenState: () => ({ index: 0, count: 1 }) },
  Vue: { createApp: app => { s.App = app; return {
    config: { globalProperties: {} }, component: () => {}, mount: () => {}
  }; } }
};
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8'), s);
const app = Object.assign({}, s.App.data());
Object.entries(s.App.computed).forEach(([key, fn]) => Object.defineProperty(app, key, { get: () => fn.call(app) }));
Object.entries(s.App.methods).forEach(([key, fn]) => { app[key] = fn.bind(app); });
const routes = Object.fromEntries(app.menu.flatMap(g => g.items.map(it => [it.path, it.label])));
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
const expected = {
  'R-TENSION-01': '/struct/detail', 'R-TENSION-02': '/struct/detail',
  'R-TILT-01': '/struct/detail', 'R-TILT-02': '/struct/detail',
  'R-STORM-TENSION-01': '/struct/alarm',
  'R-NET-TRIAL-01': '/struct/detail', 'R-NET-TRIAL-02': '/struct/detail', 'R-NET-STATUS': '/struct/detail',
  'R-TEMP-01': '/env/water', 'R-TEMP-02': '/env/water', 'R-TEMP-03': '/env/water', 'R-TEMP-04': '/env/water',
  'R-BAT-01': '/mgmt/energy', 'R-CMD-01': '/ai/commands'
};
test('every existing rule has one registered handling_page', () => {
  assert(s.AlarmRoutes, 'missing shared alarm routing');
  const rules = s.AlarmRoutes.rules;
  assert.equal(rules.length, Object.keys(expected).length);
  assert.equal(new Set(rules.map(r => r.rule_id)).size, rules.length);
  for (const rule of rules) {
    assert.equal(rule.handling_page, expected[rule.rule_id]);
    assert(routes[rule.handling_page], 'handling route must exist in menu');
    assert.equal(s.AlarmRoutes.pageFor({ rule_id: rule.rule_id }), rule.handling_page);
    assert.equal(s.AlarmRoutes.labelFor(rule.handling_page), routes[rule.handling_page]);
  }
  const ids = new Set();
  for (const file of ['backend/server.py', 'frontend/mock.js', 'frontend/pages/struct.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    for (const hit of code.matchAll(/['"](R-[A-Z0-9-]+)['"]/g)) if (!hit[1].endsWith('-')) ids.add(hit[1]);
    for (const hit of code.matchAll(/['"]temp_(?:alarm|warn)_(?:high|low)['"],\s*['"](?:red|yellow)['"],\s*['"](\d+)['"]/g)) ids.add('R-TEMP-' + hit[1]);
  }
  assert.equal([...ids].sort().join(','), Object.keys(expected).sort().join(','));
});
test('rule ID overrides misleading legacy alarm type', () => {
  assert.equal(s.AlarmRoutes.pageFor({ rule_id: 'R-CMD-01', alarm_type: 'tension' }), '/ai/commands');
  assert.equal(s.AlarmRoutes.pageFor({ rule_id: 'R-CMD-01', alarm_type: 'power_supply' }), '/ai/commands');
  assert.equal(s.AlarmRoutes.pageFor({ rule_id: 'R-TEMP-01', alarm_type: 'tilt' }), '/env/water');
});
test('legacy types retain one useful entry page', () => {
  const types = { feeding: '/fish/monitor', feeding_abnormal: '/fish/monitor', fish_anomaly: '/fish/monitor',
    density: '/fish/heatmap', water_temp: '/env/water', dissolved_oxygen: '/env/water',
    salinity: '/env/water', ph: '/env/water', light: '/env/water', tension: '/struct/detail',
    tilt: '/struct/detail', net_damage: '/struct/detail', deformation: '/struct/detail',
    command: '/ai/commands', command_timeout: '/ai/commands', feeder: '/ai/feed',
    light_device: '/ai/light', device_offline: '/ai/devices', low_battery: '/mgmt/energy', power_supply: '/mgmt/energy' };
  for (const [alarm_type, route] of Object.entries(types)) assert.equal(s.AlarmRoutes.pageFor({ alarm_type }), route);
});
test('unknown rules and types have a visible alarm-center fallback', () => {
  assert.equal(s.AlarmRoutes.pageFor({ rule_id: 'unknown', alarm_type: 'tilt' }), '/struct/detail');
  assert.equal(s.AlarmRoutes.pageFor({ rule_id: 'unknown', alarm_type: 'unknown' }), '/mgmt/alarm');
  assert.equal(s.AlarmRoutes.pageFor({}), '/mgmt/alarm');
  for (const alarm_type of ['__proto__', 'constructor', 'toString']) {
    assert.equal(s.AlarmRoutes.pageFor({ alarm_type }), '/mgmt/alarm');
  }
});
test('all unresolved events count once and board totals equal page sums', () => {
  alarms = Object.keys(expected).map((rule_id, i) => ({ rule_id, alarm_event_id: String(i),
    cage_id: i % 2 ? 'cage_01' : 'cage_02', risk_level: i % 2 ? 'blue' : 'red',
    alarm_status: i % 2 ? 'active' : 'acknowledged' }));
  alarms.push({ alarm_type: 'mystery', alarm_status: 'active' });
  alarms.push({ rule_id: 'R-TILT-02', alarm_status: 'recovered' });
  assert.equal(Object.values(app.pageDots).reduce((a, b) => a + b, 0), 15);
  assert.equal(app.pageDots['/struct/detail'], 7);
  assert.equal(app.pageDots['/struct/alarm'], 1);
  assert.equal(app.pageDots['/env/water'], 4);
  assert.equal(app.pageDots['/mgmt/energy'], 1);
  assert.equal(app.pageDots['/mgmt/alarm'], 1);
  for (const tab of app.tabs.filter(t => t.board)) {
    const total = Object.entries(app.pageDots).filter(([p]) => p.split('/')[1] === tab.board).reduce((n, [, count]) => n + count, 0);
    assert.equal(app.boardDots[tab.board], total);
  }
  assert.equal(app.tabs.find(t => t.key === 'mgmt').board, 'mgmt');
  assert.equal(app.boardDots.mgmt, 2);
  assert(!app.tabs.find(t => t.key === 'overview').board);
});
test('navigation and manual confirmation do not clear unresolved badges', () => {
  alarms = [{ rule_id: 'R-BAT-01', alarm_status: 'active', confirm_status: 'unconfirmed', handle_status: 'pending' }];
  app.path = '/mgmt/energy';
  alarms[0].alarm_status = 'acknowledged'; alarms[0].confirm_status = 'confirmed'; alarms[0].handle_status = 'handled';
  assert.equal(app.pageDots['/mgmt/energy'], 1);
  assert.equal(app.boardDots.mgmt, 1);
  alarms[0].alarm_status = 'recovered';
  assert.equal(app.pageDots['/mgmt/energy'], 0);
  assert.equal(app.boardDots.mgmt, 0);
});
test('99+ only caps display and never truncates arithmetic', () => {
  alarms = Array.from({ length: 105 }, () => ({ rule_id: 'R-CMD-01', alarm_status: 'active' }));
  assert.equal(app.pageDots['/ai/commands'], 105);
  assert.equal(app.boardDots.ai, 105);
  assert.equal(app.countText(app.pageDots['/ai/commands']), '99+');
  assert.equal(app.dotText('ai'), '99+');
  assert.equal(app.countText(0), '0');
});
test('actual handling navigation uses the same mapping after cage validation', () => {
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend/pages/mgmt.js'), 'utf8'), s);
  s.API.farm = () => ({ cages: [{ cage_id: 'cage_01', site_id: 'site_04' }, { cage_id: 'cage_02', site_id: 'site_03' }] });
  const def = s.PAGES['/mgmt/handle'], page = Object.assign(def.data(), def.methods);
  for (const rule_id of ['R-CMD-01', 'R-STORM-TENSION-01', 'R-TEMP-01']) {
    page.act({ cage_id: 'cage_02', rule_id, alarm_type: 'tension' });
    assert.equal(s.location.hash, expected[rule_id]);
    assert.equal(s.CurrentCage.get(), 'cage_02');
  }
  for (const alarm of [{ rule_id: 'R-CMD-01' }, { cage_id: 'cage_99', rule_id: 'R-CMD-01' }]) {
    s.location.hash = '/mgmt/handle';
    page.act(alarm);
    assert.equal(s.location.hash, '/mgmt/handle');
    assert.match(page.actionMsg, /归属尚未确认/);
  }
});
test('structure navigation starts at overview and keeps the four-page order', () => {
  const items = app.menu.find(g => g.group === '结构安全预警').items;
  assert.equal(items.map(it => it.path).join(','), '/struct/overview,/struct/alarm,/struct/detail,/struct/rules');
  assert.equal(items[0].ready, true);
  assert.equal(app.tabs.find(t => t.key === 'struct').first, '/struct/overview');
  app.tabPick(app.tabs.find(t => t.key === 'struct'));
  assert.equal(s.location.hash, '/struct/overview');
});
test('all four structure routes are registered, with a working overview definition', () => {
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend/pages/struct.js'), 'utf8'), s);
  const items = app.menu.find(g => g.group === '结构安全预警').items;
  for (const item of items) assert(s.PAGES[item.path], item.path + ' must have a page');
  const page = s.PAGES['/struct/overview'];
  assert.match(page.template, /scene-slot/);
  assert.match(page.template, /subsystemItems/);
  assert.equal(typeof page.methods.load, 'function');
});
test('preset examples are excluded and detail queue agrees with its badge', () => {
  alarms = [
    { alarm_event_id:'EXAMPLE', rule_id:'R-TILT-01', alarm_status:'active', event_origin:'preset_demo' },
    { alarm_event_id:'REAL', rule_id:'R-TENSION-02', alarm_status:'acknowledged', cage_id:'cage_02', risk_level:'red', alarm_ts:1 },
    { alarm_event_id:'OLD', rule_id:'R-TILT-02', alarm_status:'recovered' },
    { alarm_event_id:'OTHER', rule_id:'R-TEMP-01', alarm_status:'active' }
  ];
  const def = s.PAGES['/struct/detail'], detail = Object.assign(def.data());
  for (const key of ['unresolvedAlarms','selectedAlarm']) Object.defineProperty(detail,key,{get:()=>def.computed[key].call(detail)});
  assert.equal(app.pageDots['/struct/detail'],1);
  assert.equal(detail.unresolvedAlarms.length,app.pageDots['/struct/detail']);
  assert.equal(detail.selectedAlarm.alarm_event_id,'REAL');
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
