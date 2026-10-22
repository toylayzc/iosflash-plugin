
 // ==UserScript==
 // @name         4399 Flash 游戏 Ruffle 兼容器
 // @namespace    local.4399.ruffle
 // @version      1.0.0
 // @description  尝试在 4399 旧版 Flash 游戏页面加载 Ruffle
 // @match        https://4399.com/*
 // @match        https://*.4399.com/*
 // @match        http://4399.com/*
 // @match        http://*.4399.com/*
 // @match        https://4399.net/*
 // @match        https://*.4399.net/*
 // @match        http://4399.net/*
 // @match        http://*.4399.net/*
 // @run-at       document-start
 // @grant        none
 // ==/UserScript==

(function () {
    'use strict';

    // 防止脚本重复执行
    if (window.__4399_RUFFLE_STARTED__) return;
    window.__4399_RUFFLE_STARTED__ = true;

    // Ruffle 播放器配置
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
        autoplay: 'on',
        unmuteOverlay: 'visible',
        splashScreen: false,
        warnOnUnsupportedContent: true,
        logLevel: 'warn',
        allowScriptAccess: false
    };

    const RUFFLE_URL =
        'https://unpkg.com/@ruffle-rs/ruffle';

    function log(...args) {
        console.log('[4399 Ruffle]', ...args);
    }

    function loadRuffle() {
        if (window.__4399_RUFFLE_LOADING__) return;
        window.__4399_RUFFLE_LOADING__ = true;

        const script = document.createElement('script');
        script.src = RUFFLE_URL;
        script.async = true;

        script.onload = () => {
            log('Ruffle 脚本加载完成');

            if (!window.RufflePlayer) {
                log('没有找到 RufflePlayer');
                return;
            }

            log('Ruffle 已初始化；正在检查页面中的 Flash 内容');
            inspectFlashElements();
        };

        script.onerror = () => {
            log('Ruffle 加载失败，请检查网络或 CDN 是否可访问');
            window.__4399_RUFFLE_LOADING__ = false;
        };

        (document.head || document.documentElement).appendChild(script);
    }

    function inspectFlashElements() {
        const elements = document.querySelectorAll(
            'object, embed'
        );

        elements.forEach((el) => {
            const type = (el.getAttribute('type') || '').toLowerCase();
            const data = el.getAttribute('data') ||
                         el.getAttribute('src') || '';

            if (
                type.includes('shockwave-flash') ||
                /\.swf(?:[?#]|$)/i.test(data)
            ) {
                log('检测到 Flash 元素：', data || el);
            }
        });
    }

    // 监听页面动态插入的 Flash 元素
    function observePage() {
        const observer = new MutationObserver(() => {
            inspectFlashElements();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // 尽早加载 Ruffle，尝试让其兼容层接管 Flash 内容
    loadRuffle();

    if (document.documentElement) {
        observePage();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observePage();
        }, { once: true });
    }
})();
