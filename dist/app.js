/* 本地题库答题 - 前端逻辑 */
'use strict';

/* ==================== 全局状态 ==================== */
const LS_KEY = 'cprz_progress_v1';
let bank = null;            // { meta, questions }
let progress = loadProgress(); // { answers: { [qid]: { sel, correct } } }
let filter = 'all';         // all | unanswered | wrong | correct
let filtered = [];          // 当前筛选下的题目数组
let cur = 0;                // filtered 中的下标
let pending = new Set();    // 多选未确认的选项
let revealedTextId = null;  // 已展开参考答案的填空/简答题 id
let pollTimer = null;

const $ = (id) => document.getElementById(id);

const TYPE_MAP = {
  SINGLE: '单选',
  MULTIPLE: '多选',
  CHECK: '多选',
  MULTI: '多选',
  JUDGE: '判断',
  TRUE_FALSE: '判断',
  ESTIMATE: '判断',
  FILL: '填空',
  SHORT: '简答',
};

function formatType(key) {
  const t = TYPE_MAP[key] || key || '';
  return '【' + t + '】';
}
function isMulti(q) {
  return q.key === 'MULTIPLE' || q.key === 'CHECK' || q.key === 'MULTI';
}
// 无选项题型（填空/简答）：自行输入并对照答案
function isTextual(q) {
  return !(q.options && Object.keys(q.options).length);
}
// 展示用答案：纯字母按规范排序，否则展示原文
function displayAnswer(q) {
  const raw = (q.QA || '').trim();
  return /^[A-Za-z][A-Za-z,，、\s]*$/.test(raw) ? normAnswer(raw) : raw;
}
function normAnswer(s) {
  return ((s || '').toUpperCase().match(/[A-Z]/g) || []).sort().join('');
}

/* ==================== 进度存取 ==================== */
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { answers: p.answers || {} };
  } catch (e) {
    return { answers: {} };
  }
}
function saveProgress() {
  localStorage.setItem(LS_KEY, JSON.stringify(progress));
}

/* ==================== 数据加载 ==================== */
// 静态托管模式：data.js 内嵌 window.BANK，无需任何后端
const IS_STATIC = typeof window.BANK !== 'undefined';

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (json.code !== undefined && json.code !== 1) throw new Error(json.msg || '请求失败');
  return json;
}

async function loadBank() {
  if (IS_STATIC) {
    bank = window.BANK;
    return true;
  }
  try {
    const json = await fetchJSON('/api/questions');
    bank = json.data;
    return true;
  } catch (e) {
    return false;
  }
}

/* ==================== 渲染 ==================== */
function applyFilter() {
  const qs = bank.questions;
  if (filter === 'all') {
    filtered = qs.slice();
  } else {
    filtered = qs.filter((q) => {
      const a = progress.answers[q.id];
      if (filter === 'unanswered') return !a;
      if (filter === 'wrong') return !!a && !a.correct;
      if (filter === 'correct') return !!a && a.correct;
      return true;
    });
  }
  cur = Math.min(cur, Math.max(0, filtered.length - 1));
}

function renderAll() {
  renderStats();
  renderRemoteStats();
  renderPalette();
  renderQuestion();
}

function renderStats() {
  const total = bank.questions.length;
  const answered = Object.keys(progress.answers).filter((id) =>
    bank.questions.some((q) => String(q.id) === String(id))
  ).length;
  const correct = Object.values(progress.answers).filter((a) => a.correct).length;
  $('stTotal').textContent = total;
  $('stAnswered').textContent = answered;
  $('stCorrect').textContent = correct;
  $('stAccuracy').textContent = answered ? Math.round((correct / answered) * 100) + '%' : '-';
}

function renderRemoteStats() {
  const el = $('remoteStats');
  const r = bank.meta && bank.meta.remote;
  if (r && r.yes !== undefined && r.yes !== null) {
    el.textContent = `线上记录：答对 ${r.yes} / 答错 ${r.no} / 未答 ${r.not}（正确率 ${r.accuracy}）`;
  } else {
    el.textContent = '';
  }
}

function renderPalette() {
  const box = $('palette');
  box.innerHTML = '';
  // 按题型分组
  const TYPE_ORDER = ['SINGLE', 'MULTI', 'MULTIPLE', 'CHECK', 'JUDGE', 'FILL', 'SHORT'];
  const groups = new Map();
  filtered.forEach((q, i) => {
    const k = q.key || 'OTHER';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([q, i]);
  });
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  keys.forEach((k) => {
    const items = groups.get(k);
    const title = document.createElement('div');
    title.className = 'palette-group-title';
    title.textContent = formatType(k).replace(/[【】]/g, '') + '（' + items.length + '）';
    box.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    items.forEach(([q, i]) => {
      const a = progress.answers[q.id];
      const btn = document.createElement('button');
      btn.className = 'pbtn ' + (a ? (a.correct ? 'correct' : 'wrong') : 'unanswered');
      if (i === cur) btn.classList.add('current');
      btn.textContent = q.index != null ? q.index : i + 1;
      btn.title = (a ? (a.correct ? '答对' : '答错') : '未作答');
      btn.addEventListener('click', () => { cur = i; renderPalette(); renderQuestion(); });
      grid.appendChild(btn);
    });
    box.appendChild(grid);
  });
}

function currentQ() { return filtered[cur]; }

function renderQuestion() {
  const q = currentQ();
  if (!q) {
    $('qcard').innerHTML = '<div style="text-align:center;color:#7a8699;padding:40px 0">当前筛选下没有题目</div>';
    $('navPos').textContent = '';
    return;
  }
  const a = progress.answers[q.id];
  pending = new Set(a && a.correct !== undefined ? normAnswer(a.sel).split('') : []);

  $('qType').textContent = formatType(q.key);
  $('qIndex').textContent = '第 ' + (q.index != null ? q.index : cur + 1) + ' 题';
  $('qRate').hidden = !q.wrong_rate;
  if (q.wrong_rate) $('qRate').textContent = '全站错误率 ' + q.wrong_rate;

  const mat = $('qMaterial');
  mat.hidden = !q.material_title;
  mat.textContent = q.material_title || '';

  $('qTitle').textContent = q.title || '';

  // 选项
  const box = $('qOptions');
  box.innerHTML = '';
  const entries = Object.entries(q.options || {});
  entries.forEach(([letter, text]) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.dataset.letter = letter;
    div.innerHTML = '<span class="letter">' + letter + '</span><span class="text"></span>';
    div.querySelector('.text').textContent = text;
    div.addEventListener('click', () => onPick(letter));
    box.appendChild(div);
  });
  box.hidden = entries.length === 0;

  // 填空/简答：文本输入面板
  const textual = isTextual(q);
  const revealed = textual && revealedTextId === q.id && !a;
  $('textPanel').hidden = !textual || !!a || revealed;
  $('myText').value = '';
  $('selfJudge').hidden = !revealed;

  // 多选确认条
  $('multiBar').hidden = !isMulti(q);
  updateConfirmBtn();

  paintOptions(a);
  renderResult(q, a);
  $('navPos').textContent = (filtered.length ? cur + 1 : 0) + ' / ' + filtered.length + '（筛选后）';
  $('btnPrev').disabled = cur <= 0;
  $('btnNext').disabled = cur >= filtered.length - 1;
}

function paintOptions(a) {
  const q = currentQ();
  const right = normAnswer(q.QA).split('');
  document.querySelectorAll('#qOptions .option').forEach((el) => {
    const L = el.dataset.letter;
    el.classList.remove('picked', 'right', 'wrongpick', 'disabled');
    if (a) {
      // 已作答：上色并锁定
      el.classList.add('disabled');
      if (right.includes(L)) el.classList.add('right');
      else if (normAnswer(a.sel).includes(L)) el.classList.add('wrongpick');
    } else if (pending.has(L)) {
      el.classList.add('picked');
    }
  });
}

function updateConfirmBtn() {
  const q = currentQ();
  if (!q) return;
  $('btnConfirm').disabled = pending.size === 0 || !!progress.answers[q.id];
}

function renderResult(q, a) {
  const box = $('qResult');
  const textual = isTextual(q);
  const revealed = textual && revealedTextId === q.id;
  if (!a && !revealed) { box.hidden = true; return; }
  box.hidden = false;
  const right = displayAnswer(q);
  const ok = a ? a.correct : null;
  const line = $('resultLine');
  line.innerHTML = '';
  if (ok !== null) {
    const strong = document.createElement('span');
    strong.className = ok ? 'ok' : 'bad';
    strong.textContent = ok ? '✅ 回答正确　' : '❌ 回答错误　';
    line.appendChild(strong);
  }
  const ans = document.createElement('span');
  const mineRaw = a ? a.sel : $('myText').value;
  let mine;
  if (textual) mine = (mineRaw || '').trim() || '（未输入）';
  else mine = normAnswer(mineRaw) || '（未选择）';
  ans.innerHTML = '正确答案：<b style="color:var(--green)">' + escapeHtml(right) + '</b>' +
    (textual
      ? ''
      : '。您的答案：<b style="color:' + (ok ? 'var(--green)' : 'var(--red)') + '">' + escapeHtml(mine) + '</b>');
  line.appendChild(ans);

  const analysis = $('qAnalysis');
  const text = (q.explain || '').trim();
  analysis.hidden = !text;
  analysis.innerHTML = '';
  if (text) {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '参考解析';
    const body = document.createElement('span');
    body.textContent = text;
    analysis.appendChild(label);
    analysis.appendChild(body);
  }

  const note = $('qMyNote');
  note.hidden = !q.mynote;
  if (q.mynote) {
    note.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '我的笔记';
    const body = document.createElement('span');
    body.textContent = q.mynote;
    note.appendChild(label);
    note.appendChild(body);
  }
}

/* ==================== 作答 ==================== */
function onPick(letter) {
  const q = currentQ();
  if (!q || progress.answers[q.id]) return; // 已作答锁定
  if (isMulti(q)) {
    if (pending.has(letter)) pending.delete(letter);
    else pending.add(letter);
    paintOptions(null);
    updateConfirmBtn();
  } else {
    submitAnswer(letter);
  }
}

function submitAnswer(sel) {
  const q = currentQ();
  if (!q || progress.answers[q.id]) return;
  const correct = normAnswer(q.QA) === normAnswer(sel);
  progress.answers[q.id] = { sel, correct, time: Date.now() };
  saveProgress();
  pending = new Set();
  renderStats();
  renderPalette();
  renderQuestion();
}

/* ==================== 复制（与 caishi.js 完全一致的格式） ==================== */
const COLOR_GREEN = '#1DB100';
const COLOR_RED = '#d32f2f';

function cleanCell(s) {
  return (s || '').replace(/\s*\n+\s*/g, ' ').trim();
}
function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCopyContent(data) {
  const title = cleanCell(data.title);
  const options = data.options.map(cleanCell);
  const answer = cleanCell(data.answer);
  const userAnswer = cleanCell(data.userAnswer);
  const analysis = cleanCell(data.analysis);

  // 未作答/无解析：仅复制 题目 + 选项
  if (!answer && !analysis) {
    const plain = [
      formatType(data.type) + ' ' + title,
      options.join('\n')
    ].join('\n') + '\n';
    const html =
      '<div><span style="font-weight:bold;">' + escapeHtml(formatType(data.type)) + ' ' + escapeHtml(title) + '</span></div>' +
      '<div>' + options.map(escapeHtml).join('<br>') + '</div>' +
      '<br>';
    return { plain, html };
  }

  const hasUser = !!userAnswer;
  const correct = hasUser && normAnswer(userAnswer) === normAnswer(answer);

  const answerSet = (answer || '').toUpperCase().match(/[A-Z]/g) || [];
  const userSet = (userAnswer || '').toUpperCase().match(/[A-Z]/g) || [];

  // 选项着色：正确答案整行绿；选错的只把字母标红
  function optionHtml(opt) {
    const m = opt.match(/^([A-Za-z])[.．]\s?(.*)$/);
    if (!m) return escapeHtml(opt);
    const letter = m[1];
    const rest = m[2];
    const L = letter.toUpperCase();
    if (answerSet.includes(L)) {
      return '<span style="color:' + COLOR_GREEN + ';font-weight:bold;">' +
        escapeHtml(letter) + '. ' + escapeHtml(rest) + '</span>';
    }
    if (!correct && userSet.includes(L)) {
      return '<span style="color:' + COLOR_RED + ';font-weight:bold;">' +
        escapeHtml(letter) + '</span>. ' + escapeHtml(rest);
    }
    return escapeHtml(letter) + '. ' + escapeHtml(rest);
  }

  // ---------- 纯文本 ----------
  let answerLinePlain = '正确答案：' + answer;
  if (hasUser) answerLinePlain += '。您的答案：' + userAnswer;
  const plain = [
    formatType(data.type) + ' ' + title,
    options.join('\n'),
    answerLinePlain + (analysis ? '\n' + analysis : '')
  ].join('\n');

  // ---------- HTML（带颜色） ----------
  const optionsHtml = options.map(optionHtml).join('<br>');
  const ansHtml = '<span style="color:' + COLOR_GREEN + ';font-weight:bold;">正确答案：' +
    escapeHtml(answer) + '</span>';
  const userHtml = hasUser
    ? '<span style="font-weight:bold;">您的答案：</span>' +
      '<span style="color:' + (correct ? COLOR_GREEN : COLOR_RED) + ';font-weight:bold;">' +
      escapeHtml(userAnswer) + '</span>'
    : '';
  const answerLineHtml = ansHtml + (userHtml ? '。' + userHtml : '');
  const html =
    '<div><span style="font-weight:bold;">' + escapeHtml(formatType(data.type)) + ' ' + escapeHtml(title) + '</span></div>' +
    '<div>' + optionsHtml + '</div>' +
    '<div>' + answerLineHtml + (analysis ? '<br>' + escapeHtml(analysis) : '') + '</div>' +
    '<br>';

  return { plain: plain + '\n', html };
}

function copyRichText(html, plain) {
  if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      });
      return navigator.clipboard.write([item])
        .then(() => true, () => Promise.resolve(copyHtmlViaSelection(html, plain)));
    } catch (e) {
      return Promise.resolve(copyHtmlViaSelection(html, plain));
    }
  }
  return Promise.resolve(copyHtmlViaSelection(html, plain));
}

function copyHtmlViaSelection(html, plain) {
  try {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    const range = document.createRange();
    range.selectNodeContents(wrap);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(wrap);
    return ok;
  } catch (e) {
    return fallbackCopy(plain);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function copyCurrentQuestion() {
  const q = currentQ();
  if (!q) return;
  const a = progress.answers[q.id];
  const data = {
    type: TYPE_MAP[q.key] || q.key || '',
    title: q.title || '',
    options: Object.entries(q.options || {}).map(([l, t]) => l + '. ' + t),
    answer: displayAnswer(q),
    userAnswer: a ? (isTextual(q) ? (a.sel || '') : normAnswer(a.sel)) : '',
    analysis: (q.explain || '').replace(/答案[:：]\s*[A-Za-z,，、\s]+\s*$/, '').trim(),
  };
  const { plain, html } = buildCopyContent(data);
  copyRichText(html, plain).then((ok) => {
    const tip = $('copyTip');
    tip.textContent = ok ? '已复制（含颜色格式）' : '复制失败';
    setTimeout(() => (tip.textContent = ''), 1800);
  });
}

/* ==================== 导航 ==================== */
function gotoPrev() { if (cur > 0) { cur--; renderPalette(); renderQuestion(); } }
function gotoNext() { if (cur < filtered.length - 1) { cur++; renderPalette(); renderQuestion(); } }

/* ==================== 爬取面板 ==================== */
function showCrawlPanel(show) {
  $('crawlPanel').hidden = !show;
  $('toolbar').hidden = show;
  $('layout').hidden = show;
}

function startCrawl() {
  const catId = Number($('crawlCatId').value) || 18;
  const notes = $('crawlNotes').checked;
  fetchJSON('/api/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cat_id: catId, notes }),
  }).then(() => {
    $('crawlProgress').hidden = false;
    $('btnCancelCrawl').hidden = false;
    pollStatus();
  }).catch((e) => toast('启动失败：' + e.message));
}

$('btnCancelCrawl').addEventListener('click', () => {
  fetch('/api/cancel', { method: 'POST' }).catch(() => {});
  toast('已请求取消，等待任务停止…');
});

function pollStatus() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const s = await (await fetch('/api/status')).json();
      $('crawlPhase').textContent = s.phase || '';
      $('crawlCount').textContent = s.total ? `${s.done} / ${s.total}` : '';
      $('crawlBar').style.width = s.total ? Math.min(100, (s.done / s.total) * 100) + '%' : '0';
      $('crawlLog').textContent = (s.log || []).join('\n');
      const logBox = $('crawlLog');
      logBox.scrollTop = logBox.scrollHeight;
      if (!s.running) {
        clearInterval(pollTimer);
        pollTimer = null;
        $('btnCancelCrawl').hidden = true;
        if (s.errors && s.errors.length) {
          toast('爬取失败：' + s.errors[0]);
        } else if (s.hasBank) {
          toast('爬取完成，题库已加载');
          loadBank().then((ok) => {
            if (ok) {
              cur = 0;
              showCrawlPanel(false);
              applyFilter();
              renderAll();
            }
          });
        }
      }
    } catch (e) { /* ignore */ }
  }, 800);
}

/* ==================== 工具 ==================== */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ==================== 事件绑定 ==================== */
$('btnPrev').addEventListener('click', gotoPrev);
$('btnNext').addEventListener('click', gotoNext);
$('btnConfirm').addEventListener('click', () => submitAnswer([...pending].sort().join('')));
$('btnCopy').addEventListener('click', copyCurrentQuestion);

// 填空/简答：对照答案 + 自评
$('btnTextConfirm').addEventListener('click', () => {
  const q = currentQ();
  if (!q || !isTextual(q) || progress.answers[q.id]) return;
  revealedTextId = q.id;
  renderQuestion();
});
$('btnJudgeRight').addEventListener('click', () => submitTextAnswer(true));
$('btnJudgeWrong').addEventListener('click', () => submitTextAnswer(false));
$('myText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('btnTextConfirm').click();
  }
});

function submitTextAnswer(correct) {
  const q = currentQ();
  if (!q || progress.answers[q.id]) return;
  const sel = $('myText').value.trim();
  progress.answers[q.id] = { sel, correct, time: Date.now() };
  saveProgress();
  revealedTextId = null;
  renderStats();
  renderPalette();
  renderQuestion();
}

$('btnCrawl').addEventListener('click', async () => {
  if (IS_STATIC) return;
  // 已有题库时也可重新爬取
  const s = await (await fetch('/api/status')).json();
  $('crawlCatId').value = (s.bankMeta && s.bankMeta.cat_id) || 18;
  if (s.running) {
    $('crawlProgress').hidden = false;
    pollStatus();
  }
  showCrawlPanel(true);
});
$('btnStartCrawl').addEventListener('click', startCrawl);

$('btnImport').addEventListener('click', () => {
  if (!bank) return;
  let n = 0;
  bank.questions.forEach((q) => {
    if (progress.answers[q.id]) return;
    const s = q.sheet;
    if (s && s.answer) {
      const correct = isTextual(q)
        ? (q.QA || '').trim() === (s.answer || '').trim()
        : normAnswer(q.QA) === normAnswer(s.answer);
      progress.answers[q.id] = { sel: s.answer, correct, imported: true };
      n++;
    }
  });
  saveProgress();
  applyFilter();
  renderAll();
  toast(n ? `已导入 ${n} 条线上作答记录` : '没有可导入的新记录');
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('确定清空本地答题进度吗？（不影响已爬取的题库）')) return;
  progress = { answers: {} };
  saveProgress();
  applyFilter();
  renderAll();
  toast('进度已重置');
});

document.querySelectorAll('.fbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fbtn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.filter;
    applyFilter();
    renderPalette();
    renderQuestion();
  });
});

/* 键盘：B 上一题 / N 下一题 / Enter 确认 / A-D 选答案 */
document.addEventListener('keydown', (e) => {
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
  const q = currentQ();
  const key = e.key.toLowerCase();
  if (key === 'b') { gotoPrev(); e.preventDefault(); }
  else if (key === 'n') { gotoNext(); e.preventDefault(); }
  else if (key === 'enter') {
    if (q && isMulti(q) && pending.size) { submitAnswer([...pending].sort().join('')); e.preventDefault(); }
  } else if (/^[a-h]$/.test(key) && q) {
    const L = key.toUpperCase();
    if (q.options && q.options[L]) { onPick(L); e.preventDefault(); }
  }
});

/* 右键：下一题（Ctrl/Cmd/Shift+右键保留系统菜单，输入框内右键放行） */
document.addEventListener('contextmenu', (e) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target;
  if (t.closest && t.closest('input, textarea, [contenteditable="true"]')) return;
  gotoNext();
  e.preventDefault();
});

/* ==================== 启动 ==================== */
(async function init() {
  if (IS_STATIC) {
    // 静态托管模式：隐藏爬取入口
    $('btnCrawl').hidden = true;
  }
  const hasBank = await loadBank();
  if (hasBank) {
    showCrawlPanel(false);
    applyFilter();
    renderAll();
    // 默认跳到第一道未作答的题
    const firstUn = filtered.findIndex((q) => !progress.answers[q.id]);
    if (firstUn > 0) cur = firstUn;
    renderPalette();
    renderQuestion();
  } else {
    showCrawlPanel(true);
    // 检查是否有正在进行的爬取
    try {
      const s = await (await fetch('/api/status')).json();
      if (s.running) { $('crawlProgress').hidden = false; pollStatus(); }
    } catch (e) { /* ignore */ }
  }
})();
