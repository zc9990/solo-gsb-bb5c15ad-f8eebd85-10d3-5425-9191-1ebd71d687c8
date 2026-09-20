'use strict';

const path = require('path');
const express = require('express');
const { analyze } = require('./lib/collision');
const { buildSample } = require('./lib/sample');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use(express.static(path.join(__dirname, 'public')));
// 前后端共用同一份碰撞计算库
app.use('/lib', express.static(path.join(__dirname, 'lib')));

// 内置样例
app.get('/api/sample', (req, res) => {
  res.json(buildSample());
});

// 服务端权威复算（与前端使用同一份 lib/collision.js）
app.post('/api/analyze', (req, res) => {
  try {
    const { performers } = req.body || {};
    if (!Array.isArray(performers) || performers.length < 2 || performers.length > 8) {
      return res.status(400).json({ error: '表演者人数必须在 2~8 之间' });
    }
    const result = analyze(performers);
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log('走位轨迹碰撞排练台已启动');
  console.log(`监听地址: http://${HOST}:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log(`本机访问: http://localhost:${PORT}`);
  }
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
