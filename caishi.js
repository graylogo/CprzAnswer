// ==UserScript==
// @name         【题库增强】快捷键导航 + 解除文本限制
// @namespace    https://github.com
// @version      3.4
// @description  为题库网站（才士/羿过/软考大人）添加上一题(B)/下一题(N)快捷键、右键下一题功能、答案复制按钮，并解除文本选择复制限制。
// @author       Script Integrator
// @match        *://*.caishi.cn/*
// @match        *://*.yiguojy.com/*
// @match        *://ruankaodaren.com/*
// @match        *://*.ruankaodaren.com/*
// @grant        none
// @run-at       document-start
// @all-frames
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 第一部分：解除文本选择限制 ====================
    // 此部分确保在所有网页交互开始前执行，优先级最高
    function enableTextSelection() {
        // 1. 核心：通过CSS最高优先级覆盖所有限制样式
        const cssOverride = `
            /* 全局覆盖用户选择限制 */
            * {
                user-select: auto !important;
                -webkit-user-select: auto !important;
                -moz-user-select: auto !important;
                -ms-user-select: auto !important;
            }
            /* 针对题库关键区域的强化覆盖 */
            .question-content, .problem-text, .answer-content, .analysis-content,
            .option-item, .select-item, .tFCard, .operation-box {
                user-select: text !important;
                -webkit-user-select: text !important;
                cursor: auto !important;
            }
        `;

        if (!document.getElementById('text-select-enabler')) {
            const style = document.createElement('style');
            style.id = 'text-select-enabler';
            style.textContent = cssOverride;
            if (document.head) {
                document.head.appendChild(style);
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    document.head.appendChild(style);
                });
            }
        }

        // 2. 清理内联样式限制
        function clearInlineRestrictions() {
            document.querySelectorAll('*').forEach(el => {
                if (el.style) {
                    if (el.style.userSelect === 'none') el.style.userSelect = '';
                    if (el.style.webkitUserSelect === 'none') el.style.webkitUserSelect = '';
                }
            });
        }

        setTimeout(clearInlineRestrictions, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enableTextSelection);
    } else {
        enableTextSelection();
    }

    // ==================== 通用工具函数 ====================
    // 按文本内容查找可见按钮（兼容各种 DOM 结构，作为选择器的兜底）
    function findButtonByText(text) {
        const normalized = text.replace(/\s+/g, '');
        function scan(selector) {
            const els = document.querySelectorAll(selector);
            for (const el of els) {
                const t = (el.textContent || '').replace(/\s+/g, '');
                // 文本完全匹配，且元素可见
                if (t === normalized && el.getClientRects().length > 0) {
                    return el;
                }
            }
            return null;
        }
        // 优先匹配真正的可点击标签
        return scan('a, button') || scan('div, span, li, i, em, p');
    }

    // 获取上一题/下一题按钮：优先精确选择器，失败则按文本兜底查找
    function getNavigationButtons() {
        const hostname = window.location.hostname;
        let prevButton = null;
        let nextButton = null;

        if (hostname.includes('yiguojy.com')) {
            const cards = document.querySelectorAll('.tFoot .tFCard');
            if (cards.length >= 3) {
                prevButton = cards[0];
                nextButton = cards[cards.length - 1];
            } else if (cards.length === 2) {
                prevButton = cards[0];
                nextButton = cards[1];
            }
            if (!prevButton) prevButton = findButtonByText('上一题');
            if (!nextButton) nextButton = findButtonByText('下一题');
        } else if (hostname.includes('caishi.cn')) {
            prevButton = document.querySelector('.operation-box .pref');
            nextButton = document.querySelector('.operation-box .after');
            if (!prevButton) prevButton = findButtonByText('上一题');
            if (!nextButton) nextButton = findButtonByText('下一题');
        } else if (hostname.includes('ruankaodaren.com')) {
            // 底部操作栏：上一题 / 收藏 / 解析 / 下一题
            const list = document.querySelector('.aw-btom .aw-bom-list');
            if (list) {
                list.querySelectorAll('button').forEach(btn => {
                    const text = (btn.textContent || '').trim();
                    if (text.includes('上一题')) prevButton = btn;
                    else if (text.includes('下一题')) nextButton = btn;
                });
            }
            if (!prevButton) prevButton = findButtonByText('上一题');
            if (!nextButton) nextButton = findButtonByText('下一题');
        } else {
            prevButton = findButtonByText('上一题');
            nextButton = findButtonByText('下一题');
        }

        return { prevButton, nextButton };
    }

    // 触发点击：优先派发完整 MouseEvent（兼容 Vue/React 框架），失败则回退原生 click
    function clickButton(el) {
        try {
            el.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        } catch (e) {
            el.click();
        }
    }

    // ==================== 第二部分：键盘与右键快捷键 ====================
    function handleContextMenu(e) {
        // 1. 输入框/可编辑区域内右键：放行，方便粘贴
        const target = e.target;
        if (target.closest && target.closest('input, textarea, [contenteditable="true"]')) return;
        // 2. 按住 Ctrl/Cmd/Shift + 右键：放行系统菜单（用于复制等操作）
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;

        // 3. 其余情况：普通右键 → 下一题
        const { nextButton } = getNavigationButtons();
        if (nextButton) {
            console.log('🖱️ 右键触发下一题：', nextButton.tagName, '.',
                String(nextButton.className || '').slice(0, 80));
            clickButton(nextButton);
            e.preventDefault();
        } else {
            console.warn('[右键诊断] 未找到「下一题」按钮，目标元素：',
                target.tagName, '.', (target.className || '').slice(0, 80));
        }
    }

    function handleKeyDown(e) {
        // 检查是否在输入框中
        const activeElement = document.activeElement;
        const isInput = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
        if (isInput) return;

        const { prevButton, nextButton } = getNavigationButtons();
        const key = e.key.toLowerCase();

        switch (key) {
            case 'b': // 上一题
                if (prevButton) {
                    console.log('⌨️ 按下 B 键，跳转上一题');
                    clickButton(prevButton);
                    e.preventDefault();
                }
                break;
            case 'n': // 下一题
                if (nextButton) {
                    console.log('⌨️ 按下 N 键，跳转下一题');
                    clickButton(nextButton);
                    e.preventDefault();
                }
                break;
        }
    }

    // ==================== 第三部分：答案复制按钮（yiguojy 单选/多选） ====================
    // 从题卡中提取 题目/选项/答案/解析/我的答案
    function extractQuestionData(card) {
        const data = { type: '', title: '', options: [], answer: '', userAnswer: '', analysis: '' };
        const typeEl = card.querySelector('.cardHeader .type');
        const issueEl = card.querySelector('.cardHeader .issue');
        data.type = typeEl ? typeEl.textContent.trim() : '';
        // 去掉题号前缀，如 "12.xxx" / "12．xxx"
        data.title = (issueEl ? issueEl.textContent.trim() : '')
            .replace(/^\d+\s*[.、．]\s*/, '');

        // 选项：字母 + ". " + 内容
        card.querySelectorAll('.cardBody .optionItem').forEach(item => {
            const letter = item.querySelector('.radio');
            const text = item.querySelector('.spTitle');
            if (letter && text) {
                data.options.push(letter.textContent.trim() + '. ' + text.textContent.trim());
            }
        });

        // 参考答案
        const answerEl = card.querySelector('.cardAnswer .answer');
        data.answer = answerEl ? answerEl.textContent.trim() : '';

        // 我的答案
        const userAnswerEl = card.querySelector('.cardAnswer .userAnswer');
        data.userAnswer = userAnswerEl ? userAnswerEl.textContent.trim() : '';

        // 参考解析（去掉末尾自带的 "答案：X"）
        card.querySelectorAll('.cardAnswer .top2').forEach(top2 => {
            const label = top2.querySelector('.label');
            if (label && label.textContent.includes('参考解析')) {
                const rightAnswer = top2.querySelector('.rightAnswer');
                if (rightAnswer) {
                    data.analysis = rightAnswer.textContent.trim()
                        .replace(/答案[:：]\s*[A-Za-z]+\s*$/, '').trim();
                }
            }
        });
        return data;
    }

    // 生成复制内容：纯文本 + 带颜色 HTML（粘贴到 Apple Pages 保留颜色）
    // 注意：值内换行统一替换为空格，保证格式规整
    function cleanCell(s) {
        return (s || '').replace(/\s*\n+\s*/g, ' ').trim();
    }

    function escapeHtml(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 类型转换：[单选题] → 【单选】，[多选题] → 【多选】
    function formatType(raw) {
        const inner = (raw || '').replace(/[\[\]【】]/g, '');
        const clean = inner
            .replace('单选题', '单选')
            .replace('多选题', '多选')
            .replace('判断题', '判断');
        return '【' + clean + '】';
    }

    const COLOR_GREEN = '#1DB100'; // 正确答案
    const COLOR_RED = '#d32f2f';    // 选错

    function buildCopyContent(data) {
        const title = cleanCell(data.title);
        const options = data.options.map(cleanCell); // 每个选项独立一行
        const answer = cleanCell(data.answer);
        const userAnswer = cleanCell(data.userAnswer);
        const analysis = cleanCell(data.analysis);

        // 未作答/无解析：仅复制 题目 + 选项（如软考大人未答过的题目）
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
        const correct = hasUser && userAnswer === answer;

        const answerSet = (answer || '').toUpperCase().match(/[A-Z]/g) || [];
        const userSet = (userAnswer || '').toUpperCase().match(/[A-Z]/g) || [];

        // 选项着色：正确答案整行绿；选错的只把字母标红，内容保持默认色
        function optionHtml(opt) {
            const m = opt.match(/^([A-Za-z])[.．]\s?(.*)$/);
            if (!m) return escapeHtml(opt);
            const letter = m[1];
            const rest = m[2];
            const L = letter.toUpperCase();
            if (answerSet.includes(L)) {
                // 正确答案选项：整行绿色加粗
                return '<span style="color:' + COLOR_GREEN + ';font-weight:bold;">' +
                    escapeHtml(letter) + '. ' + escapeHtml(rest) + '</span>';
            }
            if (!correct && userSet.includes(L)) {
                // 选错的选项：仅字母标红加粗
                return '<span style="color:' + COLOR_RED + ';font-weight:bold;">' +
                    escapeHtml(letter) + '</span>. ' + escapeHtml(rest);
            }
            return escapeHtml(letter) + '. ' + escapeHtml(rest);
        }

        // ---------- 纯文本（无颜色，选项每行一个） ----------
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
            '<br>'; // 末尾换行：连续复制粘贴时题与题之间空一行

        // 末尾补一个换行符：连续复制粘贴时题与题之间空一行
        return { plain: plain + '\n', html };
    }

    // 复制富文本：text/html 带颜色 + text/plain 兜底
    function copyRichText(html, plain) {
        // 优先异步 Clipboard API（Chrome/新版 Safari 支持 text/html）
        if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
            try {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' })
                });
                return navigator.clipboard.write([item])
                    .then(() => true, () => copyHtmlViaSelection(html, plain));
            } catch (e) {
                return Promise.resolve(copyHtmlViaSelection(html, plain));
            }
        }
        return Promise.resolve(copyHtmlViaSelection(html, plain));
    }

    // 兜底：选中隐藏富文本节点后 execCommand 复制（保留颜色）
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

    // 通用：创建复制按钮（点击时调用 getData 提取当前题卡数据）
    function makeCopyButton(getData) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copyBtn';
        btn.textContent = '📋 复制';
        btn.style.cssText = 'margin-left:10px;font-size:12px;height:26px;line-height:24px;' +
            'padding:0 12px;border:none;border-radius:13px;' +
            'background:#1DB100;cursor:pointer;color:#fff;white-space:nowrap;' +
            'flex-shrink:0;align-self:center;';
        btn.addEventListener('click', () => {
            const data = getData();
            const { plain, html } = buildCopyContent(data);
            copyRichText(html, plain).then(ok => {
                btn.textContent = ok ? '✅ 已复制' : '❌ 复制失败';
                setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
            });
        });
        return btn;
    }

    // ---- yiguojy：为已出答案的单选/多选卡片添加复制按钮 ----
    function ensureYiguojyCopyButtons() {
        document.querySelectorAll('.questionCard').forEach(card => {
            if (!card.querySelector('.cardAnswer')) return; // 答案尚未出现
            if (card.querySelector('.copyBtn')) return;     // 已添加过，去重
            const typeEl = card.querySelector('.cardHeader .type');
            const typeText = typeEl ? typeEl.textContent : '';
            if (!typeText.includes('单选') && !typeText.includes('多选')) return;

            const btn = makeCopyButton(() => extractQuestionData(card));

            // 插入到右上角操作区（收藏/反馈旁），否则插到答案区顶部
            const tr = card.querySelector('.cardAnswer .top1 .tr');
            if (tr) {
                tr.appendChild(btn);
            } else {
                const ans = card.querySelector('.cardAnswer');
                ans.insertBefore(btn, ans.firstChild);
            }
        });
    }

    // ---- caishi：从题卡容器提取 题目/选项/答案/解析 ----
    function extractCaishiQuestionData(container) {
        const data = { type: '', title: '', options: [], answer: '', userAnswer: '', analysis: '' };

        // 题型：从 typeImg 的 src 末尾解析，如 .../单选题.png
        const typeImg = container.querySelector('img.typeImg');
        const src = typeImg ? (typeImg.src || typeImg.getAttribute('src') || '') : '';
        const tm = src.match(/([^/]+?)(?:\.png|\.jpg|\.jpeg)/i);
        if (tm) {
            try { data.type = decodeURIComponent(tm[1]); }
            catch (e) { data.type = tm[1]; }
        }

        // 题干
        const stem = container.querySelector('.question-title .stem');
        data.title = stem ? stem.textContent.trim() : '';

        // 选项：字母 + ". " + 内容
        container.querySelectorAll('.answer-item').forEach(item => {
            const letter = item.querySelector('.option');
            const text = item.querySelector('.answer-content');
            if (letter && text) {
                data.options.push(letter.textContent.trim() + '. ' + text.textContent.trim());
            }
        });

        // 正确答案 / 我的答案
        const ansEl = container.querySelector('.question-bot .answer .right .anster-item');
        data.answer = ansEl ? ansEl.textContent.trim() : '';
        const userEl = container.querySelector('.question-bot .onwer-answer .anster-item');
        data.userAnswer = userEl ? userEl.textContent.trim() : '';

        // 解析（去掉末尾自带的 "答案：X"）
        const parsing = container.querySelector('.question-bot .analysis .parsing');
        data.analysis = parsing ? parsing.textContent.trim()
            .replace(/答案[:：]\s*[A-Za-z,\s]+\s*$/, '').trim() : '';

        return data;
    }

    // ---- caishi：为已出答案的题卡添加复制按钮 ----
    function ensureCaishiCopyButtons() {
        document.querySelectorAll('.question-detail').forEach(container => {
            const answerRow = container.querySelector('.question-bot .answer');
            if (!answerRow) return;                          // 答案尚未出现
            if (container.querySelector('.copyBtn')) return; // 已添加过，去重
            if (!answerRow.querySelector('.right .anster-item')) return; // 尚无正确答案

            const btn = makeCopyButton(() => extractCaishiQuestionData(container));

            // 插到"我的笔记"行的按钮前，与"添加做题笔记"并列
            const noteBtn = container.querySelector('.question-bot .myNote .btn');
            if (noteBtn && noteBtn.parentNode) {
                noteBtn.parentNode.insertBefore(btn, noteBtn);
                return;
            }
            // 兜底：插到解析行后
            const analysisRow = container.querySelector('.question-bot .analysis');
            if (analysisRow && analysisRow.parentNode) {
                analysisRow.parentNode.insertBefore(btn, analysisRow.nextSibling);
                return;
            }
            // 最后兜底：答案区顶部
            const bot = container.querySelector('.question-bot');
            if (bot) bot.insertBefore(btn, bot.firstChild);
        });
    }

    // ---- ruankao大人：从题卡容器提取 题目/选项/答案/解析 ----
    function extractRuankaoQuestionData(container) {
        const data = { type: '', title: '', options: [], answer: '', userAnswer: '', analysis: '' };

        // 题型：如 "[单选题]" / "[多选题]" / "[判断题]"
        const orderEl = container.querySelector('.question-order');
        data.type = orderEl ? orderEl.textContent.trim() : '';

        // 题干：取 #answerInfotitle 内 <p>；没有则去掉章节行后取整块文本
        const infoEl = container.querySelector('#answerInfotitle');
        if (infoEl) {
            const p = infoEl.querySelector('p');
            if (p) {
                data.title = p.textContent.trim();
            } else {
                const clone = infoEl.cloneNode(true);
                const chapter = clone.querySelector('.secondChapterName');
                if (chapter) chapter.remove();
                data.title = clone.textContent.trim();
            }
        }

        // 选项：.awoption 字母 + 同行的 .content 内容
        container.querySelectorAll('.questionaw .awoption').forEach(letterEl => {
            const row = letterEl.parentElement;
            const content = row ? row.querySelector('.content') : null;
            if (content) {
                const letter = letterEl.textContent.trim();
                data.options.push(letter + '. ' + content.textContent.trim());
            }
        });

        // 答案区："答案" 分节内的 right-key 行
        container.querySelectorAll('.answer-to-the-question').forEach(sec => {
            const divider = sec.querySelector('.el-divider__text');
            if (!divider || !((divider.textContent || '').includes('答案'))) return;
            sec.querySelectorAll('.right-key').forEach(rk => {
                const t = (rk.textContent || '').trim();
                let m = t.match(/正确答案[:：]\s*([A-Za-z,，、\s]+?)\s*$/);
                if (m) data.answer = m[1].trim();
                m = t.match(/你的答案[:：]\s*([\s\S]+?)\s*$/);
                if (m) data.userAnswer = m[1].trim();
            });
        });

        // 解析区："解析" 分节内的 right-key 文本（去掉末尾重复答案）
        container.querySelectorAll('.answer-to-the-question').forEach(sec => {
            const divider = sec.querySelector('.el-divider__text');
            if (!divider || !((divider.textContent || '').includes('解析'))) return;
            const rk = sec.querySelector('.right-key');
            if (rk) {
                data.analysis = rk.textContent.trim()
                    .replace(/答案[:：]\s*[A-Za-z,，、\s]+\s*$/, '').trim();
            }
        });

        return data;
    }

    // ---- ruankao大人：为题目卡片添加复制按钮（置于题目下方） ----
    function ensureRuankaoCopyButtons() {
        document.querySelectorAll('.topicDetails').forEach(container => {
            if (container.querySelector('.copyBtn')) return; // 已添加过，去重

            // 需存在题目正文（题干或选项区），防止未渲染时误插
            const question = container.querySelector('#answerInfotitle') ||
                             container.querySelector('.questionaw');
            if (!question) return;

            const btn = makeCopyButton(() => extractRuankaoQuestionData(container));

            // 首选：紧跟最后一个选项区块 .questionaw 之后（位于题目正下方、答案/解析之前）
            const qBlocks = container.querySelectorAll('.questionaw');
            const lastQ = qBlocks.length ? qBlocks[qBlocks.length - 1] : null;
            if (lastQ && lastQ.parentNode) {
                lastQ.parentNode.insertBefore(btn, lastQ.nextSibling);
                return;
            }
            // 兜底1：插到第一个答案/解析分节之前（同样在题目下方）
            const firstSec = container.querySelector('.answer-to-the-question');
            if (firstSec && firstSec.parentNode) {
                firstSec.parentNode.insertBefore(btn, firstSec);
                return;
            }
            // 兜底2："保存笔记"按钮旁
            const noteArea = container.querySelector('.save_note_btn');
            if (noteArea) {
                noteArea.appendChild(btn);
                return;
            }
            // 最后兜底：容器末尾
            container.appendChild(btn);
        });
    }

    // 根据当前站点分发
    function ensureCopyButtons() {
        const hostname = window.location.hostname;
        if (hostname.includes('yiguojy.com')) {
            ensureYiguojyCopyButtons();
        } else if (hostname.includes('caishi.cn')) {
            ensureCaishiCopyButtons();
        } else if (hostname.includes('ruankaodaren.com')) {
            ensureRuankaoCopyButtons();
        }
    }

    function initCopyButtons() {
        // 监听 DOM 变化：点击"查看答案"或动态加载题目后自动补按钮
        new MutationObserver(ensureCopyButtons)
            .observe(document.body, { childList: true, subtree: true });
        setTimeout(ensureCopyButtons, 1000);
    }

    let inited = false;
    function initShortcuts() {
        if (inited) return; // 防止 SPA 切换时重复注册监听器
        inited = true;
        // 捕获阶段注册，先于页面自身的右键/按键逻辑执行，避免被拦截
        document.addEventListener('contextmenu', handleContextMenu, true);
        document.addEventListener('keydown', handleKeyDown, true);

        setTimeout(() => {
            const { prevButton, nextButton } = getNavigationButtons();
            console.log('✅ 导航按钮检测：', { prevButton: !!prevButton, nextButton: !!nextButton });
            if (!nextButton) console.warn('⚠️ 未找到「下一题」按钮，右键/快捷键将不可用');
        }, 800);
    }

    function boot() {
        initShortcuts();
        initCopyButtons();

        // 轻量 URL 变化检测（兼容 SPA 内跳转）
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log('🔄 检测到页面切换，重新检测按钮');
                setTimeout(enableTextSelection, 100);
                setTimeout(() => {
                    const { nextButton } = getNavigationButtons();
                    console.log('✅ 重新检测按钮：', { nextButton: !!nextButton });
                }, 500);
            }
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 500);
    }

    // 在控制台提供手动调用接口
    window.__reloadScripts = function() {
        enableTextSelection();
        initShortcuts();
        initCopyButtons();
        console.log('🔄 脚本功能已手动重新加载');
    };

    console.log('🚀 整合脚本已启动：右键下一题（Ctrl/Cmd/Shift+右键可复制）、B/N 快捷键、答案复制');
})();
