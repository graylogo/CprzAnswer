#!/usr/bin/env node
// 本地题库答题服务：爬取 hbjcrz.com 题库到本地 + 提供静态答题页面
// 零依赖，需要 Node 18+（内置 fetch）
'use strict';

const http = require('http');
const fs = require('fs');
const fpath = require('path');
const fsp = fs.promises;

const PORT = process.env.PORT || 8899;
const BASE = 'https://www.hbjcrz.com';
const ROOT = __dirname;
const PUBLIC_DIR = fpath.join(ROOT, 'public');
const DATA_DIR = fpath.join(ROOT, 'data');
const BANK_FILE = fpath.join(DATA_DIR, 'bank.json');
const CONFIG_FILE = fpath.join(ROOT, 'config.json');

// ==================== 配置 ====================
function loadConfig() {
  try {
    return Object.assign({ cat_id: 18, token: '' }, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } catch (e) {
    return { cat_id: 18, token: '' };
  }
}

function buildHeaders(cfg) {
  const h = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': BASE + '/',
  };
  // 鉴权：token 请求头（也兼容直接填完整 Cookie）
  const token = (cfg.token || '').trim();
  if (token) {
    if (/^[A-Za-z0-9_-]{8,}$/.test(token) && !token.includes('=')) {
      h['token'] = token;
    } else {
      h['Cookie'] = token;
    }
  }
  return h;
}

async function callApi(pathAndQuery, cfg) {
  const res = await fetch(BASE + pathAndQuery, { headers: buildHeaders(cfg) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${pathAndQuery}`);
  const json = await res.json();
  if (json.code !== 1) throw new Error(`接口返回异常 code=${json.code} msg=${json.msg || ''} (${pathAndQuery})`);
  return json.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================== 爬取 ====================
const crawlState = { running: false, phase: '', done: 0, total: 0, errors: [], log: [] };

function log(msg) {
  crawlState.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (crawlState.log.length > 300) crawlState.log.shift();
}

function ingestQuestion(item, map) {
  let options = null;
  try {
    options = typeof item.options === 'string' ? JSON.parse(item.options) : (item.options || null);
  } catch (e) {
    options = null;
  }
  map.set(item.id, {
    id: item.id,
    index: item.index,
    key: item.key || 'SINGLE',
    QA: item.QA || '',
    title: item.title || '',
    explain: item.explain || '',
    options: options,
    material_title: item.material_title || '',
  });
}

async function crawl(opts) {
  if (crawlState.running) throw new Error('已有爬取任务进行中');
  crawlState.running = true;
  crawlState.phase = '获取题目列表';
  crawlState.done = 0;
  crawlState.total = 0;
  crawlState.errors = [];
  crawlState.log = [];
  crawlState.cancel = false;
  const withNotes = opts.notes !== false;
  const cancelled = () => {
    if (crawlState.cancel) throw new Error('已取消');
    return false;
  };
  try {
    const cfg = loadConfig();
    const catId = Number(opts.cat_id) || cfg.cat_id || 18;
    const map = new Map();

    // ---- 1. 分页抓取题目列表（含题干/选项/解析/正确答案） ----
    const listUrl = (page, size) =>
      `/api/question/list?id=0&type=1&paper_id=0&level=0&tag=1&cat_id=${catId}&page=${page}&size=${size}&ups_id=0`;
    const first = await callApi(listUrl(1, 50), cfg);
    const total = first.total || (first.list || []).length;
    const size = (first.list || []).length || 50;
    (first.list || []).forEach((it) => ingestQuestion(it, map));
    crawlState.total = withNotes ? total * 2 : total;
    crawlState.done = map.size;
    log(`题库总数 ${total}，每页 ${size} 条`);

    const pages = Math.max(1, Math.ceil(total / size));
    for (let p = 2; p <= pages; p++) {
      cancelled();
      const data = await callApi(listUrl(p, size), cfg);
      const before = map.size;
      (data.list || []).forEach((it) => ingestQuestion(it, map));
      crawlState.done = map.size;
      log(`第 ${p}/${pages} 页完成，已入库 ${map.size} 题`);
      if (map.size === before) {
        log(`第 ${p} 页无新增数据，提前结束分页`);
        break;
      }
      await sleep(120);
    }
    const questionCount = map.size;

    // ---- 2. 答题卡（线上历史作答记录 + 线上正确率） ----
    crawlState.phase = '获取线上答题卡';
    let sheet = null;
    try {
      sheet = await callApi(`/api/question/answer_sheet?id=0&type=1&level=1&paper_id=0&cat_id=${catId}&tag=1`, cfg);
      const sheetMap = new Map();
      Object.values(sheet.list || {}).forEach((arr) =>
        (arr || []).forEach((it) => sheetMap.set(it.id, it))
      );
      for (const q of map.values()) {
        const s = sheetMap.get(q.id);
        if (s) q.sheet = { answer: s.answer || '', isYes: s.isYes };
      }
      log(`线上答题卡：已答对 ${sheet.yes}，答错 ${sheet.no}，未答 ${sheet.not}，正确率 ${sheet.accuracy}`);
    } catch (e) {
      log('答题卡获取失败（不影响题库）：' + e.message);
    }

    // ---- 3. 每题笔记（全站错误率等，可跳过） ----
    if (withNotes) {
      crawlState.phase = '抓取每题笔记与全站错误率';
      const ids = [...map.keys()];
      let idx = 0;
      let noteDone = 0;
      const WORKERS = 5;
      const worker = async () => {
        while (idx < ids.length) {
          cancelled();
          const id = ids[idx++];
          try {
            const note = await callApi(`/api/note/index?question_id=${id}&cat_id=${catId}`, cfg);
            if (note) {
              const q = map.get(id);
              q.wrong_rate = note.wrong_rate || '';
              q.mynote = note.mynote || '';
            }
          } catch (e) {
            // 单题失败忽略
          }
          noteDone++;
          crawlState.done = questionCount + noteDone;
        }
      };
      await Promise.all(Array.from({ length: WORKERS }, worker));
      log('笔记与错误率抓取完成');
    }

    // ---- 4. 落盘 ----
    crawlState.phase = '写入本地文件';
    const questions = [...map.values()].sort((a, b) => (a.index || 0) - (b.index || 0));
    const bank = {
      meta: {
        total: questionCount,
        cat_id: catId,
        crawledAt: new Date().toISOString(),
        remote: sheet
          ? { yes: sheet.yes, no: sheet.no, not: sheet.not, score: sheet.score, accuracy: sheet.accuracy }
          : null,
      },
      questions,
    };
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(BANK_FILE, JSON.stringify(bank, null, 1), 'utf8');
    crawlState.phase = '完成';
    log(`爬取完成：共 ${questionCount} 题，已保存到 data/bank.json`);
    return bank;
  } catch (e) {
    crawlState.phase = '失败';
    crawlState.errors.push(String(e.message || e));
    log('爬取失败：' + (e.message || e));
    throw e;
  } finally {
    crawlState.running = false;
  }
}

async function readBank() {
  try {
    return JSON.parse(await fsp.readFile(BANK_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

// ==================== HTTP 服务 ====================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => resolve(buf));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    // ---- API ----
    if (pathname === '/api/status' && req.method === 'GET') {
      const bank = await readBank();
      return sendJson(res, 200, {
        running: crawlState.running,
        phase: crawlState.phase,
        done: crawlState.done,
        total: crawlState.total,
        errors: crawlState.errors,
        log: crawlState.log.slice(-30),
        hasBank: !!bank,
        bankMeta: bank ? bank.meta : null,
      });
    }

    if (pathname === '/api/questions' && req.method === 'GET') {
      const bank = await readBank();
      if (!bank) return sendJson(res, 404, { code: 0, msg: '本地题库不存在，请先爬取' });
      return sendJson(res, 200, { code: 1, data: bank });
    }

    if (pathname === '/api/crawl' && req.method === 'POST') {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) {}
      const opts = {
        cat_id: url.searchParams.get('cat_id') || body.cat_id,
        notes: url.searchParams.has('notes')
          ? url.searchParams.get('notes') !== '0'
          : body.notes !== false,
      };
      crawl(opts).catch(() => {});
      return sendJson(res, 200, { code: 1, msg: '爬取任务已启动' });
    }

    if (pathname === '/api/cancel' && req.method === 'POST') {
      // 通过标记让进行中的爬取尽快停止
      crawlState.cancel = true;
      return sendJson(res, 200, { code: 1, msg: '已请求取消' });
    }

    // ---- 静态文件 ----
    let file = pathname === '/' ? '/index.html' : pathname;
    const full = fpath.join(PUBLIC_DIR, file);
    if (!full.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    try {
      const data = await fsp.readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[fpath.extname(full)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  } catch (e) {
    sendJson(res, 500, { code: 0, msg: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  本地题库答题系统已启动');
  console.log(`  ➜  打开 http://localhost:${PORT} 开始使用`);
  console.log('');
  console.log('  如接口需要登录态，请把浏览器中的 Cookie 填入 config.json 的 cookie 字段后重启');
  console.log('');
});
