// ==UserScript==
// @name         4399 Flash 游戏 Ruffle 兼容器（调试版）
// @namespace    local.4399.ruffle
// @version      1.5.1-debug
// @description  绕过 4399 的 Flash 检测、代理跨域 swf，并在页面上显示诊断日志
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
        if (W.__4399_RUFFLE_DEBUG__) return;
        W.__4399_RUFFLE_DEBUG__ = true;
        document.documentElement.setAttribute('data-r4399-main', '1');

        const TAG = '__4399_RUFFLE__';
        const HOST_RE = /(^|\.)(4399\.com|4399\.net|4399\.cn|5054399\.com|img4399\.com)$/i;
        const PROXY_RE = /(^|\.)(4399\.com|4399\.net|4399\.cn|5054399\.com|img4399\.com|4399pk\.com|3304399\.net|4399sy\.com)$/i;
        const RUFFLE_VERSION = '0.7.1';
        // 必须带版本号：不带版本号的 unpkg 地址会 302 跳转，Ruffle 推算 wasm 目录时会出错
        const CDNS = [
            'https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle@' + RUFFLE_VERSION + '/',
            'https://unpkg.com/@ruffle-rs/ruffle@' + RUFFLE_VERSION + '/'
        ];
        const T0 = Date.now();
        const origConsole = { log: console.log, warn: console.warn, error: console.error };

        let IS_TOP = true;
        try { IS_TOP = W.top === W.self; } catch (e) { IS_TOP = false; }

        // ---------------- 日志 ----------------
        const lines = [];
        const swfUrls = new Set();
        let logCount = 0;
        let panelBox = null;

        function fmt(v) {
            if (v instanceof Element) {
                return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') + '>';
            }
            if (v instanceof Error) return v.name + ': ' + v.message;
            if (typeof v === 'object' && v !== null) {
                try { return JSON.stringify(v); } catch (e) { return String(v); }
            }
            return String(v);
        }

        function log(level) {
            const args = Array.prototype.slice.call(arguments, 1);
            const text = args.map(fmt).join(' ');
            const t = ((Date.now() - T0) / 1000).toFixed(1);
            const line = '[' + t + 's][' + level + '] ' + text;
            origConsole.log.call(console, '[4399 Ruffle]', line);
            if (IS_TOP) {
                addLine(line, level);
            } else {
                try { W.parent.postMessage({ tag: TAG, type: 'log', line: '[iframe ' + location.host + '] ' + line, level: level }, '*'); } catch (e) { }
            }
        }

        function addLine(line, level) {
            if (logCount++ > 1000) return;
            lines.push(line);
            if (!panelBox) return;
            const div = document.createElement('div');
            div.textContent = line;
            if (level === '错误') div.style.color = '#ff7b7b';
            else if (level === '警告') div.style.color = '#ffd36b';
            else if (level === '结论') div.style.color = '#7bff9a';
            panelBox.appendChild(div);
            panelBox.scrollTop = panelBox.scrollHeight;
        }

        // ---------------- 页面内日志面板（只在顶层页面） ----------------
        function makeBtn(text, onClick) {
            const b = document.createElement('button');
            b.textContent = text;
            b.style.cssText = 'margin:0 6px 0 0;padding:6px 10px;font-size:13px;border:0;border-radius:6px;background:#3a6df0;color:#fff;';
            b.addEventListener('click', onClick);
            return b;
        }

        function createPanel() {
            const host = document.createElement('div');
            host.id = '__4399_ruffle_debug_panel__';
            host.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;';
            const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

            const wrap = document.createElement('div');
            wrap.style.cssText = 'background:rgba(0,0,0,.88);color:#eee;font:12px/1.5 Menlo,monospace;';
            const bar = document.createElement('div');
            bar.style.cssText = 'padding:6px;border-bottom:1px solid #444;';
            const box = document.createElement('div');
            box.style.cssText = 'height:38vh;overflow:auto;padding:6px;white-space:pre-wrap;word-break:break-all;-webkit-overflow-scrolling:touch;';

            bar.appendChild(makeBtn('收起/展开', function () {
                box.style.display = box.style.display === 'none' ? 'block' : 'none';
            }));
            bar.appendChild(makeBtn('复制日志', copyLog));
            bar.appendChild(makeBtn('重新扫描', function () { scan(true); scanGlobals(); report(); }));
            bar.appendChild(makeBtn('手动播放 swf', manualPlay));

            wrap.appendChild(bar);
            wrap.appendChild(box);
            root.appendChild(wrap);
            document.documentElement.appendChild(host);

            panelBox = box;
            lines.forEach(function (l) {
                const div = document.createElement('div');
                div.textContent = l;
                box.appendChild(div);
            });
        }

        function copyLog() {
            const text = lines.join('\n');
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
                log('信息', ok ? '日志已复制' : '自动复制失败，请长按日志区域手动全选复制');
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { log('信息', '日志已复制'); }, fallback);
            } else {
                fallback();
            }
        }

        // ---------------- 环境检查 ----------------
        function flashPluginState() {
            let plugin = false, mime = false;
            try { plugin = !!(navigator.plugins && navigator.plugins.namedItem && navigator.plugins.namedItem('Shockwave Flash')); } catch (e) { }
            try { mime = !!(navigator.mimeTypes && navigator.mimeTypes['application/x-shockwave-flash']); } catch (e) { }
            return '插件=' + plugin + '，MIME=' + mime;
        }

        function reportEnv() {
            log('信息', '脚本已运行，' + (IS_TOP ? '顶层页面' : 'iframe 内'), location.href, '，document.readyState=' + document.readyState);
            log('信息', 'UA:', navigator.userAgent);
            log('信息', 'maxTouchPoints=' + navigator.maxTouchPoints + '，安全上下文=' + W.isSecureContext + '，WebAssembly=' + (typeof WebAssembly !== 'undefined'));
            log('信息', '脚本管理器:', info.handler, info.version, '，主逻辑运行方式:', info.mode, '，GM 跨域代理:', info.gm ? '可用' : '不可用');
            if (!info.gm) log('警告', '没有 GM_xmlhttpRequest，跨域 swf 无法代理下载');
            if (document.readyState !== 'loading') {
                log('信息', '脚本注入时页面已解析完（Safari 版 Tampermonkey 常见），靠替换 showBlockFlash 兜底');
            }
            if (/^(m|h|h5|mobile)\./i.test(location.hostname)) {
                log('警告', '当前是移动版域名，页面可能根本没有 swf。请在浏览器里选“请求桌面网站”再试');
            }
            log('信息', '加载 Ruffle 前 Flash 状态:', flashPluginState());
        }

        // ---------------- 绕过 4399 的 Flash 检测 ----------------
        // 4399 的 flashopen*.js 会反复调用测试 swf 里的 checkflash()（ExternalInterface），
        // Ruffle 下调不通，几次失败后就把游戏替换成“当前浏览器不支持”的提示。
        // isHTML5=1 时它整段跳过检测；这个变量在非 IE 浏览器里没有别的作用。
        function bypassDetect() {
            try {
                Object.defineProperty(W, 'isHTML5', {
                    configurable: true,
                    get: function () { return 1; },
                    set: function (v) { log('信息', '页面想把 isHTML5 设成 ' + v + '，已保持为 1（跳过 Flash 检测）'); }
                });
                log('信息', '已预设 isHTML5=1');
            } catch (e) {
                log('信息', 'isHTML5 已被页面声明，无法预设（不影响，靠替换 showBlockFlash 兜底）');
            }

            const noop = function () { blockCalled = true; log('信息', '已拦截 4399 的“不支持 Flash”替换'); };
            noop.__r4399 = true;
            let n = 0;
            const timer = setInterval(function () {
                ['showBlockFlash', 'showBlockFlashIE'].forEach(function (k) {
                    if (typeof W[k] === 'function' && !W[k].__r4399) {
                        try { W[k] = noop; log('信息', '已替换 ' + k + '()'); } catch (e) { }
                    }
                });
                const tip = document.querySelector('iframe#flash22');
                const src = tip ? (tip.getAttribute('src') || '') : '';
                if (/blockflashtip|noInstallFlash/i.test(src) && typeof W.closeBlockFlash === 'function') {
                    log('警告', '“不支持 Flash”提示已经显示，调用 closeBlockFlash() 还原游戏');
                    try { W.closeBlockFlash(); } catch (e) { log('错误', '还原失败:', fmt(e)); }
                }
                // 检测失败会让 trycount > 5，之后 4399 的 showMidWindows() 直接 return，
                // 盖在游戏上的加载遮罩 #addiv 永远不收起（白屏）。
                // 只能在检测定时器放弃（调用了 showBlockFlash）之后清零一次：有的页面阈值是 10，
                // 定时器还在跑时清零会让它永远重试
                if (blockCalled && !tryReset && typeof W.trycount === 'number' && W.trycount > 5) {
                    tryReset = true;
                    W.trycount = 0;
                    log('信息', '已把 4399 检测失败计数 trycount 清零，加载遮罩能正常收起');
                }
                const elapsed = Date.now() - T0;
                const anti = document.getElementById('Anti_open');
                const antiOpen = !!(anti && anti.offsetWidth);
                if (antiOpen && !antiLogged) {
                    antiLogged = true;
                    log('警告', '4399 防沉迷提示是打开的：要先登录并完成实名认证，页面才会放出游戏（脚本不会绕过它）');
                }
                // 脚本注入晚于 4399 的 4 秒定时器时，showMidWindows() 已经因 trycount 返回过一次，这里补调一次。
                // 已经出现 #ageIframes 说明它正常跑过了，不能再调，否则会生成第二个年龄提示 iframe
                if (W.isloading === true && !midCalled && elapsed > 6000 && !document.getElementById('ageIframes') && typeof W.showMidWindows === 'function') {
                    midCalled = true;
                    log('警告', '6 秒后加载遮罩仍未收起且没进入年龄提示，补调 showMidWindows()');
                    try { W.showMidWindows(); } catch (e) { log('错误', 'showMidWindows 出错:', fmt(e)); }
                }
                if (++n > 120) clearInterval(timer);
            }, 250);
        }
        let midCalled = false;
        let antiLogged = false;
        let blockCalled = false;
        let tryReset = false;

        function overlayState() {
            const ad = document.getElementById('addiv');
            if (!ad) return '无 #addiv';
            const r = ad.getBoundingClientRect();
            const anti = document.getElementById('Anti_open');
            return '#addiv ' + Math.round(r.width) + 'x' + Math.round(r.height) + '，isloading=' + W.isloading + '，trycount=' + W.trycount +
                '，年龄提示=' + (document.getElementById('ageIframes') ? '有' : '无') + '，防沉迷提示=' + (anti && anti.offsetWidth ? '打开' : '关闭');
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
                            // Ruffle 自己的日志走 console.log，只收 AVM 报错，字体缺失之类的警告太多
                            if (k === 'log') {
                                if (/(^|\s)ERROR\s|Error #\d+/.test(text)) log('错误', 'Ruffle:', text.slice(0, 500));
                            } else if (/ruffle|wasm|swf|avm|flash/i.test(text)) {
                                log(k === 'error' ? '错误' : '警告', 'console.' + k + ':', text.slice(0, 500));
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
                        reject(new TypeError('GM 代理 70 秒无响应（脚本环境的监听可能没运行）'));
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

        function toResponse(d, url) {
            if (!(d.status >= 200 && d.status <= 599)) throw new TypeError('代理返回异常状态 ' + d.status);
            const m = /^content-type:\s*([^\r\n]+)/im.exec(d.headers || '');
            const ct = m ? m[1].trim() : (/\.swf/i.test(url) ? 'application/x-shockwave-flash' : 'application/octet-stream');
            const resp = new Response(d.status === 204 ? null : d.buffer, {
                status: d.status,
                statusText: d.statusText,
                headers: { 'Content-Type': ct }
            });
            // 构造出来的 Response.url 是空串，Ruffle 要靠它解析相对路径
            try { Object.defineProperty(resp, 'url', { value: d.finalUrl || url }); } catch (e) { }
            return resp;
        }

        function checkSwf(buffer, size) {
            if (!buffer || size < 8) {
                log('错误', 'swf 内容为空');
                return;
            }
            const b = new Uint8Array(buffer, 0, 8);
            const sig = String.fromCharCode(b[0], b[1], b[2]);
            const full = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
            if (!/^(FWS|CWS|ZWS)$/.test(sig)) {
                log('错误', '下载到的不是 swf（文件头 ' + JSON.stringify(sig) + '），可能是错误页');
            } else if (size === 23832) {
                log('错误', '下载到的是 4399 防盗链替身 swf（23832 字节），说明 Referer 没带上。Tampermonkey 可能不允许改 Referer');
            } else {
                log('结论', 'swf 文件正常: ' + sig + ' 版本 ' + b[3] + '，' + size + ' 字节，解压后 ' + full + ' 字节');
            }
        }

        function watchPlayer(el) {
            el.addEventListener('loadedmetadata', function () {
                let m = null;
                try { m = el.metadata || (typeof el.ruffle === 'function' && el.ruffle().metadata); } catch (e) { }
                log('结论', 'Ruffle 已解析 swf: ' + (m ? ('舞台 ' + m.width + 'x' + m.height + '，帧率 ' + m.frameRate + '，' + (m.isActionScript3 ? 'AS3' : 'AS1/2') + '，swf 版本 ' + m.swfVersion) : '（无元数据）'));
            });
            el.addEventListener('loadeddata', function () {
                log('结论', 'Ruffle 已开始运行游戏。若画面仍不对，就是 Ruffle 对这个游戏的兼容问题');
            });
        }

        function hookFetch() {
            const origFetch = W.fetch;
            if (!origFetch) return;
            W.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || String(input);
                const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
                const watch = /ruffle|\.wasm|\.swf/i.test(url);
                const canProxy = info.gm && method === 'GET' && crossOrigin4399(url);
                const abs = (function () { try { return new URL(url, location.href).href; } catch (e) { return url; } })();
                if (watch) log('信息', 'fetch 开始:', abs);

                const viaProxy = function (why) {
                    log('警告', why + '，改走 Tampermonkey 代理:', abs);
                    return gmGet(abs).then(function (d) {
                        const resp = toResponse(d, abs);
                        const size = d.buffer ? d.buffer.byteLength : 0;
                        log(resp.ok ? '信息' : '错误', '代理下载结果: ' + d.status + '，' + size + ' 字节', abs);
                        let pathname = abs;
                        try { pathname = new URL(abs).pathname; } catch (e) { }
                        if (/\.swf$/i.test(pathname)) checkSwf(d.buffer, size);
                        return resp;
                    }, function (err) {
                        log('错误', '代理下载失败:', fmt(err), abs);
                        throw err;
                    });
                };

                const p = origFetch.apply(W, arguments);
                return p.then(function (r) {
                    if (canProxy && r.type === 'opaque') return viaProxy('拿到不透明响应');
                    if (watch) log(r.ok ? '信息' : '错误', 'fetch 结果:', r.status, r.headers.get('content-type') || '', abs);
                    return r;
                }, function (err) {
                    if (canProxy) return viaProxy('跨域被拦（' + fmt(err) + '）');
                    if (watch) {
                        let host = '';
                        try { host = new URL(abs).hostname; } catch (e) { }
                        log('错误', 'fetch 失败:', fmt(err), abs);
                        if (host && host !== location.hostname && !PROXY_RE.test(host)) {
                            log('错误', '域名 ' + host + ' 不在代理白名单，需要加到 @connect 和 PROXY_RE');
                        }
                    }
                    throw err;
                });
            };
        }

        function hookErrors() {
            W.addEventListener('error', function (e) {
                const t = e.target;
                if (t && t !== W && t.tagName) {
                    const tag = t.tagName.toLowerCase();
                    if (/^(script|iframe|embed|object)$/.test(tag)) {
                        log('错误', '资源加载失败 <' + tag + '>:', t.src || t.data || '');
                    }
                } else if (e.message && e.message !== 'Script error.') {
                    log('错误', 'JS 错误:', e.message, (e.filename || '') + ':' + (e.lineno || ''));
                }
            }, true);
            W.addEventListener('unhandledrejection', function (e) {
                const text = fmt(e.reason);
                if (/ruffle|wasm|swf|fetch|load failed/i.test(text)) log('错误', '未处理的 Promise 异常:', text);
            });
            document.addEventListener('securitypolicyviolation', function (e) {
                log('错误', 'CSP 拦截:', e.violatedDirective, e.blockedURI);
            });
            if (IS_TOP) {
                W.addEventListener('message', function (e) {
                    const d = e.data;
                    if (!d || d.tag !== TAG) return;
                    if (d.type === 'log' && d.line) addLine(d.line, d.level);
                    if (d.type === 'swf' && d.swf && !swfUrls.has(d.swf)) {
                        swfUrls.add(d.swf);
                        addLine('[iframe] 发现 swf 地址: ' + d.swf, '信息');
                    }
                });
            }
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
                log('结论', '所有 CDN 都加载失败。检查 iPad 网络能否打开 ' + CDNS[0] + 'ruffle.js');
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
                log('警告', 'Ruffle 加载超时（15 秒）:', s.src, '，换下一个 CDN');
                loadRuffle(i + 1);
            }, 15000);
            s.onload = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                log('信息', 'Ruffle 脚本加载完成，用时 ' + (Date.now() - start) + 'ms');
                afterLoad();
            };
            s.onerror = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                log('错误', 'Ruffle 脚本加载失败:', s.src);
                loadRuffle(i + 1);
            };
            log('信息', '开始加载 Ruffle:', s.src);
            (document.head || document.documentElement).appendChild(s);
        }

        function afterLoad() {
            const rp = W.RufflePlayer;
            if (!rp || typeof rp.newest !== 'function') {
                log('错误', '脚本加载了，但页面环境里没有 RufflePlayer.newest');
                return;
            }
            const r = rp.newest();
            log('信息', 'Ruffle 版本:', r && r.version ? r.version : '（尚未初始化，DOMContentLoaded 后才会就绪）');
            log('信息', '加载 Ruffle 后 Flash 状态:', flashPluginState());
            scan(true);
        }

        // ---------------- 扫描页面 ----------------
        const seenEls = new WeakSet();
        const seenFrames = new Set();
        const externalFrames = new Set();
        let flashPromptLogged = false;
        let lastTextScan = 0;

        function scan(force) {
            document.querySelectorAll('object, embed').forEach(function (el) {
                if (seenEls.has(el)) return;
                seenEls.add(el);
                const type = (el.getAttribute('type') || '').toLowerCase();
                let data = el.getAttribute('data') || el.getAttribute('src') || '';
                if (!data) {
                    const p = el.querySelector('param[name="movie" i], param[name="src" i]');
                    if (p) data = p.getAttribute('value') || '';
                }
                const isFlash = type.indexOf('shockwave-flash') >= 0 || /\.swf(?:[?#]|$)/i.test(data);
                const isTest = /objtest\.swf/i.test(data);
                log(isFlash ? '信息' : '调试', '发现 <' + el.tagName.toLowerCase() + '>', 'data=' + (data || '空'),
                    isTest ? '（4399 的 Flash 检测文件，不是游戏）' : (isFlash ? '（Flash）' : '（不是 Flash）'));
            });

            document.querySelectorAll('ruffle-object, ruffle-embed, ruffle-player').forEach(function (el) {
                if (seenEls.has(el)) return;
                seenEls.add(el);
                watchPlayer(el);
                const w = el.offsetWidth, h = el.offsetHeight;
                if (w <= 10 && h <= 10) {
                    log('信息', 'Ruffle 接管了 10x10 的检测文件（不是游戏）');
                } else {
                    log('结论', 'Ruffle 已接管游戏元素 <' + el.tagName.toLowerCase() + '>，尺寸 ' + w + 'x' + h);
                }
            });

            document.querySelectorAll('iframe').forEach(function (f) {
                const src = f.getAttribute('src') || '';
                if (!src || seenFrames.has(src)) return;
                seenFrames.add(src);
                let host = '';
                try { host = new URL(src, location.href).hostname; } catch (e) { }
                if (/blockflashtip|noInstallFlash/i.test(src)) {
                    log('警告', '4399 已把游戏换成“不支持 Flash”提示:', src);
                } else if (!host || /^(about|javascript|data):/i.test(src)) {
                    log('调试', '发现 iframe:', src);
                } else if (HOST_RE.test(host)) {
                    log('信息', '发现 iframe（在匹配范围内）:', src);
                } else {
                    externalFrames.add(host);
                    log('警告', '发现 iframe（不在 @match 范围，脚本不会注入）:', src);
                }
            });

            const now = Date.now();
            if (force || now - lastTextScan > 1500) {
                lastTextScan = now;
                findSwfText();
                if (!flashPromptLogged && document.body) {
                    const txt = document.body.innerText || '';
                    const m = txt.match(/(安装|启用|开启|允许|下载)[^\n]{0,8}(Flash|flash|FLASH)|(Flash|flash)[^\n]{0,8}(插件|播放器|未安装|已禁用)/);
                    if (m) {
                        flashPromptLogged = true;
                        log('警告', '页面出现 Flash 提示文字:「' + m[0] + '」');
                    }
                }
            }
        }

        function addSwf(raw) {
            let abs = raw;
            try { abs = new URL(raw, location.href).href; } catch (e) { }
            if (swfUrls.has(abs) || /objtest\.swf/i.test(abs)) return;
            swfUrls.add(abs);
            if (IS_TOP) {
                if (swfUrls.size <= 20) log('信息', '发现 swf 地址:', abs);
            } else {
                log('信息', '发现 swf 地址:', abs);
                try { W.parent.postMessage({ tag: TAG, type: 'swf', swf: abs }, '*'); } catch (e) { }
            }
        }

        function findSwfText() {
            const html = document.documentElement.innerHTML;
            const re = /[\w\-./:%?=&]*?\.swf(?:\?[\w\-.%=&]*)?/gi;
            let m;
            while ((m = re.exec(html)) !== null) {
                if (m[0].length > 4) addSwf(m[0]);
            }
        }

        function scanGlobals() {
            const keys = [];
            try {
                Object.keys(W).forEach(function (k) {
                    let v;
                    try { v = W[k]; } catch (e) { return; }
                    if (typeof v === 'string' && /\.swf/i.test(v) && v.length < 500) keys.push(k + '=' + v);
                });
            } catch (e) { }
            if (keys.length) log('信息', '全局变量里含 swf 的:', keys.join(' | '));
            if (typeof W.webServer === 'string' && typeof W._strGamePath === 'string') {
                const p = W._strGamePath.indexOf('//') === -1 ? W.webServer + W._strGamePath : W._strGamePath;
                log('信息', '游戏地址（webServer + _strGamePath）:', p);
                if (/\.swf/i.test(p)) addSwf(p);
            }
        }

        function observe() {
            let pending = null;
            const ob = new MutationObserver(function (records) {
                for (let i = 0; i < records.length; i++) {
                    const t = records[i].target;
                    if (t && t.id === '__4399_ruffle_debug_panel__') return;
                }
                if (pending) return;
                pending = setTimeout(function () { pending = null; scan(false); }, 300);
            });
            ob.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data'] });
        }

        function report() {
            const flashEls = document.querySelectorAll('object, embed').length;
            const players = Array.from(document.querySelectorAll('ruffle-object, ruffle-embed, ruffle-player'))
                .filter(function (el) { return el.offsetWidth > 10 || el.offsetHeight > 10; }).length;
            log('信息', '汇总（' + (IS_TOP ? '顶层' : 'iframe') + '）: object/embed=' + flashEls + '，游戏播放器=' + players + '，swf 地址=' + swfUrls.size);
            if (IS_TOP) log('信息', '加载遮罩状态: ' + overlayState());
            if (players > 0) {
                log('结论', 'Ruffle 已接管游戏。若仍黑屏/报错，看上面的代理下载结果；下载成功仍不行多半是 Ruffle 不支持该游戏用到的 AS3 功能');
            } else if (swfUrls.size > 0) {
                log('结论', '有 swf 地址，但没有游戏播放器。可以点“手动播放 swf”试试');
            } else if (IS_TOP && externalFrames.size > 0) {
                log('结论', '游戏在第三方网站的 iframe 里（' + Array.from(externalFrames).join('、') + '），不是 4399 自己的 Flash。' +
                    '这类多是需要连游戏服务器的在线网游（如奥拉星、洛克王国），浏览器里的 Ruffle 连不上服务器，脚本无法支持');
            } else if (IS_TOP) {
                log('结论', '顶层页面没有游戏 swf。游戏可能在 iframe 里，或这不是游戏播放页（4399 的游戏介绍页要点“开始游戏”进 _N.htm 播放页）');
            }
        }

        // ---------------- 手动播放 ----------------
        function manualPlay() {
            const rp = W.RufflePlayer;
            if (!rp || typeof rp.newest !== 'function' || !rp.newest()) {
                log('错误', 'Ruffle 还没就绪，无法手动播放');
                return;
            }
            const first = Array.from(swfUrls)[0] || '';
            const url = W.prompt('输入 swf 地址', first);
            if (!url) return;

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:40vh;z-index:2147483646;background:#000;';
            const close = makeBtn('关闭播放器', function () { overlay.remove(); });
            close.style.cssText += 'position:absolute;top:6px;right:6px;z-index:1;';
            const player = rp.newest().createPlayer();
            player.style.cssText = 'width:100%;height:100%;';
            overlay.appendChild(player);
            overlay.appendChild(close);
            document.body.appendChild(overlay);

            log('信息', '手动播放:', url);
            try {
                const api = typeof player.ruffle === 'function' ? player.ruffle() : player;
                Promise.resolve(api.load({ url: url, allowScriptAccess: false })).then(function () {
                    log('结论', '手动播放 load() 成功');
                }, function (err) {
                    log('错误', '手动播放 load() 失败:', fmt(err));
                });
            } catch (err) {
                log('错误', '手动播放异常:', fmt(err));
            }
        }

        // ---------------- 启动 ----------------
        hookConsole();
        hookFetch();
        hookErrors();
        if (IS_TOP) createPanel();
        reportEnv();
        bypassDetect();
        loadRuffle(0);
        observe();
        W.addEventListener('load', function () {
            log('信息', '页面 load 完成');
            scan(true);
            scanGlobals();
            setTimeout(report, 5000);
            setTimeout(function () { log('信息', '10 秒后加载遮罩状态: ' + overlayState()); }, 10000);
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
