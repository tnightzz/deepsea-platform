/* ============================================================
   pages/fish.js —— 鱼类板块
   ============================================================
   负责人：王浩然

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/fish/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

   【三条硬规矩】
     1. 用 components.js 里已有的公共件（stat-card / trend-chart / event-list …），
        不要自己重写一套 —— 全平台要长一个样。
     2. 数据一律走 API.xxx()，不要直接读别的板块的数据，也不要写死数字。
        拿不到就显示「—」，**不许编**。
     3. 界面上不许出现裸英文（比如 quality='good'），必须经 components.js 的 CN 表转成中文。

   【改完必须做】
     双击 验收检查.bat，8 项全过才能发 PR。全过不了就别发 —— 会把别人的页面一起弄坏。

   建立：2026-10-06（从 pages.js 拆出）
   ============================================================ */
(function (global) {
  'use strict';
  /* 自己初始化，不依赖文件加载顺序 —— 这样谁先谁后都不会出错 */
  const PAGES = global.PAGES || (global.PAGES = {});

  /* 本板块专用的 GET/POST（共享 API 模块没有导出通用 get/post，按"只改本板块文件"的规矩在这里就地实现）。
     走后端托管时 __API_BASE__ 为空字符串；无后端时调用失败，由调用方显示「—」。 */
  function fishGet(path, params) {
    let q = '';
    if (params) {
      q = '?' + Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
    }
    return fetch((global.__API_BASE__ || '') + path + q).then(function (r) { return r.json(); });
  }
  function fishPost(path, body) {
    return fetch((global.__API_BASE__ || '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  PAGES['/fish/monitor'] = {
    data: function () {
      return {
        tick: 0, minutes: 60, series: [], growth: [], cageId: '', loadRequest: 0,
        cameras: [], camOffline: false, selectedCam: 0, cameraGrid: false,
        camRaf: null, camPoll: null, tileState: null
      };
    },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      /* 王浩然的120天生长屏，复用稳定跨天仿真历史及台账S型计划。 */
      longCharts: function () {
        this.tick;
        const cid = this.cageId;
        const cage = ((API.farm() || {}).cages || []).find(function (c) { return c.cage_id === cid; });
        const st = (cage && cage.stocking) || {};
        const t0 = Date.parse(st.date), t1 = Date.parse(st.plan_harvest);
        const w0 = Number(st.init_size_g), w1 = Number(st.target_size_g);
        if (!(t1 > t0 && w1 > w0 && w0 > 0)) return { weight: [], bio: [] };
        const now = Date.now();
        const rows = this.growth.filter(function (r) { return r.cage_id === cid && Number.isFinite(r.ts) && r.ts <= now; }).slice(-120);
        const plan = rows.map(function (r) {
          const u = Math.max(0, Math.min(1, (r.ts - t0) / (t1 - t0)));
          return [r.ts, Math.round((w0 + (w1 - w0) * (3*u*u - 2*u*u*u)) * 10) / 10];
        });
        const count = cage.current_count;
        return {
          weight: [
            { name: '计划平均体重 · S型示意', unit: 'g', data: plan },
            { name: '每日仿真体重', unit: 'g', data: rows.map(function (r) { return [r.ts, r.avg_weight_g]; }) }
          ],
          bio: [{ name: '计划总体重', unit: 'kg', data: plan.map(function (r) {
            return [r[0], count == null ? null : Math.round(Number(count) * r[1] / 100) / 10];
          }) }]
        };
      },
      /* 摄食强度变化即"事件"——由数据实时判定，不造假事件 */
      events: function () {
        const out = [];
        let prev = null;
        this.series.forEach(function (r) {
          if (prev !== null && r.feeding_intensity !== prev) {
            out.push({ id: 'f' + r.ts, ts: r.ts,
                       level: r.feeding_intensity === 'strong' ? 'blue'
                            : r.feeding_intensity === 'none' ? 'yellow' : 'orange',
                       text: '摄食强度由「' + this.cn(prev) + '」变为「' + this.cn(r.feeding_intensity) + '」',
                       row: r });
          }
          prev = r.feeding_intensity;
        }, this);
        return out.slice(-15).reverse();
      }
    },
    methods: {
      load: function () {
        const self = this, cid = global.CurrentCage ? global.CurrentCage.get() : 'cage_01';
        const request = ++this.loadRequest;
        if (cid !== this.cageId) { this.cageId = cid; this.series = []; this.growth = []; }
        const valid = function () { return request === self.loadRequest && cid === self.cageId; };
        Promise.resolve(API.fish(this.minutes, cid)).then(function (d) {
          if (valid()) self.series = Array.isArray(d) ? d : [];
        }, function () { if (valid()) self.series = []; });
        Promise.resolve(API.fishGrowth(cid)).then(function (d) {
          if (valid()) self.growth = Array.isArray(d) ? d : [];
        }, function () { if (valid()) self.growth = []; });
      },
      cn: function (v) { return { none: '无', weak: '弱', mid: '中', strong: '强' }[v] || v; },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      loadCams: function () {
        const self = this;
        fishGet('/api/fish/cameras').then(function (d) {
          self.cameras = (d && d.cameras) || [];
          self.camOffline = !!(d && d.offline);
        }).catch(function () { self.cameras = []; self.camOffline = true; });
      },
      /* 四路仿真画面：每路 canvas 按角度画不同场景，让"多角度"名副其实。
         后期接入真实视频时，把对应 canvas 换成 <video :src="c.stream_url"> 即可。 */
      startTiles: function () {
        const self = this;
        const mk = function (n, r) {
          const a = [];
          for (let i = 0; i < n; i++) {
            a.push({ x: r(), y: r(), vx: (Math.random() - 0.5) * 0.5,
                     vy: (Math.random() - 0.5) * 0.4, s: 1 + Math.random() * 2.4 });
          }
          return a;
        };
        const R = function () { return 0.1 + Math.random() * 0.8; };
        this.tileState = {
          top: mk(42, R), side: mk(28, R), under: mk(22, R), pan: mk(46, R),
          bubbles: mk(18, R), t: 0
        };
        const draw = function () {
          const canvases = self.$refs.camCanvas;
          if (canvases && canvases.length) {
            const st = self.tileState;
            st.t += 0.02;
            for (let idx = 0; idx < canvases.length; idx++) {
              const cv = canvases[idx];
              const cam = self.cameras[idx];
              if (!cam) continue;
              const ctx = cv.getContext('2d');
              const w = cv.width, h = cv.height;
              const g = ctx.createLinearGradient(0, 0, 0, h);
              g.addColorStop(0, '#0a1b30'); g.addColorStop(1, '#07101e');
              ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
              const dot = function (p) {
                p.x += p.vx * 0.003; p.y += p.vy * 0.003;
                if (p.x < 0.05 || p.x > 0.95) p.vx *= -1;
                if (p.y < 0.05 || p.y > 0.95) p.vy *= -1;
                ctx.beginPath();
                ctx.arc(p.x * w, p.y * h, p.s, 0, Math.PI * 2);
                ctx.fill();
              };
              ctx.fillStyle = 'rgba(140,190,255,.85)';
              if (cam.angle === '俯视') {
                st.top.forEach(dot);
              } else if (cam.angle === '侧视') {
                /* 水面线 + 鱼只在中下部 */
                ctx.strokeStyle = 'rgba(120,180,255,.35)';
                ctx.beginPath();
                ctx.moveTo(0, h * 0.22); ctx.lineTo(w, h * 0.22); ctx.stroke();
                st.side.forEach(function (p) {
                  if (p.y < 0.3) p.y = 0.3 + Math.random() * 0.5;
                  dot(p);
                });
              } else if (cam.angle === '水下') {
                /* 气泡上升 */
                ctx.fillStyle = 'rgba(160,210,255,.45)';
                st.bubbles.forEach(function (p) {
                  p.y -= 0.002;
                  if (p.y < 0.05) p.y = 0.95;
                  ctx.beginPath();
                  ctx.arc(p.x * w, p.y * h, p.s * 0.7, 0, Math.PI * 2);
                  ctx.fill();
                });
                ctx.fillStyle = 'rgba(170,210,255,.9)';
                st.under.forEach(dot);
              } else {
                /* 全景：四角取景框 + 小点 */
                ctx.strokeStyle = 'rgba(255,255,255,.25)';
                const L = 14;
                [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]
                  .forEach(function (q) {
                    ctx.beginPath();
                    ctx.moveTo(q[0] + L * q[2], q[1]);
                    ctx.lineTo(q[0], q[1]);
                    ctx.lineTo(q[0], q[1] + L * q[3]);
                    ctx.stroke();
                  });
                st.pan.forEach(dot);
              }
            }
          }
          self.camRaf = requestAnimationFrame(draw);
        };
        draw();
      },
      stopTiles: function () {
        if (this.camRaf) { cancelAnimationFrame(this.camRaf); this.camRaf = null; }
        if (this.camPoll) { clearInterval(this.camPoll); this.camPoll = null; }
      }
    },
    mounted: function () {
      /* API.bind：数据变化重算 + 定时刷新曲线 */
      this.unsub = API.bind(this, this.load);
      this.load();
      const self = this;
      this.loadCams();
      this.$nextTick(function () { self.startTiles(); });
      this.camPoll = setInterval(function () { self.loadCams(); }, 5000);
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      this.loadRequest++;
      this.stopTiles();
    },
    watch: { minutes: function () { this.load(); } },
    template: [
      "<div class=\"show-page\"><page-head title=\"鱼类 · 鱼类监测\" desc=\"观测相机与鱼群状态 · 仿真画面明确标识\" /><div class=\"show-body\">",
      "<show-screens :labels=\"['鱼群观测','多角度画面','生长趋势','摄食行为']\"><template #default=\"{screen}\">",
      "<div v-show=\"screen === 0\" class=\"show-row wide\">",
      "  <div class=\"card\"><div class=\"card-title\">鱼群观测 · 当前网箱</div><scene-slot focus=\"camera\" /></div>",
      "  <div class=\"card\"><div class=\"card-title\">摄食与观测判断</div><div class=\"hero-label\">摄食强度</div><div class=\"hero-value\">{{ cn(last.feeding_intensity) || '—' }}</div><div class=\"kv\"><span class=\"k\">平均体长</span><span>{{ last.avg_length_cm ?? '—' }} cm</span><span class=\"k\">活动密度</span><span>{{ last.fish_density ?? '—' }} 尾/m³</span><span class=\"k\">观测时间</span><span>{{ last.ts ? time(last.ts) : '—' }}</span></div><div class=\"show-actions\"><a href=\"#/ai/feed\">进入自动投喂 →</a><a href=\"#/fish/records\">原始记录 →</a></div></div>",
      "</div>",
      "<div v-show=\"screen === 1\" class=\"card\" style=\"flex:1;min-height:0\">",
      "  <div class=\"show-actions\"><div class=\"card-title\">多角度仿真画面</div><button @click=\"cameraGrid = !cameraGrid\">{{ cameraGrid ? '主视角布局' : '四宫格布局' }}</button><span class=\"tag tag-simulated\">仿真画面</span></div>",
      "  <div class=\"grid-cam\" :class=\"{ 'camera-focus': !cameraGrid }\" style=\"flex:1;min-height:0\">",
      "    <div v-for=\"(c,i) in cameras\" :key=\"c.camera_id\" class=\"cam-tile\" :class=\"{'is-selected':selectedCam===i}\" role=\"button\" tabindex=\"0\" :aria-label=\"c.name + '，切换主视角'\" :aria-pressed=\"selectedCam===i\" @click=\"selectedCam=i\" @keydown.enter=\"selectedCam=i\" @keydown.space.prevent=\"selectedCam=i\">",
      "      <canvas ref=\"camCanvas\" width=\"680\" height=\"380\" class=\"cam-canvas\" :class=\"{off:!c.online}\" style=\"height:100%;max-height:100%\"></canvas><div class=\"cam-top\"><span class=\"cam-name\">{{c.name}}</span><span class=\"cam-live\" :class=\"{off:!c.online}\"><i class=\"cam-dot\"></i>{{c.online?'仿真画面':'已离线'}}</span></div><div v-if=\"!c.online\" class=\"cam-no\"><div class=\"cam-no-text\">信号中断</div><div class=\"cam-no-sub\">视觉链路不可用</div></div><div class=\"cam-meta\"><span>{{c.resolution}} · {{c.fps}}fps</span><span>{{c.online?time(c.ts):'—'}}</span></div>",
      "    </div>",
      "  </div><div v-if=\"camOffline\" class=\"show-note\">视觉链路不可用，停止显示旧画面。</div>",
      "</div>",
      "<div v-show=\"screen===2\" class=\"show-note\">最近120个日度点；历史为仿真，非现场实测。计划形态为示意，参数取自台账；底部时间窗用于当前监测。<a href=\"#/fish/growth\">完整生长对照 →</a></div><div v-show=\"screen===2\" class=\"show-row two\"><trend-chart title=\"平均体重生长曲线 · 最近120天\" :series=\"longCharts.weight\" date-axis /><trend-chart title=\"计划总体重 · 按当前台账尾数估算\" :series=\"longCharts.bio\" date-axis /></div>",
      "<div v-show=\"screen===3\" class=\"card\"><div class=\"card-title\">摄食行为变化 · {{events.length}} 条</div><paged-records :items=\"events\"><template #default=\"{rows}\"><event-list :items=\"rows\" empty-text=\"本时段摄食强度无变化\" /></template></paged-records></div>",
      "</template></show-screens>",
      "<div class=\"show-stats\"><stat-card name=\"现存尾数\" unit=\"尾\" :value=\"last.fish_count\" :digits=\"0\" /><stat-card name=\"预估总体重\" unit=\"kg\" :value=\"last.total_biomass_kg\" /><stat-card name=\"平均体重\" unit=\"g\" :value=\"last.avg_weight_g\" /><stat-card name=\"摄食强度\" :value=\"cn(last.feeding_intensity)\" /></div>",
      "<div class=\"show-actions\"><time-range v-model=\"minutes\" /><secondary-page title=\"观测口径与养殖现场\"><div class=\"card\"><div class=\"card-title\">观测与模型口径</div><div class=\"show-note\">观测指标用于监测，投喂决策见智能板块。体长体重关系 W = lw_a · L^lw_b，参数出处见鱼种档案。观测指标不包含 FCR、死亡数或体长离散度。</div><video-slot title=\"鱼类养殖现场\" desc=\"奇努克鲑真实养殖环境\" /></div></secondary-page><span class=\"show-note\">观测指标不含 FCR、死亡数与体长离散度。</span></div></div></div>"
    ].join('\n')
  };

  PAGES['/fish/heatmap'] = {
    data: function () {
      return {
        tick: 0, grid: [], picked: null, offline: false,
        view: '2d', offline3d: false, pointCloud: null, pointCount: 0, lastUpdate: '',
        poll3d: null, request3d: 0, loadRequest: 0, active: false
      };
    },
    computed: {
      peak: function () {
        let best = { x: 0, y: 0, v: null }, sum = 0, n = 0;
        this.grid.forEach(function (row, y) {
          row.forEach(function (v, x) {
            if (v > best.v) best = { x: x, y: y, v: v };
            sum += v; n++;
          });
        });
        return { best: best, avg: n ? +(sum / n).toFixed(1) : null };
      }
    },
    methods: {
      load: function () {
        const self = this, request = ++this.loadRequest;
        this.syncCageSpec();
        fishGet('/api/heatmap').then(function (d) {
          if (!self.active || request !== self.loadRequest) return;
          self.grid = (d && d.grid) || [];
          self.offline = !!(d && d.offline);
        }).catch(function () {
          if (!self.active || request !== self.loadRequest) return;
          self.grid = []; self.offline = true;
        });
      },
      switchView: function (v) {
        if (v === this.view) return;
        this.destroy3d();
        this.view = v;
        const self = this;
        if (v === '3d') this.$nextTick(function () {
          if (!self.active || self.view !== '3d') return;
          self.init3d(); self.fetch3d();
        });
      },
      syncCageSpec: function () {
        const viewer = global.Exhibit && global.Exhibit.viewer();
        if (!viewer) return;
        const current = global.CurrentCage;
        const cageId = current ? current.get() : 'cage_01';
        const farm = API.farm() || {};
        const cage = (farm.cages || []).find(function (item) { return item.cage_id === cageId; });
        viewer.setSpec(cage && cage.spec, cageId);
      },
      init3d: function () {
        this.syncCageSpec();
      },
      fetch3d: function () {
        if (this.poll3d) clearInterval(this.poll3d);
        const self = this;
        const one = function () {
          if (!self.active || self.view !== '3d') return;
          const request = ++self.request3d;
          const cageId = global.CurrentCage ? global.CurrentCage.get() : 'cage_01';
          fishGet('/api/fish/positions3d', { cage_id: cageId }).then(function (d) {
            if (!self.active || self.view !== '3d' || request !== self.request3d) return;
            if (d.offline || !d.data || !Array.isArray(d.data.points)) {
              self.offline3d = true; self.pointCount = 0;
              self.pointCloud = null;
              return;
            }
            self.offline3d = false;
            self.pointCount = d.data.points.length;
            self.lastUpdate = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            self.pointCloud = d.data;
          }).catch(function () {
            if (!self.active || self.view !== '3d' || request !== self.request3d) return;
            self.offline3d = true; self.pointCount = 0;
            self.pointCloud = null;
          });
        };
        one();
        this.poll3d = setInterval(one, 3000);
      },
      destroy3d: function () {
        this.request3d++;
        if (this.poll3d) { clearInterval(this.poll3d); this.poll3d = null; }
        this.pointCloud = null;
        this.pointCount = 0; this.lastUpdate = '';
      }
    },
    mounted: function () {
      this.active = true;
      this.unsub = API.bind(this, this.load);
      const self = this;
      this.unsubFarm = API.subscribe(function () { self.syncCageSpec(); });
      if (global.CurrentCage) this.unsubCage = global.CurrentCage.subscribe(function () {
        self.request3d++;
        self.syncCageSpec();
        self.pointCloud = null;
        self.pointCount = 0; self.lastUpdate = '';
        if (self.view === '3d') self.fetch3d();
        self.load();
      });
      this.load();
    },
    beforeUnmount: function () {
      this.active = false; this.loadRequest++;
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (this.unsubFarm) { this.unsubFarm(); this.unsubFarm = null; }
      if (this.unsubCage) { this.unsubCage(); this.unsubCage = null; }
      this.destroy3d();
    },
    template: [
      "<div class=\"show-page\"><page-head title=\"鱼类 · 鱼群空间分布\" desc=\"二维密度与后端三维点云 · 每 3 秒更新三维样本\" /><div class=\"show-body\">",
      "<div class=\"show-row three\"><div class=\"card\"><div class=\"card-title\">视图与图例</div><div class=\"show-actions\"><button :class=\"{primary:view==='2d'}\" @click=\"switchView('2d')\">二维网格</button><button :class=\"{primary:view==='3d'}\" @click=\"switchView('3d')\">三维点云</button></div><div class=\"show-note\">二维红色表示相对高密度，不代表告警。三维点色保留后端仿真场景状态。</div><div class=\"kv\"><span class=\"k\">当前视图</span><span>{{view==='2d'?'平面集中区':'空间聚集关系'}}</span><span class=\"k\">链路状态</span><span>{{(view==='2d'?offline:offline3d)?'不可用':'可用'}}</span></div><button @click=\"load\">重新采样</button></div>",
      "<div class=\"card\"><div class=\"card-title\">{{view==='2d'?'二维相对密度':'当前网箱 · 三维鱼群'}}</div><template v-if=\"view==='2d'\"><div v-if=\"offline\" class=\"empty\">视觉链路不可用，不显示上一个值</div><heat-grid v-else title=\"鱼群密度分布\" :grid=\"grid\" unit=\"尾/m³\" :height=\"410\" /></template><template v-else><scene-slot focus=\"stock\" :point-cloud=\"pointCloud\" /><div v-if=\"offline3d\" class=\"show-note\">视觉链路不可用，三维样本已清空。</div></template></div>",
      "<div class=\"card\"><div class=\"card-title\">空间读数</div><div class=\"kv\"><span class=\"k\">最高密度位置</span><span>{{peak.best.v==null?'—':'X'+(peak.best.x+1)+' / Y'+(peak.best.y+1)}}</span><span class=\"k\">三维样本</span><span>{{pointCount}} 个点</span><span class=\"k\">鱼种分布形态</span><span>{{pointCloud ? pointCloud.species + (pointCloud.species==='大黄鱼'?' · 集群·中下层':pointCloud.species==='许氏平鲉'?' · 贴底·分散':'') : '—'}}</span><span class=\"k\">最近更新</span><span>{{lastUpdate||'—'}}</span></div><div class=\"show-note\">点位按接口范围映射到当前网箱。构件与锚位为概念示意。拖拽旋转，滚轮缩放。 鱼群分布为展示仿真，非实测分布。</div><div class=\"show-actions\"><a href=\"#/fish/monitor\">鱼类监测 →</a><a href=\"#/fish/records\">原始记录 →</a></div></div></div>",
      "<div class=\"show-stats\"><stat-card name=\"最高密度\" unit=\"尾/m³\" :value=\"peak.best.v\" /><stat-card name=\"平均密度\" unit=\"尾/m³\" :value=\"peak.avg\" /><stat-card name=\"三维点数\" :value=\"pointCount\" :digits=\"0\" /></div></div></div>"
    ].join('\n')
  };

  PAGES['/fish/growth'] = {
    data: function () {
      return { tick: 0, unsub: null, cageId: global.CurrentCage ? global.CurrentCage.get() : '', farm: null, live: [], gChart: null, loadRequest: 0 };
    },
    computed: {
      cages: function () {
        this.tick;
        const f = this.farm;
        return (f && f.cages) || [];
      },
      cage: function () {
        const self = this;
        return this.cages.filter(function (c) { return c.cage_id === self.cageId; })[0] || null;
      },
      liveLast: function () {
        this.tick;
        return this.live.length ? this.live[this.live.length - 1] : null;
      },
      /* 计划形态为示意；运行样本与历史由后端仿真器生成。 */
      m: function () {
        const c = this.cage;
        const DAY = 86400000;
        const out = { ok: false };
        if (!c || !c.stocking) return out;
        const st = c.stocking;
        let t0, t1, w0, wT;
        t0 = Date.parse(st.date);
        t1 = Date.parse(st.plan_harvest);
        w0 = +st.init_size_g;
        wT = +st.target_size_g;
        if (!(t1 > t0) || !Number.isFinite(w0) || !Number.isFinite(wT) || !(w0 > 0) || !(wT > w0)) return out;
        const now = Date.now();
        const totalDays = (t1 - t0) / DAY;
        const elapsed = Math.max(0, (now - t0) / DAY);
        const planRate = (wT - w0) / totalDays;
        const u = Math.max(0, Math.min(1, (now - t0) / (t1 - t0)));
        const planToday = w0 + (wT - w0) * (3 * u * u - 2 * u * u * u);
        const hasObs = this.liveLast && this.liveLast.avg_weight_g != null && Number.isFinite(Number(this.liveLast.avg_weight_g)) && Number(this.liveLast.avg_weight_g) > 0;
        const obs = hasObs ? Number(this.liveLast.avg_weight_g) : null;
        let etaTs = null, etaDays = null, obsRate = null;
        if (obs != null) {
          obsRate = elapsed > 0 ? (obs - w0) / elapsed : null;
          if (obsRate > 0) {
            etaDays = Math.max(0, (wT - obs) / obsRate);
            etaTs = now + etaDays * DAY;
          }
        }
        /* 固定80段，确保包含两个端点，不向计划范围外延伸。 */
        const planPts = [];
        for (let i = 0; i <= 80; i++) {
          const u = i / 80, t = t0 + (t1 - t0) * u;
          planPts.push([t, Math.round((w0 + (wT - w0) * (3 * u * u - 2 * u * u * u)) * 10) / 10]);
        }
        const obsPts = this.live.filter(function (r) {
          return Number.isFinite(r.ts) && r.avg_weight_g != null && Number.isFinite(Number(r.avg_weight_g)) && Number(r.avg_weight_g) > 0;
        }).map(function (r) { return [r.ts, Number(r.avg_weight_g)]; });
        return {
          ok: true,
          elapsedDays: Math.round(elapsed),
          planToday: Math.round(planToday * 10) / 10,
          planRate: Math.round(planRate * 100) / 100,
          daysToPlan: Math.max(0, Math.round((t1 - now) / DAY)),
          obs: obs,
          obsRate: obsRate != null ? Math.round(obsRate * 100) / 100 : null,
          dev: obs != null ? Math.round((obs - planToday) * 10) / 10 : null,
          etaDays: etaDays != null ? Math.round(etaDays) : null,
          etaTs: etaTs,
          planPts: planPts,
          obsPts: obsPts,
          t1: t1, wT: wT
        };
      },
      charts: function () {
        const x = this.m;
        if (!x.ok) return [];
        const list = [{ name: '计划体重 · S 型示意', unit: 'g', data: x.planPts }];
        if (x.obsPts && x.obsPts.length) list.push({ name: '仿真体重历史', unit: 'g', data: x.obsPts });
        return list;
      },
      thresholds: function () {
        const x = this.m;
        if (!x.ok) return [];
        return [{ value: x.wT, label: '上市规格 ' + x.wT + ' g', color: '#166534' }];
      },
      etaText: function () {
        const x = this.m;
        if (!x.ok || x.etaTs == null) return '';
        return new Date(x.etaTs).toLocaleDateString('zh-CN');
      }
    },
    methods: {
      load: function () {
        const self = this, request = ++this.loadRequest;
        if (global.CurrentCage) this.cageId = global.CurrentCage.get();
        const cageId = this.cageId; this.live = [];
        API.resolve(API.farm(), function (f) { if (request === self.loadRequest) self.farm = f; });
        API.resolve(API.fishGrowth(cageId), function (d) { if (request === self.loadRequest && cageId === self.cageId) self.live = Array.isArray(d) ? d.slice() : []; });
      },
      fmtDate: function (ts) { return ts ? new Date(ts).toLocaleDateString('zh-CN') : ''; },
      selectCage: function () {
        if (global.CurrentCage) global.CurrentCage.set(this.cageId);
        this.load();
      },
      /* 生长曲线（跨数月，公共 TrendChart 的横轴只格式化为时分，故在此按日期轴渲染） */
      renderChart: function () {
        const self = this;
        const x = this.m;
        this.$nextTick(function () {
          const el = self.$refs.growthCanvas;
          if (!el || !x.ok) return;
          let inst = echarts.getInstanceByDom(el);
          if (!inst) inst = echarts.init(el, 'marine');
          self.gChart = inst;
          const palette = ['#9bdce6', '#dfc195'];
          const series = self.charts.map(function (s, i) {
            const color = palette[i % palette.length];
            const line = {
              name: s.name + (s.unit ? '（' + s.unit + '）' : ''),
              type: 'line', showSymbol: false, sampling: 'lttb',
              lineStyle: { width: 1.8, color: color },
              itemStyle: { color: color },
              data: s.data
            };
            if (i === 0) {
              line.markLine = {
                silent: true, symbol: 'none',
                label: { formatter: '{b}', fontSize: 11, position: 'insideEndTop' },
                data: [{ yAxis: x.wT, name: '上市规格 ' + x.wT + ' g',
                         lineStyle: { color: '#166534', type: 'dashed', width: 1 } }]
              };
            }
            return line;
          });
          inst.setOption({
            animation: false,
            grid: { left: 56, right: 20, top: 36, bottom: 32 },
            tooltip: { trigger: 'axis' },
            legend: { top: 0, textStyle: { fontSize: 12 } },
            xAxis: {
              type: 'time',
              axisLabel: {
                fontSize: 11,
                formatter: function (v) {
                  const d = new Date(v);
                  return (d.getMonth() + 1) + '/' + d.getDate();
                }
              },
              splitLine: { show: false }
            },
            yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                     splitLine: { lineStyle: { color: '#294c62' } } },
            series: series
          }, true);
          if (!inst.isDisposed()) inst.resize();
        });
      }
    },
    mounted: function () {
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      this.loadRequest++;
      if (this.gChart) { this.gChart.dispose(); this.gChart = null; }
    },
    watch: {
      cages: function () { if (!this.cageId && this.cages.length) this.cageId = this.cages[0].cage_id; },
      m: function () { this.renderChart(); }
    },
    template: [
      "<div class=\"show-page\"><page-head title=\"鱼类 · 生长模型与预测\" desc=\"台账计划与跨天仿真体重对照 · 预计日期按平均增重估算\" /><div class=\"show-body\">",
      "<div v-if=\"!cages.length\" class=\"card empty\">暂无养殖配置，生长模型不可用。</div>",
      "<show-screens v-else :labels=\"['生长对照与预测','预测条件与依据']\"><template #default=\"{screen}\">",
      "<div v-show=\"screen===0\" class=\"show-row wide\"><div class=\"card\"><div class=\"card-title\">生长曲线 · 仿真历史 / 计划示意</div><div v-if=\"m.ok\" ref=\"growthCanvas\" class=\"chart\" style=\"flex:1;min-height:220px\"></div><div v-else class=\"empty\">放养日期、起捕计划或目标规格不完整，暂无法计算。</div><div class=\"show-note\">历史按台账生成，非现场实测；末点为当前仿真读数。计划形态为示意，参数取自台账；虚线为目标规格。</div></div><div class=\"card\"><div class=\"card-title\">预测结论</div><template v-if=\"m.ok\"><div class=\"hero-label\">预计起捕日期</div><div class=\"hero-value\">{{m.etaDays!=null?etaText:'暂无法预测'}}</div><div class=\"kv\"><span class=\"k\">当前鱼种</span><span>{{cage.species}}</span><span class=\"k\">预计还需</span><span>{{m.etaDays??'—'}} 天</span><span class=\"k\">目标规格</span><span>{{m.wT}} g</span><span class=\"k\">计划起捕</span><span>{{fmtDate(m.t1)}}</span><span class=\"k\">计划平均增重</span><span>{{m.planRate}} g/天</span></div><div v-if=\"m.obs==null\" class=\"show-note\">当前网箱暂无可用体重，仅保留计划与每日仿真历史，暂无法估算起捕日期。</div><div v-else-if=\"m.etaDays==null\" class=\"show-note\">当前体重未增长或已养天数不足，暂无法预测。</div><div v-else class=\"show-note\">已养 {{m.elapsedDays}} 天；按全周期平均增重 {{m.obsRate}} g/天估算。</div></template><button @click=\"load\">重新计算</button></div></div>",
      "<div v-show=\"screen===1\" class=\"show-row two\"><div class=\"card\"><div class=\"card-title\">预测输入与适用条件</div><div v-if=\"cage\" class=\"kv\"><span class=\"k\">当前网箱</span><span>{{cage.cage_name}}</span><span class=\"k\">鱼种</span><span>{{cage.species}}</span><template v-if=\"cage.stocking\"><span class=\"k\">放养日期</span><span>{{cage.stocking.date||'—'}}</span><span class=\"k\">初始规格</span><span>{{cage.stocking.init_size_g??'—'}} g</span><span class=\"k\">计划起捕</span><span>{{cage.stocking.plan_harvest||'—'}}</span><span class=\"k\">目标规格</span><span>{{cage.stocking.target_size_g??'—'}} g</span></template></div><div class=\"show-actions\"><a href=\"#/mgmt/cages\">养殖配置 →</a><button @click=\"load\">核对并重算</button></div></div><div class=\"card\"><div class=\"card-title\">模型与样本依据</div><div class=\"show-note\">计划采用 W=W0+(WT−W0)(3u²−2u³)，u 为放养至计划起捕的时间比例（限 0–1）。形态为示意，参数取自台账；未采用缺少参数的 von Bertalanffy 模型。</div><div class=\"kv\"><span class=\"k\">仿真样本数</span><span>{{live.length}} 条</span><span class=\"k\">历史范围</span><span>放养日至今 · 每日仿真</span><span class=\"k\">模型适用状态</span><span>{{m.ok?'台账条件完整':'台账条件不足'}}</span></div><div class=\"show-note\">预计日期单独按平均增重=(当前仿真体重−初始规格)÷已养天数线性外推，不是 S 型模型预测；不包含 FCR、体长离散度或死亡数。体长体重关系 W=lw_a·L^lw_b 按鱼种取参，出处保留于鱼种档案。</div><div class=\"show-actions\"><a href=\"#/fish/species\">鱼种档案 →</a><a href=\"#/fish/records\">原始观测 →</a></div></div></div>",
      "</template></show-screens><div v-if=\"m.ok\" class=\"show-stats\"><stat-card name=\"当前仿真体重\" unit=\"g\" :value=\"m.obs\" /><stat-card name=\"今日计划体重\" unit=\"g\" :value=\"m.planToday\" /><stat-card name=\"计划偏差\" unit=\"g\" :value=\"m.dev\" /><stat-card name=\"距计划起捕\" unit=\"天\" :value=\"m.daysToPlan\" /></div><div class=\"show-actions\"><select v-model=\"cageId\" @change=\"selectCage\" aria-label=\"预测网箱\"><option v-for=\"c in cages\" :key=\"c.cage_id\" :value=\"c.cage_id\">{{c.cage_name}} · {{c.species}}</option></select><span class=\"show-note\">预测对象与全平台当前网箱同步。</span></div></div></div>"
    ].join('\n')
  };

  PAGES['/fish/records'] = {
    data: function () {
      return { tick: 0, unsub: null, minutes: 60, quality: 'all', rows: [], page: 1, pageSize: 6 };
    },
    computed: {
      filtered: function () {
        const q = this.quality;
        if (q === 'all') return this.rows;
        return this.rows.filter(function (r) { return (r.quality || 'good') === q; });
      },
      /* 最新在前，每屏 6 行，保留完整查询结果。 */
      viewRows: function () {
        const list = this.filtered.slice().reverse();
        return list.slice((this.currentPage - 1) * this.pageSize, this.currentPage * this.pageSize);
      },
      pageCount: function () { return Math.max(1, Math.ceil(this.filtered.length / this.pageSize)); },
      currentPage: function () { return Math.min(this.page, this.pageCount); },
      counts: function () {
        this.tick;
        const c = { total: this.rows.length, suspect: 0, stale: 0 };
        this.rows.forEach(function (r) {
          if (r.quality === 'suspect') c.suspect += 1;
          if (r.quality === 'stale') c.stale += 1;
        });
        return c;
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.fish(this.minutes, window.CurrentCage ? window.CurrentCage.get() : null), function (d) {
          self.rows = (d && d.slice) ? d.slice() : [];
        });
      },
      fmtTs: function (ts) {
        return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '';
      },
      feedCn: function (v) { return CN.feedingIntensity(v); },
      srcCn: function (v) { return (API.sourceText && API.sourceText[v]) || v; },
      qualCn: function (v) { return CN.quality(v || 'good'); },
      dash: function (v) {
        return (v === null || v === undefined || v === '') ? '—' : v;
      }
    },
    watch: { minutes: function () { this.page = 1; this.load(); }, quality: function () { this.page = 1; } },
    mounted: function () {
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      "<div class=\"show-page\"><page-head title=\"鱼类 · 原始数据明细\" desc=\"视觉识别逐条记录 · 查询结果完整保留\" /><div class=\"show-body\">",
      "<div class=\"show-actions\"><time-range v-model=\"minutes\" /><label>质量 <select v-model=\"quality\"><option value=\"all\">全部</option><option value=\"good\">良好</option><option value=\"suspect\">疑似异常</option><option value=\"stale\">超时未更新</option></select></label><button @click=\"load\">重新拉取</button><span class=\"show-note\">共 {{counts.total}} 条 · 疑似异常 {{counts.suspect}} · 超时 {{counts.stale}}</span></div><div class=\"card\" style=\"flex:1\"><div class=\"card-title\">观测记录 · 最新在前</div><table class=\"dt\">",
      "      <thead><tr>",
      "        <th>时间</th><th>站点</th><th>现存尾数</th><th>密度</th>",
      "        <th>平均体长</th><th>平均体重</th><th>总体重</th>",
      "        <th>摄食强度</th><th>数据状态</th>",
      "      </tr></thead>",
      "      <tbody>",
      "        <tr v-for=\"r in viewRows\" :key=\"r.ts\">",
      "          <td class=\"small\">{{ fmtTs(r.ts) }}</td>",
      "          <td>{{ r.site_id }}</td>",
      "          <td>{{ dash(r.fish_count) }}</td>",
      "          <td>{{ dash(r.fish_density) }}<span class=\"unit\">尾/m³</span></td>",
      "          <td>{{ dash(r.avg_length_cm) }}<span class=\"unit\">cm</span></td>",
      "          <td>{{ dash(r.avg_weight_g) }}<span class=\"unit\">g</span></td>",
      "          <td>{{ dash(r.total_biomass_kg) }}<span class=\"unit\">kg</span></td>",
      "          <td>{{ r.feeding_intensity ? feedCn(r.feeding_intensity) : \"—\" }}</td>",
      "          <td><span class=\"small\">{{ qualCn(r.quality) }}</span></td>",
      "        </tr>",
      "        <tr v-if=\"!viewRows.length\">",
      "          <td colspan=\"10\" class=\"muted small\">当前条件下没有记录</td>",
      "        </tr>",
      "      </tbody>",
      "    </table><div class=\"pagination\"><span>共 {{filtered.length}} 条 · 第 {{currentPage}} / {{pageCount}} 页</span><button :disabled=\"currentPage===1\" @click=\"page=currentPage-1\">上一页</button><button :disabled=\"currentPage===pageCount\" @click=\"page=currentPage+1\">下一页</button></div></div><div class=\"show-note\">离线字段显示「—」。公开数据集与文献参数引用见数据来源说明和鱼种档案。</div></div></div>"
    ].join('\n')
  };

  PAGES['/fish/simulator'] = {
    data: function () {
      return { tick: 0, unsub: null, state: null, busy: false, feedback: '' };
    },
    computed: {
      scenarioList: function () {
        return [
          { mode: 'normal', cn: '正常', desc: '所有指标恢复常态' },
          { mode: 'feeding_abnormal', cn: '摄食异常', desc: '摄食强度长时间无、偶发骤增' },
          { mode: 'cluster', cn: '鱼群聚集', desc: '热力图出现局部高密度红区' },
          { mode: 'density_drop', cn: '密度骤降/分散', desc: '现存尾数与密度渐降约 35%' },
          { mode: 'camera_off', cn: '摄像头离线', desc: '视觉指标全部置空、显示「—」' },
        ];
      },
      genList: function () {
        return [
          { action: 'start', cn: '启动' },
          { action: 'pause', cn: '暂停' },
          { action: 'resume', cn: '恢复' },
          { action: 'stop', cn: '停止' },
        ];
      },
      logs: function () {
        this.tick;
        return (this.state && this.state.log) || [];
      }
    },
    methods: {
      load: function () {
        const self = this;
        fishGet('/api/fish/sim').then(function (s) { self.state = s; })
          .catch(function () { self.state = null; });
      },
      send: function (body, msg) {
        const self = this;
        if (this.busy) return;
        this.busy = true;
        fishPost('/api/fish/sim', body).then(function (s) {
          self.state = s;
          self.feedback = msg;
          self.busy = false;
        }).catch(function () { self.busy = false; });
      },
      gen: function (a) {
        const cn = { start: '启动', pause: '暂停', resume: '恢复', stop: '停止' }[a];
        this.send({ action: a }, '已' + cn + '生成器');
      },
      setMode: function (sc) {
        this.send({ mode: sc.mode }, '已切换场景：' + sc.cn);
      },
      resetAll: function () {
        this.send({ action: 'resume', mode: 'normal' },
                  '已一键恢复：生成器运行 + 正常场景');
      },
      fmtTs: function (ts) {
        return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '';
      },
      genColor: function (g) {
        return { running: '#166534', paused: '#92400E', stopped: '#991B1B' }[g] || '#6B7280';
      }
    },
    mounted: function () {
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      "<div class=\"show-page\"><page-head title=\"鱼类 · 仿真控制\" desc=\"鱼类数据生成器与内容场景 · 运行状态与内容模式分别控制\" /><div class=\"show-body\">",
      "<div v-if=\"feedback\" class=\"show-note\" role=\"status\">{{feedback}} · 监测、热力图、生长与明细同步变化</div><div class=\"show-row two\"><div class=\"card\"><div class=\"card-title\">生成器控制</div><template v-if=\"state\"><div class=\"hero-label\">当前运行状态</div><div class=\"hero-value\" :style=\"{color:genColor(state.gen_status)}\">{{state.gen_status_cn}}</div><div class=\"kv\"><span class=\"k\">内容模式</span><span class=\"tag tag-simulated\">{{state.sim_mode_cn}}</span><span class=\"k\">状态更新时间</span><span>{{fmtTs(state.updated_ts)}}</span></div></template><div v-else class=\"empty\">仿真服务状态暂不可用</div><div class=\"show-actions\"><button v-for=\"g in genList\" :key=\"g.action\" @click=\"gen(g.action)\" :disabled=\"busy\">{{g.cn}}</button></div><div class=\"show-note\">停止后视觉指标置空；暂停后数据冻结在计划值。</div><button class=\"primary\" @click=\"resetAll\" :disabled=\"busy\">恢复运行 + 正常场景</button><secondary-page title=\"操作日志 · 最近 30 条\"><div class=\"card\"><paged-records :items=\"logs\"><template #default=\"{rows}\"><table class=\"dt\">",
      "        <thead><tr><th>时间</th><th>操作</th><th>对象</th></tr></thead>",
      "        <tbody>",
      "          <tr v-for=\"(l, i) in rows\" :key=\"i\">",
      "            <td class=\"small\">{{ fmtTs(l.ts) }}</td>",
      "            <td>{{ l.action_cn }}</td>",
      "            <td>{{ l.target }}</td>",
      "          </tr>",
      "          <tr v-if=\"!logs.length\"><td colspan=\"3\" class=\"muted small\">暂无操作记录</td></tr>",
      "        </tbody>",
      "      </table></template></paged-records></div></secondary-page></div><div class=\"card\"><div class=\"card-title\">内容场景</div><button v-for=\"s in scenarioList\" :key=\"s.mode\" :class=\"{primary:state&&state.sim_mode===s.mode}\" @click=\"setMode(s)\" :disabled=\"busy\" style=\"text-align:left;margin-bottom:10px;padding:12px\"><b>{{s.cn}}</b><span class=\"small muted\" style=\"display:block\">{{s.desc}}</span></button><div class=\"show-actions\"><a href=\"#/fish/monitor\">监测 →</a><a href=\"#/fish/heatmap\">空间分布 →</a><a href=\"#/fish/growth\">生长预测 →</a></div></div></div><div class=\"show-note\">仅影响鱼类仿真数据，不写回养殖档案。演示结束后可一键恢复。</div></div></div>"
    ].join('\n')
  };

  /* ---------- 鱼种档案 ----------
   🔴 2026-10-15 队长改：老师意见第 4 条要求「鱼种档案从管理挪进鱼类，领域归属转王浩然」。
      这里原来是**复制**了一份 /mgmt/species，导致全平台两个一模一样的页面。
      现在 /mgmt/species 已删除，**这就是唯一的鱼种档案页**，归鱼类板块。
      （内容本来就是从管理板块搬过来的，归属转移后不再有重复。）
     数据仍来自后端两个参数库（/api/species、/api/species/temp），内容与管理页完全一致；
     管理板块原页面不动。 */
  PAGES['/fish/species'] = {
    data: function () { return { tick: 0, unsub: null, kw: '', onlyOk: false, picked: null, photoFailed: {},
      speciesImg: {
        "大黄鱼":"01_dahuangyu.png","卵形鲳鲹":"02_luoxingtangcan.png","军曹鱼":"03_juncaoyu.png",
        "花鲈":"04_hualu.png","斜带石斑鱼":"05_xiedaishiban.png","鞍带石斑鱼":"06_andaishiban.png",
        "赤点石斑鱼":"07_chidianshiban.png","许氏平鲉":"08_xupingyou.png","大菱鲆":"09_dalingping.png",
        "牙鲆":"10_yaping.png","半滑舌鳎":"11_banhuasheta.png","高体鰤":"12_gaotishi.png",
        "真鲷":"13_zhendiao.png","黑鲷":"14_heidiao.png","黄鳍鲷":"15_huangqidiao.png",
        "美国红鱼":"16_meiguohongyu.png","罗非鱼":"17_luofeiyu.png","大西洋鲑":"18_daxiyanggui.png",
        "虹鳟":"19_hongzun.png","条石鲷":"20_tiaoshidiao.png","圆斑星鲽":"21_yuanbanxingdie.png",
        "大泷六线鱼":"22_dadaoliuxian.png","绿鳍马面鲀":"23_lvqimamian.png","黄盖鲽":"24_huanggaidie.png",
        "鲻":"25_ziyu.png","红鳍东方鲀":"26_hongqidongfangtun.png","黄条鰤":"27_huangtiaoshi.png",
        "梭鱼":"28_suoyu.png","星突江鲽":"29_xingtujiangdie.png","褐篮子鱼":"30_helanziyu.png"
      }
    }; },
    computed: {
      tempAll: function () { this.tick; const t = API.speciesTemp(); return (t && t.species) || []; },
      lwrAll: function () { this.tick; return API.species() || []; },
      rows: function () {
        const lwr = {};
        this.lwrAll.forEach(function (x) { lwr[x.species_cn] = x; });
        return this.tempAll.map(function (t) {
          const l = lwr[t.species_cn] || {};
          return {
            cn: t.species_cn, latin: t.species_latin,
            opt: (t.temp_opt_low != null ? t.temp_opt_low + '~' + t.temp_opt_high : '—'),
            tol: (t.temp_tol_low != null ? t.temp_tol_low + '~' + t.temp_tol_high : '—'),
            warnH: t.temp_warn_high, alarmH: t.temp_alarm_high,
            warnL: t.temp_warn_low, alarmL: t.temp_alarm_low,
            evidence: t.evidence, source: t.source, note: t.note,
            a: l.lw_a, b: l.lw_b, lenType: l.length_type,
            lwrEvidence: l.evidence_cn || l.evidence, lwrSource: l.used_source || l.source_ref || l.source, lwrUrl: l.source_url || null, lwrNote: l.used_note || l.note
          };
        });
      },
      selected: function () {
        const name = this.picked;
        return this.list.find(function (r) { return r.cn === name; }) || this.list[0] || null;
      },
      list: function () {
        const k = this.kw.trim();
        let r = this.rows;
        if (k) {
          r = r.filter(function (x) {
            return (x.cn && x.cn.indexOf(k) >= 0) || (x.latin && x.latin.toLowerCase().indexOf(k.toLowerCase()) >= 0);
          });
        }
        if (this.onlyOk) {
          r = r.filter(function (x) { return x.alarmH !== null || x.alarmL !== null; });
        }
        return r;
      },
      stat: function () {
        const r = this.rows;
        const cnt = {};
        r.forEach(function (x) { cnt[x.evidence] = (cnt[x.evidence] || 0) + 1; });
        return {
          total: r.length,
          withAlarm: r.filter(function (x) { return x.alarmH !== null || x.alarmL !== null; }).length,
          both: r.filter(function (x) { return x.a != null && x.alarmH !== null; }).length,
          byEvidence: cnt
        };
      }
    },
    methods: {
      evColor: function (lv) {
        return {
          '官方/标准': { bg: '#F0FDF4', br: '#86EFAC', fg: '#166534' },
          '学术文献': { bg: '#EFF6FF', br: '#BFDBFE', fg: '#1D4ED8' },
          '技术手册/科普': { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' },
          '没找到': { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' }
        }[lv] || { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' };
      },
      info: function (r) {
        return { level: r.evidence, text: r.note || '（这一条没有补充说明）', source: r.source, url: '' };
      },
      lenTypeCn: function (t) {
        return {
          TL: '全长', SL: '标准长', FL: '叉长',
          'total length': '全长', 'standard length': '标准长', 'fork length': '叉长'
        }[t] || t || '—';
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      "<div class=\"show-page\"><page-head title=\"鱼类 · 鱼种档案\" desc=\"适养范围、生长参数与证据 · 未确认字段保持空缺\" /><div class=\"show-body\">",
      "<div class=\"show-row archive\"><div class=\"card\"><div class=\"card-title\">鱼种目录</div><input v-model=\"kw\" placeholder=\"搜索中文名或拉丁名\" aria-label=\"搜索鱼种\" /><label class=\"small\"><input type=\"checkbox\" v-model=\"onlyOk\" /> 只看有告警线的</label><paged-records :items=\"list\"><template #default=\"{rows}\"><button v-for=\"r in rows\" :key=\"r.cn\" @click=\"picked=r.cn\" :class=\"{primary:selected&&selected.cn===r.cn}\" style=\"text-align:left;padding:8px;margin:0;width:100%\"><b>{{r.cn}}</b></button><div v-if=\"!rows.length\" class=\"empty\">没有匹配的鱼种</div></template></paged-records></div><div class=\"card\"><template v-if=\"selected\"><div class=\"species-profile-head\"><div><div class=\"card-title\">{{selected.cn}} · {{selected.latin}}</div><span class=\"tag\">{{selected.evidence||'未确认'}}</span></div><figure class=\"species-photo\"><img v-if=\"speciesImg[selected.cn]&&!photoFailed[selected.cn]\" :key=\"selected.cn\" :src=\"'/assets/species/'+speciesImg[selected.cn]\" :alt=\"selected.cn\" @error=\"photoFailed[$event.target.alt]=true\" /><div v-else class=\"species-photo-empty\">暂无照片</div></figure></div><show-screens :labels=\"['适养范围与可信状态','生长参数与依据']\"><template #default=\"{screen}\"><div v-if=\"screen===0\"><div class=\"kv\"><span class=\"k\">最适水温</span><span>{{selected.opt}} ℃</span><span class=\"k\">耐受范围</span><span>{{selected.tol}} ℃</span><span class=\"k\">偏低 / 偏高提示</span><span>{{selected.warnL??'—'}} / {{selected.warnH??'—'}} ℃</span><span class=\"k\">低温 / 高温告警</span><span>{{selected.alarmL??'—'}} / {{selected.alarmH??'—'}} ℃</span><span class=\"k\">证据强度</span><span>{{selected.evidence||'未确认'}}</span></div><div class=\"show-note\">{{selected.note||'暂无补充资料'}}</div><div class=\"show-note\">温度参数来源：{{selected.source||'未确认'}}</div><help-dot :info=\"info(selected)\" :label=\"selected.cn+' · 温度参数依据'\" /></div><div v-else><div class=\"kv\"><span class=\"k\">体长体重关系</span><span>W = a · Lᵇ</span><span class=\"k\">参数 a / b</span><span>{{selected.a??'—'}} / {{selected.b??'—'}}</span><span class=\"k\">体长类型</span><span>{{lenTypeCn(selected.lenType)}}</span><span class=\"k\">生长参数证据</span><span>{{selected.lwrEvidence||'未确认'}}</span></div><div class=\"show-note\">{{selected.lwrSource||'体长体重出处尚未确认'}}</div><a v-if=\"selected.lwrUrl\" :href=\"selected.lwrUrl\" target=\"_blank\" rel=\"noopener\">查看体长体重原始出处</a><div class=\"show-note\">{{selected.lwrNote||'体长体重换算须遵循原文献单位与适用阶段。'}}</div><div class=\"show-note\">缺资料的鱼种仍保留在目录，明确呈现待补证据的字段。</div><a href=\"#/fish/growth\">查看生长预测 →</a></div></template></show-screens></template><div v-else class=\"empty\">暂无鱼种档案，需要后端参数库。</div></div></div><div class=\"show-stats\"><stat-card name=\"鱼种总数\" unit=\"种\" :value=\"stat.total\" :digits=\"0\" /><stat-card name=\"有温度告警线\" unit=\"种\" :value=\"stat.withAlarm\" :digits=\"0\" /><stat-card name=\"两库齐备\" unit=\"种\" :value=\"stat.both\" :digits=\"0\" /><stat-card name=\"官方 / 标准证据\" unit=\"种\" :value=\"stat.byEvidence['官方/标准']||0\" :digits=\"0\" /></div></div></div>"
    ].join('\n')
  };

})(window);
