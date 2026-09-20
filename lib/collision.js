'use strict';
/**
 * collision.js — 走位轨迹碰撞精确求解
 *
 * 核心约定：
 *  - 每名表演者在相邻两个关键走位点之间做【分段匀速直线运动】
 *  - 在首点之前保持首点，在末点之后保持末点
 *  - 两名表演者 i/j 碰撞条件：|Pi(t) - Pj(t)| <= ri + rj
 *
 * 求解方法（任意时刻精确，不使用离散帧抽样）：
 *  在两人运动分段发生变化的事件时刻之间，Pi-Pj 是 t 的一次函数，
 *  于是 |Pi(t)-Pj(t)|^2 = (ri+rj)^2 退化为关于 t 的一元二次方程 a t^2 + 2b t + c = 0，
 *  用求根公式解出该子区间内的碰撞区间，再合并相邻区间。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Collision = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const EPS = 1e-9;

  /** 清洗走位点：必须为含 time/x/y 的数组，按 time 排序并去除时刻重复点 */
  function sanitizePoints(rawPoints) {
    if (!Array.isArray(rawPoints)) {
      throw new Error('points 必须是数组');
    }
    const pts = rawPoints
      .map((p) => ({
        time: Number(p.time),
        x: Number(p.x),
        y: Number(p.y),
      }))
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.time - b.time);

    if (pts.length === 0) {
      throw new Error('每名表演者至少需要一个走位点');
    }
    // 时刻重复时保留第一个
    const out = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      if (pts[k].time - out[out.length - 1].time > EPS) out.push(pts[k]);
    }
    return out;
  }

  /**
   * 在给定轨迹上求 t 时刻位置与速度（端点之外保持静止）。
   * 返回 {x, y, vx, vy}
   */
  function stateAt(points, t) {
    const n = points.length;
    if (t <= points[0].time) {
      return { x: points[0].x, y: points[0].y, vx: 0, vy: 0 };
    }
    if (t >= points[n - 1].time) {
      return { x: points[n - 1].x, y: points[n - 1].y, vx: 0, vy: 0 };
    }
    // 二分定位线段
    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (t < points[mid].time) hi = mid;
      else lo = mid;
    }
    const p0 = points[lo];
    const p1 = points[hi];
    const dt = p1.time - p0.time;
    const f = (t - p0.time) / dt;
    return {
      x: p0.x + (p1.x - p0.x) * f,
      y: p0.y + (p1.y - p0.y) * f,
      vx: (p1.x - p0.x) / dt,
      vy: (p1.y - p0.y) / dt,
    };
  }

  /** 在闭区间 [t0,t1] 内求距离平方二次式 q(t)=|s0+v*trel|^2 的最小值信息 */
  function minOnSegment(sx, sy, vx, vy, t0, t1) {
    // q(u) = (sx+vx*u)^2 + (sy+vy*u)^2, u = t - t0, u in [0, L]
    const L = Math.max(0, t1 - t0);
    let uStar = 0;
    const v2 = vx * vx + vy * vy;
    if (v2 > EPS) {
      // q 极小值点 u = -(s·v)/|v|^2
      const uMin = -(sx * vx + sy * vy) / v2;
      uStar = Math.min(L, Math.max(0, uMin));
    }
    const dx = sx + vx * uStar;
    const dy = sy + vy * uStar;
    return { time: t0 + uStar, dist2: dx * dx + dy * dy };
  }

  /**
   * 计算一对表演者的碰撞结果。
   * pA/pB: {radius, points:[{time,x,y}]}
   * 返回 {pair:[i,j], intervals:[{start,end}], firstHit, minDist, minTime}
   */
  function computePair(indexA, indexB, perfA, perfB) {
    const A = { radius: perfA.radius, points: sanitizePoints(perfA.points) };
    const B = { radius: perfB.radius, points: sanitizePoints(perfB.points) };
    const R = A.radius + B.radius;
    const R2 = R * R;

    // 合并两人所有关键时刻作为分段事件（端点外静止，因此覆盖整个时间轴即可）
    const events = [];
    A.points.forEach((p) => events.push(p.time));
    B.points.forEach((p) => events.push(p.time));
    events.sort((a, b) => a - b);
    const uniq = [events[0]];
    for (let k = 1; k < events.length; k++) {
      if (events[k] - uniq[uniq.length - 1] > EPS) uniq.push(events[k]);
    }

    const raw = [];
    let globalMin = { time: uniq[0], dist2: Infinity };

    for (let k = 0; k + 1 < uniq.length; k++) {
      const t0 = uniq[k];
      const t1 = uniq[k + 1];
      if (t1 - t0 <= EPS) continue;

      const sA = stateAt(A.points, t0);
      const sB = stateAt(B.points, t0);
      const vA = stateAt(A.points, (t0 + t1) / 2); // 区间内速度恒定，取中点取值
      const vB = stateAt(B.points, (t0 + t1) / 2);

      // 相对位置 r(t) = s + v*(t-t0)
      const sx = sA.x - sB.x;
      const sy = sA.y - sB.y;
      const vx = vA.vx - vB.vx;
      const vy = vA.vy - vB.vy;

      // 最小间距（该分段）
      const mn = minOnSegment(sx, sy, vx, vy, t0, t1);
      if (mn.dist2 < globalMin.dist2) globalMin = mn;

      // |s + v*u|^2 = R^2, u in [0, L]
      // a u^2 + 2b u + c = 0
      const a = vx * vx + vy * vy;
      const b = sx * vx + sy * vy;
      const c = sx * sx + sy * sy - R2;

      let uLo;
      let uHi;
      if (a <= EPS) {
        // 相对速度≈0：区间内距离恒定
        if (c <= 0) {
          uLo = 0;
          uHi = t1 - t0;
        } else {
          continue;
        }
      } else {
        const disc = b * b - a * c;
        if (disc < -EPS) continue; // 整段无碰撞
        const root = Math.sqrt(Math.max(0, disc));
        uLo = (-b - root) / a;
        uHi = (-b + root) / a;
        uLo = Math.min(t1 - t0, Math.max(0, uLo));
        uHi = Math.min(t1 - t0, Math.max(0, uHi));
        if (uHi < uLo) continue;
      }
      raw.push({ start: t0 + uLo, end: t0 + uHi });
    }

    // 单事件点（两人只有一个相同时刻等退化情形）：直接判端点
    if (uniq.length === 1) {
      const sA = stateAt(A.points, uniq[0]);
      const sB = stateAt(B.points, uniq[0]);
      const d2 = (sA.x - sB.x) ** 2 + (sA.y - sB.y) ** 2;
      globalMin = { time: uniq[0], dist2: d2 };
      if (d2 <= R2) raw.push({ start: uniq[0], end: uniq[0] });
    }

    // 合并相邻/重叠碰撞区间（分段边界处必然相接）
    raw.sort((p, q) => p.start - q.start || p.end - q.end);
    const intervals = [];
    for (const seg of raw) {
      const last = intervals[intervals.length - 1];
      if (last && seg.start <= last.end + 1e-6) {
        if (seg.end > last.end) last.end = seg.end;
      } else {
        intervals.push({ start: seg.start, end: seg.end });
      }
    }

    const minDist = Math.sqrt(globalMin.dist2);
    return {
      pair: [indexA, indexB],
      intervals,
      firstHit: intervals.length > 0 ? intervals[0].start : null,
      minDist,
      minTime: globalMin.time,
    };
  }

  /** 校验一名表演者的输入，返回规范化对象（清洗点、夹取合法半径） */
  function normalizePerformer(p, index) {
    if (!p || typeof p !== 'object') throw new Error(`表演者 ${index + 1} 数据无效`);
    const radius = Number(p.radius);
    if (!Number.isFinite(radius) || radius <= 0 || radius > 10) {
      throw new Error(`表演者 ${index + 1} 的身体半径无效（需为 0~10 之间的正数）`);
    }
    return { radius, points: sanitizePoints(p.points) };
  }

  /**
   * 计算全部表演者对的碰撞信息。
   * performers: [{id?, radius, points:[{time,x,y}]}, ...]，人数 2~8
   * 返回 {pairs:[...], firstHit, firstPair, dangerIntervals, duration}
   */
  function analyze(performers) {
    if (!Array.isArray(performers)) throw new Error('performers 必须是数组');
    if (performers.length < 2 || performers.length > 8) {
      throw new Error('表演者人数必须在 2~8 之间');
    }
    const list = performers.map((p, i) => normalizePerformer(p, i));

    let duration = 0;
    list.forEach((p) => {
      duration = Math.max(duration, p.points[p.points.length - 1].time);
    });
    if (duration <= EPS) duration = 0;

    const pairs = [];
    let firstHit = null;
    let firstPair = null;
    let globalMinDist = Infinity;
    let globalMinTime = null;
    let globalMinPair = null;
    const dangerIntervals = [];

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const res = computePair(i, j, list[i], list[j]);
        pairs.push(res);
        if (res.firstHit !== null && (firstHit === null || res.firstHit < firstHit - EPS)) {
          firstHit = res.firstHit;
          firstPair = [i, j];
        }
        if (res.minDist < globalMinDist) {
          globalMinDist = res.minDist;
          globalMinTime = res.minTime;
          globalMinPair = [i, j];
        }
        res.intervals.forEach((iv) => dangerIntervals.push({ ...iv, pair: [i, j] }));
      }
    }

    dangerIntervals.sort((a, b) => a.start - b.start);

    return {
      pairs,
      firstHit,
      firstPair,
      minDist: globalMinDist,
      minTime: globalMinTime,
      minPair: globalMinPair,
      dangerIntervals,
      duration,
    };
  }

  /** 当前时刻 t 正在碰撞的表演者索引集合 */
  function activeColliders(result, t) {
    const set = new Set();
    for (const iv of result.dangerIntervals) {
      if (t >= iv.start - 1e-6 && t <= iv.end + 1e-6) {
        set.add(iv.pair[0]);
        set.add(iv.pair[1]);
      }
    }
    return set;
  }

  return { EPS, sanitizePoints, stateAt, computePair, analyze, activeColliders };
});
