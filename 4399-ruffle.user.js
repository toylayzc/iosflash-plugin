// ==UserScript==
// @name         4399 Flash 游戏 Ruffle 兼容器
// @namespace    local.4399.ruffle
// @version      1.6.0
// @description  在 iPadOS 等不支持 Flash 的浏览器里，用 Ruffle 运行 4399 的 Flash 小游戏
// @match        *://4399.com/*
// @match        *://*.4399.com/*
// @match        *://4399.net/*
// @match        *://*.4399.net/*
// @match        *://*.4399.cn/*
// @match        *://*.5054399.com/*
// @match        *://*.img4399.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      4399.com
// @connect      4399.net
// @connect      4399.cn
// @connect      5054399.com
// @connect      img4399.com
// @connect      4399pk.com
// @connect      3304399.net
// @connect      4399sy.com
// @updateURL    https://raw.githubusercontent.com/toylayzc/iosflash-plugin/main/4399-ruffle.user.js
// @downloadURL  https://raw.githubusercontent.com/toylayzc/iosflash-plugin/main/4399-ruffle.user.js
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '__4399_RUFFLE__';
    const HOST_RE = /(^|\.)(4399\.com|4399\.net|4399\.cn|5054399\.com|img4399\.com)$/i;
    // 允许代理的域名，必须和上面的 @connect 一致
    const PROXY_RE = /(^|\.)(4399\.com|4399\.net|4399\.cn|5054399\.com|img4399\.com|4399pk\.com|3304399\.net|4399sy\.com)$/i;
    const hasGM = typeof GM_xmlhttpRequest === 'function';

    // ---------- 脚本环境：GM_xmlhttpRequest 跨域代理 ----------
    // 页面环境发来 gm-req，这里用 GM_xmlhttpRequest 下载（不受 CORS 限制），再把数据发回去
    function reply(msg) {
        window.postMessage(msg, location.origin === 'null' ? '*' : location.origin);
    }

    window.addEventListener('message', function (e) {
        const d = e.data;
        if (!d || d.tag !== TAG || d.type !== 'gm-req') return;
        if (e.origin !== location.origin) return;
        let host = '';
        try { host = new URL(d.url).hostname; } catch (err) { }
        if (!PROXY_RE.test(host)) {
            reply({ tag: TAG, type: 'gm-res', id: d.id, error: '代理只允许 4399 系列域名: ' + d.url });
            return;
        }
        // swf 服务器有防盗链：不带 4399 的 Referer 会返回 23832 字节的替身 swf
        let referer = 'https://www.4399.com/';
        try {
            if (d.referer && HOST_RE.test(new URL(d.referer).hostname)) referer = d.referer;
        } catch (err) { }
        GM_xmlhttpRequest({
            method: 'GET',
            url: d.url,
            headers: { Referer: referer },
            responseType: 'arraybuffer',
            timeout: 60000,
            onload: function (r) {
                reply({
                    tag: TAG, type: 'gm-res', id: d.id,
                    status: r.status, statusText: r.statusText || '',
                    finalUrl: r.finalUrl || d.url,
                    headers: r.responseHeaders || '',
                    buffer: r.response
                });
            },
            onerror: function () { reply({ tag: TAG, type: 'gm-res', id: d.id, error: 'GM_xmlhttpRequest 网络错误' }); },
            ontimeout: function () { reply({ tag: TAG, type: 'gm-res', id: d.id, error: 'GM_xmlhttpRequest 超时' }); }
        });
    });

    // ---------- 页面环境主逻辑 ----------
    // 这个函数会被转成字符串注入到页面里运行，不能引用外层变量
    function pageMain(info, W0) {
        const W = W0 || window;
        // 和调试版共用这个标记，两个版本都装时只运行先注入的那个
        if (W.__4399_RUFFLE_DEBUG__) return;
        W.__4399_RUFFLE_DEBUG__ = true;
        document.documentElement.setAttribute('data-r4399-main', '1');

        const TAG = '__4399_RUFFLE__';
        const VERSION = '1.6.0';
        const HOST_RE = /(^|\.)(4399\.com|4399\.net|4399\.cn|5054399\.com|img4399\.com)$/i;
        const PROXY_RE = /(^|\.)(4399\.com|4399\.net|4399\.cn|5054399\.com|img4399\.com|4399pk\.com|3304399\.net|4399sy\.com)$/i;
        const RUFFLE_VERSION = '0.7.1';
        // 必须带版本号：不带版本号的 unpkg 地址会 302 跳转，Ruffle 推算 wasm 目录时会出错
        const CDNS = [
            'https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle@' + RUFFLE_VERSION + '/',
            'https://unpkg.com/@ruffle-rs/ruffle@' + RUFFLE_VERSION + '/'
        ];
        const UI_ID = '__4399_ruffle_ball__';
        const POS_KEY = '__4399_ruffle_ball_pos__';
        const T0 = Date.now();
        const origConsole = { log: console.log, warn: console.warn, error: console.error };

        let IS_TOP = true;
        try { IS_TOP = W.top === W.self; } catch (e) { IS_TOP = false; }

        // ---------------- 日志 ----------------
        const lines = [];
        const swfUrls = new Set();

        function fmt(v) {
            if (v instanceof Element) return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') + '>';
            if (v instanceof Error) return v.name + ': ' + v.message;
            if (typeof v === 'object' && v !== null) {
                try { return JSON.stringify(v); } catch (e) { return String(v); }
            }
            return String(v);
        }

        function log(level) {
            const text = Array.prototype.slice.call(arguments, 1).map(fmt).join(' ');
            const line = '[' + ((Date.now() - T0) / 1000).toFixed(1) + 's][' + level + '] ' + text;
            origConsole.log.call(console, '[4399 Ruffle]', line);
            if (IS_TOP) {
                addLine(line, level);
            } else {
                try { W.parent.postMessage({ tag: TAG, type: 'log', line: '[iframe ' + location.host + '] ' + line, level: level }, '*'); } catch (e) { }
            }
        }

        function addLine(line, level) {
            if (lines.length >= 500) lines.shift();
            lines.push(line);
            if (ui) ui.appendLog(line, level);
        }

        // ---------------- 状态（决定小球颜色和面板第一行） ----------------
        const state = { ruffle: 'loading', playing: false, antiOpen: false, external: '', noProxy: !info.gm, fail: '' };

        function setState(key, value) {
            if (!IS_TOP) {
                try { W.parent.postMessage({ tag: TAG, type: 'state', key: key, value: value }, '*'); } catch (e) { }
                return;
            }
            if (state[key] === value) return;
            state[key] = value;
            if (ui) ui.refresh();
        }

        function currentStatus() {
            if (state.fail) return ['err', state.fail];
            if (state.ruffle === 'failed') return ['err', 'Ruffle 加载失败，请检查网络后刷新'];
            if (state.antiOpen) return ['warn', '请先登录 4399 并完成实名认证（防沉迷），页面才会放出游戏'];
            if (state.playing) return ['play', '游戏正在 Ruffle 中运行'];
            if (state.external) return ['warn', '游戏在第三方网站（' + state.external + '），多为在线网游，暂不支持'];
            if (state.noProxy) return ['warn', '当前浏览器不支持 GM_xmlhttpRequest，跨域的游戏文件可能下载失败'];
            if (state.ruffle === 'ready') return ['ok', 'Ruffle 已就绪，等待游戏加载'];
            return ['load', '正在加载 Ruffle…'];
        }

        // ---------------- 悬浮小球 + 面板（只在顶层页面） ----------------
        let ui = null;

        function createUI() {
            const host = document.createElement('div');
            host.id = UI_ID;
            host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;';
            const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

            const style = document.createElement('style');
            style.textContent = [
                '.ball{position:fixed;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
                'color:#fff;font:bold 15px/1 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35);',
                'opacity:.82;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;',
                'cursor:pointer;transition:background-color .3s;border:2px solid rgba(255,255,255,.7);box-sizing:border-box;}',
                '.ball:focus-visible{outline:3px solid #fff;outline-offset:2px;}',
                '.load{background:#8a8a8a}.ok{background:#3a6df0}.play{background:#2fb35a}.warn{background:#e8961e}.err{background:#e5484d}',
                '.panel{position:fixed;width:min(340px,calc(100vw - 24px));max-height:60vh;display:none;flex-direction:column;',
                'background:rgba(24,24,24,.95);color:#eee;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.45);',
                'font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden;}',
                '.panel.open{display:flex}',
                '.head{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-bottom:1px solid #383838;}',
                '.dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:5px;}',
                '.status{flex:1;font-weight:600;}',
                '.ver{flex:none;color:#888;font-size:11px;margin-top:2px;}',
                '.btns{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid #383838;}',
                'button{padding:6px 10px;font:13px -apple-system,BlinkMacSystemFont,sans-serif;border:0;border-radius:6px;background:#3a6df0;color:#fff;}',
                'button.gray{background:#4a4a4a}',
                '.log{flex:1;min-height:60px;overflow:auto;padding:8px 12px;font:11px/1.5 Menlo,monospace;color:#bbb;',
                'white-space:pre-wrap;word-break:break-all;-webkit-overflow-scrolling:touch;}',
                '.log .e{color:#ff8a8a}.log .w{color:#ffd36b}'
            ].join('');
            root.appendChild(style);

            const ball = document.createElement('div');
            ball.className = 'ball load';
            ball.textContent = 'F';
            ball.setAttribute('role', 'button');
            ball.setAttribute('tabindex', '0');
            ball.setAttribute('aria-expanded', 'false');

            const panel = document.createElement('div');
            panel.className = 'panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', '4399 Ruffle 兼容器');

            const head = document.createElement('div');
            head.className = 'head';
            const dot = document.createElement('span');
            dot.className = 'dot load';
            const status = document.createElement('div');
            status.className = 'status';
            status.setAttribute('aria-live', 'polite');
            const ver = document.createElement('span');
            ver.className = 'ver';
            ver.textContent = 'v' + VERSION;
            head.appendChild(dot);
            head.appendChild(status);
            head.appendChild(ver);

            const btns = document.createElement('div');
            btns.className = 'btns';
            const logBox = document.createElement('div');
            logBox.className = 'log';

            function makeBtn(text, cls, onClick) {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = text;
                if (cls) b.className = cls;
                b.addEventListener('click', onClick);
                btns.appendChild(b);
                return b;
            }
            makeBtn('手动播放 swf', '', manualPlay);
            makeBtn('复制日志', 'gray', copyLog);
            makeBtn('收起', 'gray', function () { setOpen(false); ball.focus(); });

            panel.appendChild(head);
            panel.appendChild(btns);
            panel.appendChild(logBox);
            root.appendChild(ball);
            root.appendChild(panel);
            document.documentElement.appendChild(host);

            // ---- 位置：可拖动，按站点记住 ----
            const SIZE = 40, MARGIN = 8;
            let pos = null;
            try { pos = JSON.parse(W.localStorage.getItem(POS_KEY) || 'null'); } catch (e) { }
            if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
                pos = { x: W.innerWidth - SIZE - 12, y: Math.round(W.innerHeight * 0.6) };
            }
            function clampPos() {
                pos.x = Math.min(Math.max(MARGIN, pos.x), W.innerWidth - SIZE - MARGIN);
                pos.y = Math.min(Math.max(MARGIN, pos.y), W.innerHeight - SIZE - MARGIN);
                ball.style.left = pos.x + 'px';
                ball.style.top = pos.y + 'px';
            }
            function savePos() {
                try { W.localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (e) { }
            }
            function placePanel() {
                if (!panel.classList.contains('open')) return;
                const w = panel.offsetWidth, h = panel.offsetHeight;
                const left = pos.x + SIZE / 2 > W.innerWidth / 2 ? pos.x + SIZE - w : pos.x;
                const top = pos.y + SIZE / 2 > W.innerHeight / 2 ? pos.y - h - 8 : pos.y + SIZE + 8;
                panel.style.left = Math.min(Math.max(12, left), W.innerWidth - w - 12) + 'px';
                panel.style.top = Math.min(Math.max(12, top), W.innerHeight - h - 12) + 'px';
            }
            function setOpen(open) {
                panel.classList.toggle('open', open);
                ball.setAttribute('aria-expanded', String(open));
                if (open) {
                    placePanel();
                    logBox.scrollTop = logBox.scrollHeight;
                }
            }
            clampPos();

            let drag = null;
            ball.addEventListener('pointerdown', function (e) {
                drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
                try { ball.setPointerCapture(e.pointerId); } catch (err) { }
                e.preventDefault();
            });
            ball.addEventListener('pointermove', function (e) {
                if (!drag || e.pointerId !== drag.id) return;
                const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
                if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
                drag.moved = true;
                pos.x = drag.ox + dx;
                pos.y = drag.oy + dy;
                clampPos();
                placePanel();
            });
            ball.addEventListener('pointerup', function (e) {
                if (!drag || e.pointerId !== drag.id) return;
                if (drag.moved) savePos();
                else setOpen(!panel.classList.contains('open'));
                drag = null;
            });
            ball.addEventListener('pointercancel', function () { drag = null; });
            ball.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(!panel.classList.contains('open'));
                }
            });
            W.addEventListener('resize', function () { clampPos(); placePanel(); });

            function refresh() {
                const s = currentStatus();
                ball.className = 'ball ' + s[0];
                dot.className = 'dot ' + s[0];
                status.textContent = s[1];
                ball.setAttribute('aria-label', '4399 Ruffle：' + s[1] + '。点击' + (panel.classList.contains('open') ? '收起' : '展开'));
                ball.title = s[1];
            }

            function appendLog(line, level) {
                const div = document.createElement('div');
                div.textContent = line;
                if (level === '错误') div.className = 'e';
                else if (level === '警告') div.className = 'w';
                logBox.appendChild(div);
                while (logBox.childNodes.length > 200) logBox.removeChild(logBox.firstChild);
                if (panel.classList.contains('open')) logBox.scrollTop = logBox.scrollHeight;
            }

            lines.forEach(function (l) {
                appendLog(l, /\[错误\]/.test(l) ? '错误' : (/\[警告\]/.test(l) ? '警告' : '信息'));
            });

            return { refresh: refresh, appendLog: appendLog };
        }

        function copyLog() {
            const text = ['4399 Ruffle 兼容器 v' + VERSION, location.href, navigator.userAgent, '状态: ' + currentStatus()[1], ''].concat(lines).join('\n');
            const fallback = function () {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
                document.body.appendChild(ta);
                ta.focus();
                ta.setSelectionRange(0, text.length);
                let ok = false;
                try { ok = document.execCommand('copy'); } catch (e) { }
                ta.remove();
                log('信息', ok ? '日志已复制' : '自动复制失败，请长按日志区域手动复制');
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { log('信息', '日志已复制'); }, fallback);
            } else {
                fallback();
            }
        }

        // ---------------- 环境 ----------------
        function reportEnv() {
            log('信息', '脚本已运行', 'v' + VERSION, IS_TOP ? '顶层页面' : 'iframe', location.href);
            log('信息', '脚本管理器:', info.handler, info.version, '，运行方式:', info.mode, '，跨域代理:', info.gm ? '可用' : '不可用');
            if (/^(m|h|h5|mobile)\./i.test(location.hostname)) {
                log('警告', '当前是移动版页面，没有 Flash 游戏。请在浏览器里选“请求桌面网站”');
            }
        }

        // ---------------- 绕过 4399 的 Flash 检测 ----------------
        // 4399 的 flashopen*.js 会反复调用测试 swf 里的 checkflash()（ExternalInterface），
        // Ruffle 下调不通，几次失败后就把游戏替换成“当前浏览器不支持”的提示。
        // isHTML5=1 时它整段跳过检测；这个变量在非 IE 浏览器里没有别的作用。
        let midCalled = false;
        let blockCalled = false;
        let tryReset = false;

        function bypassDetect() {
            try {
                Object.defineProperty(W, 'isHTML5', {
                    configurable: true,
                    get: function () { return 1; },
                    set: function () { }
                });
            } catch (e) { }

            const noop = function () { blockCalled = true; log('信息', '已拦截 4399 的“不支持 Flash”提示'); };
            noop.__r4399 = true;
            let n = 0;
            const timer = setInterval(function () {
                ['showBlockFlash', 'showBlockFlashIE'].forEach(function (k) {
                    if (typeof W[k] === 'function' && !W[k].__r4399) {
                        try { W[k] = noop; } catch (e) { }
                    }
                });
                const tip = document.querySelector('iframe#flash22');
                const src = tip ? (tip.getAttribute('src') || '') : '';
                if (/blockflashtip|noInstallFlash/i.test(src) && typeof W.closeBlockFlash === 'function') {
                    log('信息', '“不支持 Flash”提示已显示，还原游戏');
                    try { W.closeBlockFlash(); } catch (e) { log('错误', '还原失败:', fmt(e)); }
                }
                // 检测失败会让 trycount > 5，之后 4399 的 showMidWindows() 直接 return，
                // 盖在游戏上的加载遮罩 #addiv 永远不收起（白屏）。
                // 只能在检测定时器放弃（调用了 showBlockFlash）之后清零一次：有的页面阈值是 10，
                // 定时器还在跑时清零会让它永远重试
                if (blockCalled && !tryReset && typeof W.trycount === 'number' && W.trycount > 5) {
                    tryReset = true;
                    W.trycount = 0;
                    log('信息', '已清零 4399 检测失败计数，加载遮罩能正常收起');
                }
                // 脚本注入晚于 4399 的 4 秒定时器时，showMidWindows() 已经因 trycount 返回过一次，这里补调一次。
                // 已经出现 #ageIframes 说明它正常跑过了，不能再调，否则会生成第二个年龄提示 iframe
                if (W.isloading === true && !midCalled && Date.now() - T0 > 6000 && !document.getElementById('ageIframes') && typeof W.showMidWindows === 'function') {
                    midCalled = true;
                    log('信息', '补调 showMidWindows() 收起加载遮罩');
                    try { W.showMidWindows(); } catch (e) { log('错误', 'showMidWindows 出错:', fmt(e)); }
                }
                if (++n > 120) clearInterval(timer);
            }, 250);

            // 防沉迷提示会随登录状态开关，整个页面期间都看着
            if (IS_TOP) {
                let antiLogged = false;
                setInterval(function () {
                    const anti = document.getElementById('Anti_open');
                    const open = !!(anti && anti.offsetWidth);
                    if (open && !antiLogged) {
                        antiLogged = true;
                        log('警告', '4399 防沉迷提示是打开的：要先登录并完成实名认证（脚本不会绕过它）');
                    }
                    setState('antiOpen', open);
                }, 1000);
            }
        }

        // ---------------- 钩子：console / fetch / 错误 ----------------
        function hookConsole() {
            let busy = false;
            ['log', 'warn', 'error'].forEach(function (k) {
                const orig = origConsole[k];
                console[k] = function () {
                    if (!busy) {
                        busy = true;
                        try {
                            const text = Array.prototype.slice.call(arguments).map(fmt).join(' ').replace(/%c/g, '').replace(/\s*color:.*$/s, '');
                            // Ruffle 的日志走 console.log，只收 AVM 报错（字体缺失之类太多）。
                            // 这类报错不少是游戏自身的小问题，不影响运行，只记日志不改状态
                            if (k === 'log') {
                                if (/(^|\s)ERROR\s|Error #\d+/.test(text)) log('警告', 'Ruffle:', text.slice(0, 300));
                            } else if (/ruffle|wasm|swf|avm/i.test(text)) {
                                log('警告', 'console.' + k + ':', text.slice(0, 300));
                            }
                        } catch (e) { }
                        busy = false;
                    }
                    return orig.apply(console, arguments);
                };
            });
        }

        // 跨域代理（通过脚本环境的 GM_xmlhttpRequest）
        let reqId = 0;
        const pending = new Map();
        W.addEventListener('message', function (e) {
            const d = e.data;
            if (!d || d.tag !== TAG || d.type !== 'gm-res') return;
            const p = pending.get(d.id);
            if (!p) return;
            pending.delete(d.id);
            if (d.error) p.reject(new TypeError(d.error));
            else p.resolve(d);
        });

        function gmGet(url) {
            return new Promise(function (resolve, reject) {
                const id = ++reqId;
                pending.set(id, { resolve: resolve, reject: reject });
                W.postMessage({ tag: TAG, type: 'gm-req', id: id, url: url, referer: location.href }, location.origin === 'null' ? '*' : location.origin);
                setTimeout(function () {
                    if (pending.has(id)) {
                        pending.delete(id);
                        reject(new TypeError('跨域代理 70 秒无响应'));
                    }
                }, 70000);
            });
        }

        function crossOrigin4399(url) {
            try {
                const u = new URL(url, location.href);
                return /^https?:$/.test(u.protocol) && u.origin !== location.origin && PROXY_RE.test(u.hostname);
            } catch (e) { return false; }
        }

        function isSwfUrl(url) {
            try { return /\.swf$/i.test(new URL(url, location.href).pathname); } catch (e) { return false; }
        }

        function toResponse(d, url) {
            if (!(d.status >= 200 && d.status <= 599)) throw new TypeError('代理返回异常状态 ' + d.status);
            const m = /^content-type:\s*([^\r\n]+)/im.exec(d.headers || '');
            const ct = m ? m[1].trim() : (isSwfUrl(url) ? 'application/x-shockwave-flash' : 'application/octet-stream');
            const resp = new Response(d.status === 204 ? null : d.buffer, {
                status: d.status,
                statusText: d.statusText,
                headers: { 'Content-Type': ct }
            });
            // 构造出来的 Response.url 是空串，Ruffle 要靠它解析相对路径
            try { Object.defineProperty(resp, 'url', { value: d.finalUrl || url }); } catch (e) { }
            return resp;
        }

        function checkSwf(buffer, size, url) {
            if (!buffer || size < 8) {
                log('错误', 'swf 内容为空:', url);
                return;
            }
            const b = new Uint8Array(buffer, 0, 8);
            const sig = String.fromCharCode(b[0], b[1], b[2]);
            if (!/^(FWS|CWS|ZWS)$/.test(sig)) {
                log('错误', '下载到的不是 swf，可能是错误页:', url);
                setState('fail', '游戏文件下载出错，请刷新重试');
            } else if (size === 23832) {
                log('错误', '下载到的是 4399 防盗链替身 swf，Referer 没带上:', url);
                setState('fail', '游戏文件被 4399 防盗链拦截（脚本管理器不允许改 Referer）');
            }
        }

        function watchPlayer(el) {
            el.addEventListener('loadeddata', function () {
                const w = el.offsetWidth, h = el.offsetHeight;
                if (w > 50 && h > 50) {
                    log('信息', '游戏已开始运行，尺寸 ' + w + 'x' + h);
                    setState('playing', true);
                }
            });
        }

        function hookFetch() {
            const origFetch = W.fetch;
            if (!origFetch) return;
            W.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || String(input);
                const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
                const canProxy = info.gm && method === 'GET' && crossOrigin4399(url);
                const abs = (function () { try { return new URL(url, location.href).href; } catch (e) { return url; } })();
                const swf = isSwfUrl(abs);

                const viaProxy = function () {
                    return gmGet(abs).then(function (d) {
                        const resp = toResponse(d, abs);
                        const size = d.buffer ? d.buffer.byteLength : 0;
                        if (swf) {
                            log(resp.ok ? '信息' : '错误', '代理下载 swf: ' + d.status + '，' + size + ' 字节', abs);
                            checkSwf(d.buffer, size, abs);
                        }
                        return resp;
                    }, function (err) {
                        log(swf ? '错误' : '警告', '代理下载失败:', fmt(err), abs);
                        throw err;
                    });
                };

                return origFetch.apply(W, arguments).then(function (r) {
                    if (canProxy && r.type === 'opaque') return viaProxy();
                    return r;
                }, function (err) {
                    if (canProxy) return viaProxy();
                    if (swf) {
                        let host = '';
                        try { host = new URL(abs).hostname; } catch (e) { }
                        log('错误', 'swf 下载失败:', fmt(err), abs);
                        if (host && host !== location.hostname && !PROXY_RE.test(host)) {
                            log('错误', '域名 ' + host + ' 不在代理白名单');
                        }
                    }
                    throw err;
                });
            };
        }

        function hookMessages() {
            if (!IS_TOP) return;
            W.addEventListener('message', function (e) {
                const d = e.data;
                if (!d || d.tag !== TAG) return;
                if (d.type === 'log' && d.line) addLine(d.line, d.level);
                else if (d.type === 'swf' && d.swf) swfUrls.add(d.swf);
                else if (d.type === 'state' && d.key in state) setState(d.key, d.value);
            });
        }

        // ---------------- 加载 Ruffle ----------------
        function setConfig(base) {
            W.RufflePlayer = W.RufflePlayer || {};
            W.RufflePlayer.config = {
                autoplay: 'on',
                unmuteOverlay: 'visible',
                splashScreen: false,
                warnOnUnsupportedContent: true,
                logLevel: 'warn',
                allowScriptAccess: false,
                publicPath: base
            };
        }

        function loadRuffle(i) {
            if (i >= CDNS.length) {
                log('错误', '所有 CDN 都加载失败，检查网络能否打开 ' + CDNS[0] + 'ruffle.js');
                setState('ruffle', 'failed');
                return;
            }
            const base = CDNS[i];
            setConfig(base);
            const s = document.createElement('script');
            s.src = base + 'ruffle.js';
            const start = Date.now();
            let settled = false;
            const timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                log('警告', 'Ruffle 加载超时，换下一个 CDN:', s.src);
                loadRuffle(i + 1);
            }, 15000);
            s.onload = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (!W.RufflePlayer || typeof W.RufflePlayer.newest !== 'function') {
                    log('错误', 'ruffle.js 加载了，但页面里没有 RufflePlayer');
                    setState('ruffle', 'failed');
                    return;
                }
                log('信息', 'Ruffle ' + RUFFLE_VERSION + ' 加载完成，用时 ' + (Date.now() - start) + 'ms');
                setState('ruffle', 'ready');
                scan();
            };
            s.onerror = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                log('警告', 'Ruffle 加载失败，换下一个 CDN:', s.src);
                loadRuffle(i + 1);
            };
            (document.head || document.documentElement).appendChild(s);
        }

        // ---------------- 扫描页面 ----------------
        const seenPlayers = new WeakSet();
        const seenFrames = new Set();
        const externalFrames = new Set();
        let lastTextScan = 0;

        function scan() {
            document.querySelectorAll('ruffle-object, ruffle-embed, ruffle-player').forEach(function (el) {
                if (seenPlayers.has(el)) return;
                seenPlayers.add(el);
                watchPlayer(el);
            });

            if (IS_TOP) {
                document.querySelectorAll('iframe').forEach(function (f) {
                    const src = f.getAttribute('src') || '';
                    if (!src || seenFrames.has(src)) return;
                    let host = '';
                    try { host = new URL(src, location.href).hostname; } catch (e) { }
                    if (!host || /^(about|javascript|data):/i.test(src) || HOST_RE.test(host)) {
                        seenFrames.add(src);
                        return;
                    }
                    // 只把游戏区大小的第三方 iframe 当成游戏，避免广告 iframe 误报
                    const w = Math.max(f.offsetWidth, parseInt(f.getAttribute('width'), 10) || 0);
                    const h = Math.max(f.offsetHeight, parseInt(f.getAttribute('height'), 10) || 0);
                    if (f.id !== 'flash22' && (w < 300 || h < 200)) return;
                    seenFrames.add(src);
                    externalFrames.add(host);
                    log('警告', '游戏在第三方网站的 iframe 里:', src);
                    setState('external', Array.from(externalFrames).join('、'));
                });
            }

            const now = Date.now();
            if (now - lastTextScan > 1500) {
                lastTextScan = now;
                const html = document.documentElement.innerHTML;
                const re = /[\w\-./:%?=&]*?\.swf(?:\?[\w\-.%=&]*)?/gi;
                let m;
                while ((m = re.exec(html)) !== null) {
                    if (m[0].length > 4) addSwf(m[0]);
                }
            }
        }

        function addSwf(raw) {
            let abs = raw;
            try { abs = new URL(raw, location.href).href; } catch (e) { }
            if (/objtest\.swf|\/flash\/cell\.swf/i.test(abs) || swfUrls.has(abs)) return;
            swfUrls.add(abs);
            if (!IS_TOP) {
                try { W.parent.postMessage({ tag: TAG, type: 'swf', swf: abs }, '*'); } catch (e) { }
            }
        }

        function scanGlobals() {
            if (typeof W.webServer === 'string' && typeof W._strGamePath === 'string') {
                const p = W._strGamePath.indexOf('//') === -1 ? W.webServer + W._strGamePath : W._strGamePath;
                if (/\.swf/i.test(p)) addSwf(p);
            }
        }

        function observe() {
            let timer = null;
            const ob = new MutationObserver(function () {
                if (timer) return;
                timer = setTimeout(function () { timer = null; scan(); }, 300);
            });
            ob.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data'] });
        }

        // ---------------- 手动播放 ----------------
        function manualPlay() {
            const rp = W.RufflePlayer;
            if (!rp || typeof rp.newest !== 'function' || !rp.newest()) {
                log('错误', 'Ruffle 还没就绪，无法手动播放');
                return;
            }
            const url = W.prompt('输入 swf 地址', Array.from(swfUrls)[0] || '');
            if (!url) return;

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483646;background:#000;';
            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = '关闭播放器';
            close.style.cssText = 'position:absolute;top:8px;left:8px;z-index:1;padding:6px 10px;font-size:13px;border:0;border-radius:6px;background:#4a4a4a;color:#fff;';
            close.addEventListener('click', function () { overlay.remove(); });
            const player = rp.newest().createPlayer();
            player.style.cssText = 'width:100%;height:100%;';
            overlay.appendChild(player);
            overlay.appendChild(close);
            document.body.appendChild(overlay);
            watchPlayer(player);

            log('信息', '手动播放:', url);
            try {
                const api = typeof player.ruffle === 'function' ? player.ruffle() : player;
                Promise.resolve(api.load({ url: url, allowScriptAccess: false })).catch(function (err) {
                    log('错误', '手动播放失败:', fmt(err));
                });
            } catch (err) {
                log('错误', '手动播放异常:', fmt(err));
            }
        }

        // ---------------- 启动 ----------------
        hookConsole();
        hookFetch();
        hookMessages();
        if (IS_TOP) {
            ui = createUI();
            ui.refresh();
        }
        reportEnv();
        bypassDetect();
        loadRuffle(0);
        observe();
        W.addEventListener('load', function () {
            scan();
            scanGlobals();
        });
    }

    // ---------- 把主逻辑注入页面环境 ----------
    const info = {
        handler: (typeof GM_info !== 'undefined' && GM_info.scriptHandler) || '未知',
        version: (typeof GM_info !== 'undefined' && GM_info.version) || '',
        gm: hasGM,
        mode: '注入到页面'
    };
    const root = document.documentElement;
    const s = document.createElement('script');
    s.textContent = '(' + pageMain.toString() + ')(' + JSON.stringify(info) + ');';
    root.appendChild(s);
    s.remove();
    if (root.getAttribute('data-r4399-main') !== '1') {
        // 内联脚本被拦（CSP），退回在脚本环境里直接操作页面 window
        info.mode = '脚本环境直接运行（内联注入被拦）';
        pageMain(info, typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    }
})();
