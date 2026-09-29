#!/usr/bin/env node
// 生成可托管到互联网的纯静态站点到 dist/
// 用法：node build_static.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BANK_FILE = path.join(ROOT, 'data', 'bank.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(BANK_FILE)) {
  console.error('未找到 data/bank.json，请先运行 node server.js 并完成爬取');
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1. 数据内嵌为 data.js（纯静态，无 CORS / fetch 依赖，刷新/断网均可用）
const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
const dataJs = 'window.BANK = ' + JSON.stringify(bank) + ';\n';
fs.writeFileSync(path.join(DIST, 'data.js'), dataJs, 'utf8');

// 2. 复制样式与脚本
fs.copyFileSync(path.join(PUBLIC_DIR, 'style.css'), path.join(DIST, 'style.css'));
fs.copyFileSync(path.join(PUBLIC_DIR, 'app.js'), path.join(DIST, 'app.js'));

// 3. index.html：注入 data.js（在 app.js 之前）
let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
if (!html.includes('data.js')) {
  html = html.replace('<script src="app.js"></script>', '<script src="data.js"></script>\n<script src="app.js"></script>');
}
// 静态版标题
html = html.replace('<title>本地题库答题系统</title>', '<title>题库答题</title>');
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');

const kb = (fs.statSync(path.join(DIST, 'data.js')).size / 1024).toFixed(1);
console.log('静态站点已生成到 dist/');
console.log(`  dist/index.html`);
console.log(`  dist/data.js    (${kb} KB，内嵌 ${bank.questions.length} 题)`);
console.log(`  dist/style.css`);
console.log(`  dist/app.js`);
console.log('');
console.log('本地预览：');
console.log('  npx serve dist    或    python3 -m http.server -d dist 8000');
console.log('部署：把 dist/ 目录上传到任意静态托管即可（GitHub Pages / Cloudflare Pages / Netlify / Vercel）');
