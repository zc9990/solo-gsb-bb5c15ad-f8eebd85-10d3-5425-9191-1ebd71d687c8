'use strict';
/**
 * sample.js — 内置“路径交叉”样例（20m × 12m 舞台，时间轴 0~10s）
 *  - 甲：水平横穿  (2,6)→(18,6)
 *  - 乙：竖直纵穿  (10,1)→(10,11)   —— 与甲在 t=5s 于舞台正中相撞
 *  - 丙：斜线穿插  (8,1)→(9.4,11)   —— 与乙在末段形成一段擦碰危险区间
 *  - 丁：晚出发反向横移 (14,8)→(4,8)（t=2~8s），与最近者保持约 2m 安全余量
 */

function buildSample() {
  return {
    stage: { width: 20, height: 12 },
    performers: [
      {
        id: 'A',
        name: '甲',
        radius: 0.5,
        points: [
          { time: 0, x: 2, y: 6 },
          { time: 10, x: 18, y: 6 },
        ],
      },
      {
        id: 'B',
        name: '乙',
        radius: 0.5,
        points: [
          { time: 0, x: 10, y: 1 },
          { time: 10, x: 10, y: 11 },
        ],
      },
      {
        id: 'C',
        name: '丙',
        radius: 0.4,
        points: [
          { time: 0, x: 8, y: 1 },
          { time: 10, x: 9.4, y: 11 },
        ],
      },
      {
        id: 'D',
        name: '丁',
        radius: 0.5,
        points: [
          { time: 2, x: 14, y: 8 },
          { time: 8, x: 4, y: 8 },
        ],
      },
    ],
  };
}

if (typeof module === 'object' && module.exports) {
  module.exports = { buildSample };
}
