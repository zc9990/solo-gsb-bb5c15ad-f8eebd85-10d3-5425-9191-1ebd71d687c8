'use strict';
/* global Collision */

(function () {
  const COLORS = ['#4f8cff', '#ffd166', '#37d99a', '#ff8c42', '#c77dff', '#ff5d8f', '#7bdff2', '#b8f054'];
  const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'];
  const STAGE_W = 20;
  const STAGE_H = 12;

  // ---------- 全局状态 ----------
  const state = {
    stage: { width: STAGE_W, height: STAGE_H },
    performers: [],
    selected: 0,
    currentTime: 0,
    playing: false,
    speed: 1,
  };
  let result = null;
  let uid = 0;
  let drag = null;
  let dragMoved = false;

  // ---------- DOM ----------
  const stageCanvas = document.getElementById('stage-canvas');
  const tlCanvas = document.getElementById('timeline-canvas');
  const sctx = stageCanvas.getContext('2d');
  const tctx = tlCanvas.getContext('2d');
  const btnPlay = document.getElementById('btn-play');
  const btnReset = document.getElementById('btn-reset-t');
  const btnSample = document.getElementById('btn-sample');
  const btnAdd = document.getElementById('btn-add');
  const btnVerify = document.getElementById('btn-verify');
  const selSpeed = document.getElementById('sel-speed');
  const clockEl = document.getElementById('clock-time');
  const perfList = document.getElementById('performer-list');
  const pairTable = document.getElementById('pair-table');
  const sumFirst = document.getElementById('sum-first');
  const sumFirstPair = document.getElementById('sum-first-pair');
  const sumMin = document.getElementById('sum-min');
  const sumMinPair = document.getElementById('sum-min-pair');
  const banner = document.getElementById('danger-banner');
  const toastEl = document.getElementById('toast');

  // ---------- 工具 ----------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (v) => (Math.abs(v) < 1e-9 ? '0.00' : v.toFixed(2));
  function nameOf(i) { return state.performers[i] ? state.performers[i].name : '?'; }
  function sortedPts(p) { return p.slice().sort((a, b) => a.time - b.time); }

  let toastTimer = null;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  // ---------- 数据操作 ----------
  function recompute() {
    try {
      result = Collision.analyze(state.performers);
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    if (state.currentTime > axisDuration()) {
      state.currentTime = axisDuration();
    }
    refreshRowStates();
    renderReport();
    renderAll();
  }

  function axisDuration() {
    // 时间轴至少显示 10s，便于继续编辑
    return Math.max(result ? result.duration : 10, 10);
  }

  async function loadSample() {
    try {
      const res = await fetch('/api/sample');
      const data = await res.json();
      state.stage = data.stage;
      state.performers = data.performers.map((p) => ({
        uid: ++uid,
        name: p.name,
        radius: p.radius,
        points: p.points.map((q) => ({ time: q.time, x: q.x, y: q.y })),
      }));
      state.selected = 0;
      state.currentTime = 0;
      state.playing = false;
      setPlaying(false);
      renderPerformerList();
      recompute();
    } catch (err) {
      toast('加载样例失败：' + err.message, 'error');
    }
  }

  function addPerformer() {
    if (state.performers.length >= 8) return;
    const idx = state.performers.length;
    const cx = STAGE_W / 2 + ((idx % 3) - 1) * 2;
    const cy = STAGE_H / 2 + ((idx % 4) - 1.5);
    state.performers.push({
      uid: ++uid,
      name: NAMES[idx] || '#' + (idx + 1),
      radius: 0.5,
      points: [
        { time: 0, x: cx - 1, y: cy },
        { time: 10, x: cx + 1, y: cy },
      ],
    });
    state.selected = state.performers.length - 1;
    renderPerformerList();
    recompute();
  }

  function removePerformer(i) {
    if (state.performers.length <= 2) {
      toast('至少保留 2 名表演者', 'error');
      return;
    }
    state.performers.splice(i, 1);
    state.selected = clamp(state.selected, 0, state.performers.length - 1);
    renderPerformerList();
    recompute();
  }

  function addPoint(perfIdx, time, x, y) {
    const perf = state.performers[perfIdx];
    // 同一表演者 0.03s 内已有走位点则直接覆盖
    const exist = perf.points.find((p) => Math.abs(p.time - time) < 0.03);
    if (exist) {
      exist.x = x;
      exist.y = y;
      exist.time = time;
    } else {
      perf.points.push({ time, x, y });
      perf.points.sort((a, b) => a.time - b.time);
    }
  }

  // ---------- 表演者列表面板 ----------
  function renderPerformerList() {
    perfList.innerHTML = '';
    btnAdd.disabled = state.performers.length >= 8;
    state.performers.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'performer-row' + (i === state.selected ? ' selected' : '');
      row.dataset.idx = String(i);

      const dot = document.createElement('span');
      dot.className = 'pcolor';
      dot.style.background = COLORS[i % COLORS.length];

      const label = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = p.name;
      const meta = document.createElement('span');
      meta.className = 'pmeta';
      meta.textContent = `${p.points.length} 个走位点`;
      label.append(name, meta);

      const rw = document.createElement('label');
      rw.className = 'radius-wrap';
      rw.textContent = 'r=';
      const rin = document.createElement('input');
      rin.type = 'number';
      rin.min = '0.05';
      rin.max = '5';
      rin.step = '0.05';
      rin.value = String(p.radius);
      rin.addEventListener('input', () => {
        let r = parseFloat(rin.value);
        if (!Number.isFinite(r) || r <= 0) return;
        r = clamp(r, 0.05, 5);
        p.radius = r;
        meta.textContent = `${p.points.length} 个走位点`;
        recompute();
      });
      rw.appendChild(rin);

      const del = document.createElement('button');
      del.className = 'del-btn';
      del.title = '删除该表演者';
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removePerformer(i);
      });

      row.append(dot, label, rw, del);
      row.addEventListener('click', () => {
        state.selected = i;
        refreshRowStates();
      });
      perfList.appendChild(row);
    });
    refreshRowStates();
  }

  function refreshRowStates() {
    const dangerSet = result ? Collision.activeColliders(result, state.currentTime) : new Set();
    [...perfList.children].forEach((row) => {
      const i = Number(row.dataset.idx);
      row.classList.toggle('selected', i === state.selected);
      row.classList.toggle('danger', dangerSet.has(i));
    });
  }

  // ---------- 碰撞报告 ----------
  function renderReport() {
    if (!result) return;
    if (result.firstHit !== null) {
      sumFirst.textContent = `${fmt(result.firstHit)} s`;
      sumFirst.className = 'card-value danger';
      sumFirstPair.textContent = `${nameOf(result.firstPair[0])} ↔ ${nameOf(result.firstPair[1])}`;
    } else {
      sumFirst.textContent = '无碰撞';
      sumFirst.className = 'card-value safe';
      sumFirstPair.innerHTML = '&nbsp;';
    }
    sumMin.textContent = `${result.minDist.toFixed(3)} m`;
    sumMin.className = 'card-value' + (result.minDist <= 0.05 ? ' danger' : '');
    sumMinPair.textContent =
      `t=${fmt(result.minTime)}s · ${nameOf(result.minPair[0])} ↔ ${nameOf(result.minPair[1])}`;

    pairTable.innerHTML = '';
    result.pairs.forEach((pr) => {
      const [a, b] = pr.pair;
      const row = document.createElement('div');
      row.className = 'pair-row' + (pr.intervals.length ? ' has-hit' : '');

      const head = document.createElement('div');
      head.className = 'pair-head';
      const d1 = document.createElement('span');
      d1.className = 'pair-dot';
      d1.style.background = COLORS[a % COLORS.length];
      const d2 = document.createElement('span');
      d2.className = 'pair-dot';
      d2.style.background = COLORS[b % COLORS.length];
      const t = document.createElement('span');
      t.textContent = `${nameOf(a)} × ${nameOf(b)}`;
      const tag = document.createElement('span');
      tag.className = 'pair-tag';
      tag.textContent = pr.intervals.length
        ? `${pr.intervals.length} 段碰撞`
        : '安全';
      head.append(d1, d2, t, tag);

      const detail = document.createElement('div');
      detail.className = 'pair-detail';
      let txt = `最小间距 <b>${pr.minDist.toFixed(3)} m</b>（t=${fmt(pr.minTime)}s）`;
      if (pr.intervals.length) {
        const show = pr.intervals.slice(0, 3);
        txt += '<br>' + show.map((iv) => `碰撞 ${fmt(iv.start)}–${fmt(iv.end)} s`).join('<br>');
        if (pr.intervals.length > 3) txt += `<br>…另有 ${pr.intervals.length - 3} 段`;
        txt += `<br>首次接触 <b>${fmt(pr.firstHit)} s</b>`;
      }
      detail.innerHTML = txt;

      row.append(head, detail);
      pairTable.appendChild(row);
    });
  }

  // ---------- Canvas 尺寸 ----------
  function fitCanvas(canvas, ctx, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = cssHeight || canvas.clientHeight;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  let stageView = { scale: 1, ox: 0, oy: 0 };
  let stageSize = { w: 0, h: 0 };
  let tlSize = { w: 0, h: 0 };

  function resizeAll() {
    const W = state.stage.width;
    const H = state.stage.height;
    const wantH = Math.min(stageCanvas.clientWidth * H / W, 620);
    stageSize = fitCanvas(stageCanvas, sctx, wantH);
    const pad = 34;
    const scale = Math.min((stageSize.w - pad * 2) / W, (stageSize.h - pad * 2) / H);
    stageView = {
      scale,
      ox: (stageSize.w - W * scale) / 2,
      oy: (stageSize.h - H * scale) / 2,
    };
    tlSize = fitCanvas(tlCanvas, tctx);
    renderAll();
  }
  window.addEventListener('resize', resizeAll);

  const worldToScreen = (x, y) => ({
    x: stageView.ox + x * stageView.scale,
    y: stageView.oy + y * stageView.scale,
  });
  const screenToWorld = (px, py) => ({
    x: (px - stageView.ox) / stageView.scale,
    y: (py - stageView.oy) / stageView.scale,
  });

  // ---------- 舞台绘制 ----------
  function drawStage() {
    const { w, h } = stageSize;
    sctx.clearRect(0, 0, w, h);
    const W = state.stage.width;
    const H = state.stage.height;
    const tl = worldToScreen(0, 0);
    const br = worldToScreen(W, H);

    // 背景
    sctx.fillStyle = '#0d1526';
    sctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // 网格（每 1m）
    sctx.strokeStyle = 'rgba(120,144,188,0.12)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    for (let gx = 0; gx <= W; gx++) {
      const a = worldToScreen(gx, 0);
      const b = worldToScreen(gx, H);
      sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y);
    }
    for (let gy = 0; gy <= H; gy++) {
      const a = worldToScreen(0, gy);
      const b = worldToScreen(W, gy);
      sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y);
    }
    sctx.stroke();
    // 舞台边框
    sctx.strokeStyle = 'rgba(147,160,189,0.5)';
    sctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x - 1, br.y - tl.y - 1);

    const dangerSet = result ? Collision.activeColliders(result, state.currentTime) : new Set();
    const t = state.currentTime;

    // 碰撞对之间的连线
    if (result) {
      const seen = new Set();
      for (const iv of result.dangerIntervals) {
        if (t < iv.start - 1e-6 || t > iv.end + 1e-6) continue;
        const key = iv.pair[0] + '-' + iv.pair[1];
        if (seen.has(key)) continue;
        seen.add(key);
        const p1 = Collision.stateAt(sortedPts(state.performers[iv.pair[0]].points), t);
        const p2 = Collision.stateAt(sortedPts(state.performers[iv.pair[1]].points), t);
        const a = worldToScreen(p1.x, p1.y);
        const b = worldToScreen(p2.x, p2.y);
        sctx.strokeStyle = 'rgba(255,77,94,0.85)';
        sctx.setLineDash([6, 5]);
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y);
        sctx.stroke();
        sctx.setLineDash([]);
      }
    }

    // 轨迹与走位点
    state.performers.forEach((perf, i) => {
      const color = COLORS[i % COLORS.length];
      const pts = sortedPts(perf.points);

      // 完整轨迹
      sctx.strokeStyle = color + '66';
      sctx.lineWidth = i === state.selected ? 2.2 : 1.4;
      sctx.beginPath();
      pts.forEach((p, k) => {
        const s = worldToScreen(p.x, p.y);
        if (k === 0) sctx.moveTo(s.x, s.y);
        else sctx.lineTo(s.x, s.y);
      });
      sctx.stroke();

      // 走位点（菱形手柄）
      pts.forEach((p) => {
        const s = worldToScreen(p.x, p.y);
        const r = i === state.selected ? 6 : 4.5;
        sctx.beginPath();
        sctx.moveTo(s.x, s.y - r);
        sctx.lineTo(s.x + r, s.y);
        sctx.lineTo(s.x, s.y + r);
        sctx.lineTo(s.x - r, s.y);
        sctx.closePath();
        sctx.fillStyle = '#0f1420';
        sctx.fill();
        sctx.strokeStyle = color;
        sctx.lineWidth = 2;
        sctx.stroke();
      });
    });

    // 表演者身体
    state.performers.forEach((perf, i) => {
      const color = COLORS[i % COLORS.length];
      const st = Collision.stateAt(sortedPts(perf.points), t);
      const s = worldToScreen(st.x, st.y);
      const rr = perf.radius * stageView.scale;
      const danger = dangerSet.has(i);

      if (danger) {
        sctx.beginPath();
        sctx.arc(s.x, s.y, rr + 6 + Math.sin(performance.now() / 120) * 1.5, 0, Math.PI * 2);
        sctx.strokeStyle = 'rgba(255,77,94,0.9)';
        sctx.lineWidth = 3;
        sctx.stroke();
      }
      sctx.beginPath();
      sctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
      sctx.fillStyle = danger ? 'rgba(255,77,94,0.35)' : color + '33';
      sctx.fill();
      sctx.strokeStyle = danger ? '#ff4d5e' : color;
      sctx.lineWidth = 2;
      sctx.stroke();

      // 中心点 + 名牌
      sctx.beginPath();
      sctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      sctx.fillStyle = danger ? '#ff4d5e' : color;
      sctx.fill();
      sctx.font = '600 12px sans-serif';
      sctx.textAlign = 'center';
      sctx.fillStyle = '#e6ecf7';
      sctx.fillText(perf.name, s.x, Math.max(12, s.y - rr - 8));
    });
  }

  // ---------- 时间轴几何 ----------
  const TL = { left: 64, right: 14, top: 30, bottom: 26, stripH: 12 };
  function tlGeom() {
    const n = Math.max(1, state.performers.length);
    const plotTop = TL.top + TL.stripH + 8;
    const plotBottom = tlSize.h - TL.bottom;
    const laneH = (plotBottom - plotTop) / n;
    const x0 = TL.left;
    const x1 = tlSize.w - TL.right;
    const dur = axisDuration();
    return { n, plotTop, plotBottom, laneH, x0, x1, dur };
  }
  const tToX = (t, g) => g.x0 + (t / g.dur) * (g.x1 - g.x0);
  const xToT = (x, g) => clamp((x - g.x0) / (g.x1 - g.x0), 0, 1) * g.dur;

  function drawTimeline() {
    const { w, h } = tlSize;
    tctx.clearRect(0, 0, w, h);
    const g = tlGeom();

    // 泳道背景与标签
    state.performers.forEach((perf, i) => {
      const y = g.plotTop + i * g.laneH;
      tctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent';
      tctx.fillRect(g.x0, y, g.x1 - g.x0, g.laneH);

      tctx.font = '12px sans-serif';
      tctx.textAlign = 'right';
      tctx.textBaseline = 'middle';
      tctx.fillStyle = COLORS[i % COLORS.length];
      tctx.beginPath();
      tctx.arc(TL.left - 38, y + g.laneH / 2, 5, 0, Math.PI * 2);
      tctx.fill();
      tctx.fillStyle = '#e6ecf7';
      tctx.fillText(perf.name, TL.left - 10, y + g.laneH / 2);

      // 基线
      tctx.strokeStyle = 'rgba(120,144,188,0.35)';
      tctx.lineWidth = 1;
      tctx.beginPath();
      tctx.moveTo(g.x0, y + g.laneH / 2);
      tctx.lineTo(g.x1, y + g.laneH / 2);
      tctx.stroke();

      // 时刻点
      sortedPts(perf.points).forEach((p) => {
        const x = tToX(clamp(p.time, 0, g.dur), g);
        const yy = y + g.laneH / 2;
        const r = 5;
        tctx.beginPath();
        tctx.moveTo(x, yy - r);
        tctx.lineTo(x + r, yy);
        tctx.lineTo(x, yy + r);
        tctx.lineTo(x - r, yy);
        tctx.closePath();
        tctx.fillStyle = '#0f1420';
        tctx.fill();
        tctx.strokeStyle = COLORS[i % COLORS.length];
        tctx.lineWidth = 1.6;
        tctx.stroke();
      });
    });

    // 顶部危险区间汇总条
    tctx.fillStyle = 'rgba(120,144,188,0.15)';
    tctx.fillRect(g.x0, TL.top, g.x1 - g.x0, TL.stripH);
    if (result) {
      for (const iv of result.dangerIntervals) {
        const xa = tToX(iv.start, g);
        const xb = tToX(Math.max(iv.end, iv.start + 0.02), g);
        tctx.fillStyle = 'rgba(255,77,94,0.75)';
        tctx.fillRect(xa, TL.top, Math.max(2, xb - xa), TL.stripH);
      }
    }

    // 时间刻度
    const step = niceStep(g.dur / 10);
    tctx.font = '11px sans-serif';
    tctx.textAlign = 'center';
    tctx.textBaseline = 'top';
    tctx.fillStyle = '#93a0bd';
    tctx.strokeStyle = 'rgba(120,144,188,0.25)';
    for (let tt = 0; tt <= g.dur + 1e-9; tt += step) {
      const x = tToX(tt, g);
      tctx.beginPath();
      tctx.moveTo(x, g.plotBottom);
      tctx.lineTo(x, g.plotBottom + 5);
      tctx.stroke();
      tctx.fillText(tt.toFixed(step < 1 ? 1 : 0), x, g.plotBottom + 7);
    }
    tctx.textAlign = 'left';
    tctx.fillText('危险区间', g.x0, TL.top - 15);

    // 播放头
    const px = tToX(clamp(state.currentTime, 0, g.dur), g);
    tctx.strokeStyle = '#4f8cff';
    tctx.lineWidth = 1.5;
    tctx.beginPath();
    tctx.moveTo(px, TL.top - 4);
    tctx.lineTo(px, g.plotBottom + 4);
    tctx.stroke();
    tctx.beginPath();
    tctx.moveTo(px - 5, TL.top - 12);
    tctx.lineTo(px + 5, TL.top - 12);
    tctx.lineTo(px, TL.top - 3);
    tctx.closePath();
    tctx.fillStyle = '#4f8cff';
    tctx.fill();
  }

  function niceStep(target) {
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / pow;
    let m;
    if (n < 1.5) m = 1;
    else if (n < 3) m = 2;
    else if (n < 7) m = 5;
    else m = 10;
    return m * pow;
  }

  function renderAll() {
    drawStage();
    drawTimeline();
    clockEl.textContent = fmt(Math.min(state.currentTime, axisDuration()));
    // 危险横幅
    if (result) {
      const active = [];
      const seen = new Set();
      for (const iv of result.dangerIntervals) {
        if (state.currentTime < iv.start - 1e-6 || state.currentTime > iv.end + 1e-6) continue;
        const key = iv.pair[0] + '-' + iv.pair[1];
        if (seen.has(key)) continue;
        seen.add(key);
        active.push(`${nameOf(iv.pair[0])} ↔ ${nameOf(iv.pair[1])}`);
      }
      if (active.length) {
        banner.textContent = '⚠ 当前碰撞：' + active.join('　');
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }
  }

  // ---------- 舞台指针交互 ----------
  function stagePointer(e) {
    const rect = stageCanvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  function findStageHandle(px, py) {
    let best = null;
    let bestD = 11;
    state.performers.forEach((perf, i) => {
      perf.points.forEach((p, k) => {
        const s = worldToScreen(p.x, p.y);
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < bestD) {
          bestD = d;
          best = { perf: i, idx: k };
        }
      });
    });
    return best;
  }

  stageCanvas.addEventListener('pointerdown', (e) => {
    const { px, py } = stagePointer(e);
    const hit = findStageHandle(px, py);
    if (hit) {
      drag = { kind: 'stage-point', ...hit };
      dragMoved = false;
      state.selected = hit.perf;
      refreshRowStates();
      stageCanvas.setPointerCapture(e.pointerId);
    }
  });

  stageCanvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.kind !== 'stage-point') {
      const { px, py } = stagePointer(e);
      stageCanvas.style.cursor = findStageHandle(px, py) ? 'grab' : 'crosshair';
      return;
    }
    const { px, py } = stagePointer(e);
    const wpos = screenToWorld(px, py);
    wpos.x = clamp(wpos.x, 0, state.stage.width);
    wpos.y = clamp(wpos.y, 0, state.stage.height);
    const p = state.performers[drag.perf].points[drag.idx];
    if (Math.hypot(p.x - wpos.x, p.y - wpos.y) > 0.01) dragMoved = true;
    p.x = wpos.x;
    p.y = wpos.y;
    recompute();
  });

  stageCanvas.addEventListener('pointerup', () => { drag = null; });

  stageCanvas.addEventListener('dblclick', (e) => {
    if (dragMoved) { dragMoved = false; return; }
    const { px, py } = stagePointer(e);
    const hit = findStageHandle(px, py);
    const perf = state.performers[state.selected];
    if (hit) {
      if (state.performers[hit.perf].points.length <= 1) {
        toast('每名表演者至少保留 1 个走位点', 'error');
        return;
      }
      state.performers[hit.perf].points.splice(hit.idx, 1);
      state.selected = hit.perf;
    } else {
      // 在当前时刻为选中表演者补点
      const wpos = screenToWorld(px, py);
      wpos.x = clamp(wpos.x, 0, state.stage.width);
      wpos.y = clamp(wpos.y, 0, state.stage.height);
      addPoint(state.selected, clamp(state.currentTime, 0, axisDuration()), wpos.x, wpos.y);
    }
    renderPerformerList();
    recompute();
  });

  // ---------- 时间轴指针交互 ----------
  function tlPointer(e) {
    const rect = tlCanvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  function findTlHandle(px, py) {
    const g = tlGeom();
    let best = null;
    let bestD = 10;
    state.performers.forEach((perf, i) => {
      const cy = g.plotTop + i * g.laneH + g.laneH / 2;
      sortedPts(perf.points).forEach((p) => {
        const x = tToX(clamp(p.time, 0, g.dur), g);
        const d = Math.hypot(x - px, cy - py);
        if (d < bestD) {
          bestD = d;
          best = { perf: i, point: p };
        }
      });
    });
    return best;
  }

  function laneAt(py) {
    const g = tlGeom();
    if (py < g.plotTop || py > g.plotBottom) return -1;
    return clamp(Math.floor((py - g.plotTop) / g.laneH), 0, state.performers.length - 1);
  }

  tlCanvas.addEventListener('pointerdown', (e) => {
    const { px, py } = tlPointer(e);
    const g = tlGeom();
    const hit = findTlHandle(px, py);
    dragMoved = false;
    if (hit) {
      drag = { kind: 'tl-point', ...hit };
    } else if (px >= g.x0 && px <= g.x1) {
      drag = { kind: 'scrub' };
      state.currentTime = xToT(px, g);
      renderAll();
      refreshRowStates();
    }
    if (drag) tlCanvas.setPointerCapture(e.pointerId);
  });

  tlCanvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      const { px, py } = tlPointer(e);
      tlCanvas.style.cursor = findTlHandle(px, py) ? 'ew-resize' : 'pointer';
      return;
    }
    const { px } = tlPointer(e);
    const g = tlGeom();
    if (drag.kind === 'scrub') {
      state.currentTime = xToT(px, g);
      renderAll();
      refreshRowStates();
    } else if (drag.kind === 'tl-point') {
      const perf = state.performers[drag.perf];
      const newT = clamp(xToT(px, g), 0, g.dur);
      // 与同一表演者相邻点保持 0.05s 最小间隔
      const others = perf.points.filter((p) => p !== drag.point).sort((a, b) => a.time - b.time);
      let t = newT;
      for (const o of others) {
        if (Math.abs(t - o.time) < 0.05) {
          t = t < o.time ? o.time - 0.05 : o.time + 0.05;
        }
      }
      t = clamp(t, 0, g.dur);
      if (Math.abs(drag.point.time - t) > 1e-4) dragMoved = true;
      drag.point.time = t;
      perf.points.sort((a, b) => a.time - b.time);
      recompute();
    }
  });

  tlCanvas.addEventListener('pointerup', () => { drag = null; });

  tlCanvas.addEventListener('dblclick', (e) => {
    if (dragMoved) { dragMoved = false; return; }
    const { px, py } = tlPointer(e);
    const g = tlGeom();
    if (px < g.x0 || px > g.x1) return;
    const hit = findTlHandle(px, py);
    if (hit) {
      const perf = state.performers[hit.perf];
      if (perf.points.length <= 1) {
        toast('每名表演者至少保留 1 个走位点', 'error');
        return;
      }
      perf.points = perf.points.filter((p) => p !== hit.point);
    } else {
      const lane = laneAt(py);
      if (lane < 0) return;
      const t = xToT(px, g);
      // 位置取该表演者在 t 时刻应处的位置（分段插值/端点静止）
      const st = Collision.stateAt(sortedPts(state.performers[lane].points), t);
      addPoint(lane, t, st.x, st.y);
    }
    renderPerformerList();
    recompute();
  });

  // ---------- 播放控制 ----------
  function setPlaying(on) {
    state.playing = on;
    btnPlay.textContent = on ? '⏸ 暂停' : '▶ 播放';
    btnPlay.classList.toggle('primary', !on);
  }

  btnPlay.addEventListener('click', () => {
    if (state.playing) {
      setPlaying(false);
    } else {
      if (state.currentTime >= axisDuration() - 1e-6) state.currentTime = 0;
      setPlaying(true);
    }
  });
  btnReset.addEventListener('click', () => {
    state.currentTime = 0;
    setPlaying(false);
    renderAll();
    refreshRowStates();
  });
  selSpeed.addEventListener('change', () => {
    state.speed = parseFloat(selSpeed.value);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      btnPlay.click();
    }
  });

  let lastTs = null;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (state.playing) {
      state.currentTime += dt * state.speed;
      if (state.currentTime >= axisDuration()) {
        state.currentTime = axisDuration();
        setPlaying(false);
      }
      renderAll();
      refreshRowStates();
    } else if (result) {
      // 停在危险时刻时保持红色脉冲动画
      const danger = Collision.activeColliders(result, state.currentTime);
      if (danger.size > 0) drawStage();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 顶部按钮 ----------
  btnSample.addEventListener('click', loadSample);
  btnAdd.addEventListener('click', addPerformer);

  btnVerify.addEventListener('click', async () => {
    btnVerify.disabled = true;
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performers: state.performers.map((p) => ({ radius: p.radius, points: p.points })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast('服务端复算失败：' + data.error, 'error');
        return;
      }
      const sv = data.result;
      const fhOk =
        (sv.firstHit === null && result.firstHit === null) ||
        (sv.firstHit !== null && result.firstHit !== null &&
          Math.abs(sv.firstHit - result.firstHit) < 1e-9);
      const mdOk = Math.abs(sv.minDist - result.minDist) < 1e-9;
      if (fhOk && mdOk) {
        toast(`服务端复算一致：首次 ${sv.firstHit === null ? '无碰撞' : fmt(sv.firstHit) + 's'}，最小间距 ${sv.minDist.toFixed(3)}m`, 'ok');
      } else {
        toast('服务端结果与前端不一致，请检查', 'error');
      }
    } catch (err) {
      toast('复算请求失败：' + err.message, 'error');
    } finally {
      btnVerify.disabled = false;
    }
  });

  // ---------- 启动 ----------
  resizeAll();
  loadSample();
})();
