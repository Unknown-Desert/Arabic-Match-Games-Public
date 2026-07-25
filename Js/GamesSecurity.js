const GameSecurity = (function () {

    const CONFIG = {
        strictMode: true,
        blockTranslate: true,
        blockCopy: true,
        blockRightClickOnCards: true,
        blockLongPressOnCards: true,
        blockScreenshot: true,
        blockDevTools: true,
        blockDrag: true,
        blockShortcuts: true,
        showWarning: true,
        devToolsCheckInterval: 1000,
        onViolation: null
    };

    let violations = 0;
    let devToolsOpen = false;
    let securityActive = true;
    let screenshotAttempts = 0;

    function setupAntiTranslate() {
        if (!CONFIG.blockTranslate) return;

        let metaGoogle = document.querySelector('meta[name="google"]');
        if (!metaGoogle) {
            metaGoogle = document.createElement('meta');
            metaGoogle.name = 'google';
            metaGoogle.content = 'notranslate';
            document.head.appendChild(metaGoogle);
        }
        ['Content-Language','X-UA-Compatible'].forEach(httpEquiv => {
            if (!document.querySelector(`meta[http-equiv="${httpEquiv}"]`)) {
                const m = document.createElement('meta');
                m.httpEquiv = httpEquiv;
                m.content = httpEquiv === 'Content-Language' ? 'ar' : 'IE=edge';
                document.head.appendChild(m);
            }
        });
        document.documentElement.setAttribute('translate', 'no');

        document.body.classList.add('notranslate');
        document.querySelectorAll('*').forEach(el => el.classList.add('notranslate'));

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mut => {
                mut.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        node.classList.add('notranslate');
                        if (node.querySelectorAll) node.querySelectorAll('*').forEach(c => c.classList.add('notranslate'));
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        const style = document.createElement('style');
        style.id = 'anti-translate-style';
        style.textContent = `
            .goog-te-banner-frame, .goog-te-balloon-frame, .goog-tooltip,
            .goog-text-highlight, #goog-gt-tt, #goog-gt-vt,
            .VIpgJd-ZVi9od-l4eHX-hSRGPd, .skiptranslate {
                display: none !important;
            }
            body { top: 0 !important; }
            font { all: unset; }
        `;
        const old = document.getElementById('anti-translate-style');
        if (old) old.remove();
        document.head.appendChild(style);

        const textSnapshot = new Map();
        const arabicPattern = /[\u0600-\u06FF]/;
        function snapshotArabic() {
            textSnapshot.clear();
            document.querySelectorAll('.card-front, .card-back, h1, .subtitle, [data-arabic]').forEach((el, i) => {
                if (arabicPattern.test(el.textContent)) {
                    textSnapshot.set(`el-${i}`, { element: el, originalText: el.textContent });
                }
            });
        }
        snapshotArabic();
        const gridObserver = new MutationObserver(() => snapshotArabic());
        const gridEl = document.getElementById('game-grid');
        if (gridEl) gridObserver.observe(gridEl, { childList: true, subtree: true });
        setInterval(() => {
            if (!securityActive || !CONFIG.blockTranslate) return;
            textSnapshot.forEach(data => {
                if (data.element.textContent !== data.originalText) {
                    handleViolation('translation', 'Teks diterjemahkan oleh browser/ekstensi');
                    if (CONFIG.strictMode) data.element.textContent = data.originalText;
                }
            });
        }, 2000);
    }

    function setupAntiCopy() {
        if (!CONFIG.blockCopy) return;

        document.addEventListener('copy', e => {
            handleViolation('copy', 'Salin konten');
            e.preventDefault();
            e.clipboardData.setData('text/plain', '⚠️ Disable Copy');
        });
        document.addEventListener('cut', e => {
            handleViolation('cut', 'Potong konten');
            e.preventDefault();
        });
        document.addEventListener('paste', e => {
            const allowed = ['#sm-name-input'];
            const ok = allowed.some(sel => e.target.matches(sel));
            if (!ok) {
                handleViolation('paste', 'Tempel konten');
                e.preventDefault();
            }
        });

        const style = document.createElement('style');
        style.textContent = `
            .card, .card-front, .card-back, [data-arabic] {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
            }
        `;
        document.head.appendChild(style);
    }

    function setupLongPressProtection() {
        if (!CONFIG.blockLongPressOnCards) return;

        let longPressTimer;
        const MOVE_THRESHOLD = 10;
        function bind(el) {
            el.addEventListener('touchstart', onStart, { passive: false });
            el.addEventListener('touchend', onEnd);
            el.addEventListener('touchmove', onMove);
            el.addEventListener('touchcancel', clear);
        }
        function onStart(e) {
            this._startX = e.touches[0].clientX;
            this._startY = e.touches[0].clientY;
            this._isLong = false;
            longPressTimer = setTimeout(() => {
                this._isLong = true;
                handleViolation('longpress', 'Tekan lama pada kartu');
                if (navigator.vibrate) navigator.vibrate(50);
                e.preventDefault();
                window.getSelection().removeAllRanges();
            }, 600);
        }
        function onMove(e) {
            const dx = Math.abs(e.touches[0].clientX - this._startX);
            const dy = Math.abs(e.touches[0].clientY - this._startY);
            if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) clearTimeout(longPressTimer);
        }
        function onEnd(e) {
            clearTimeout(longPressTimer);
            if (this._isLong) {
                e.preventDefault();
                setTimeout(() => window.getSelection().removeAllRanges(), 10);
            }
        }
        function clear() { clearTimeout(longPressTimer); }

        const selector = '.card, .card-front, .card-back, [data-arabic]';
        document.querySelectorAll(selector).forEach(bind);
        new MutationObserver(() => document.querySelectorAll(selector).forEach(bind))
            .observe(document.body, { childList: true, subtree: true });
    }

    function setupRightClickProtection() {
        if (!CONFIG.blockRightClickOnCards) return;
        document.addEventListener('contextmenu', e => {
            if (e.target.closest('.card, .card-front, .card-back, [data-arabic], #message, .score-board')) {
                handleViolation('rightclick', 'Klik kanan area sensitif');
                e.preventDefault();
                showMiniTooltip(e, '🚫');
                return false;
            }
        });
    }

    function showMiniTooltip(event, msg) {
        const old = document.getElementById('security-tooltip');
        if (old) old.remove();
        const t = document.createElement('div');
        t.id = 'security-tooltip';
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed',
            left: event.clientX + 10 + 'px',
            top: event.clientY - 35 + 'px',
            background: 'rgba(0,0,0,0.9)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '13px',
            fontFamily: 'sans-serif',
            zIndex: 99999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'tooltipFade 1.5s forwards'
        });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1500);
    }

    function setupAntiScreenshot() {
        if (!CONFIG.blockScreenshot) return;

        let lastHidden = 0;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                const now = Date.now();
                if (now - lastHidden < 500) {
                    screenshotAttempts++;
                    handleViolation('screenshot', 'Kemungkinan screenshot Android');
                    if (CONFIG.showWarning) showScreenshotWarning();
                }
                lastHidden = now;
            }
        });

        document.addEventListener('keydown', e => {
            const key = e.key;
            const shot =
                key === 'PrintScreen' ||
                (key === 's' && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
                ((key === '3' || key === '4' || key === '5') && e.metaKey && e.shiftKey) ||
                (key === 'g' && (e.metaKey || e.ctrlKey));
            if (shot) {
                screenshotAttempts++;
                handleViolation('screenshot', 'Shortcut screenshot');
                if (CONFIG.strictMode) {
                    e.preventDefault();
                    const gc = document.querySelector('.game-container');
                    if (gc) { gc.style.filter = 'blur(20px)'; setTimeout(() => gc.style.filter = '', 500); }
                }
                if (CONFIG.showWarning) showScreenshotWarning();
            }
        });

        const overlay = document.createElement('div');
        overlay.id = 'anti-screenshot-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;opacity:0.02;background:repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 4px);';
        document.body.appendChild(overlay);
    }

    function showScreenshotWarning() {
        const old = document.getElementById('screenshot-warning');
        if (old) old.remove();
        const w = document.createElement('div');
        w.id = 'screenshot-warning';
        w.style.cssText = `
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) scale(0);
            background:rgba(0,0,0,0.95); color:#fff; padding:20px 30px;
            border-radius:16px; z-index:100000; text-align:center;
            font-family:sans-serif; box-shadow:0 20px 60px rgba(0,0,0,0.5);
            animation: warningPopup 0.4s ease-out forwards, warningFadeOut 0.3s 2s ease-in forwards;
            pointer-events:none;
        `;
        w.innerHTML = `<div style="font-size:40px;margin-bottom:10px;">📸</div>
            <h3 style="margin:0 0 8px;color:#e74c3c;">Screenshot Terdeteksi</h3>
            <p style="margin:0;font-size:14px;opacity:0.8;">Screenshot tidak diizinkan.<br>Pelanggaran dicatat.</p>`;
        document.body.appendChild(w);
        setTimeout(() => w.remove(), 2500);
    }

    function setupDevToolsDetection() {
        if (!CONFIG.blockDevTools) return;
        const threshold = 160;
        window.addEventListener('resize', () => {
            if (window.outerWidth - window.innerWidth > threshold ||
                window.outerHeight - window.innerHeight > threshold) handleDevToolsOpen();
        });
        setInterval(() => {
            if (!securityActive) return;
            const s = performance.now();
            debugger;
            if (performance.now() - s > 100) handleDevToolsOpen();
        }, CONFIG.devToolsCheckInterval);
        document.addEventListener('keydown', e => {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) ||
                (e.ctrlKey && e.key === 'u')) {
                handleDevToolsOpen();
                e.preventDefault();
                return false;
            }
        });
    }

    function handleDevToolsOpen() {
        if (devToolsOpen) return;
        devToolsOpen = true;
        handleViolation('devtools', 'DevTools terbuka');
        if (CONFIG.strictMode) {
            document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;background:#f5f5f5;color:#fff;"><div><h1> Denied </h1><button onclick="location.reload()" style="padding:12px 24px;background:#4CAF50;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-top:20px;">🔄 Retry</button></div></div>`;
        }
    }

    function setupAntiDrag() {
        if (!CONFIG.blockDrag) return;
        document.addEventListener('dragstart', e => {
            if (e.target.tagName === 'IMG' || e.target.closest('.card') || e.target.closest('h1')) {
                handleViolation('drag', 'Seret konten');
                e.preventDefault();
            }
        });
        const style = document.createElement('style');
        style.textContent = `img{-webkit-user-drag:none!important;user-drag:none!important}`;
        document.head.appendChild(style);
    }

    function setupShortcutProtection() {
        if (!CONFIG.blockShortcuts) return;
        document.addEventListener('keydown', e => {
            const combos = [
                { ctrl: true, key: 's' },
                { ctrl: true, key: 'p' },
                { ctrl: true, key: 'a', checkTarget: true },
                { ctrl: true, shift: true, key: 'S' }
            ];
            combos.forEach(c => {
                if (e.ctrlKey === !!c.ctrl && e.shiftKey === !!c.shift && e.key.toLowerCase() === c.key) {
                    if (c.checkTarget && !e.target.closest('.game-container')) return;
                    handleViolation('shortcut', `Shortcut terlarang: Ctrl+${c.key.toUpperCase()}`);
                    e.preventDefault();
                }
            });
        });
    }

    function handleViolation(type, desc) {
        violations++;
        console.warn(`[GameSecurity] #${violations}: ${type} – ${desc}`);
        if (typeof CONFIG.onViolation === 'function') {
            CONFIG.onViolation({ type, description: desc, count: violations, timestamp: new Date().toISOString() });
        }
        try {
            const logs = JSON.parse(localStorage.getItem('game_security_logs') || '[]');
            logs.push({ type, desc, ts: new Date().toISOString() });
            if (logs.length > 50) logs.shift();
            localStorage.setItem('game_security_logs', JSON.stringify(logs));
        } catch (_) {}
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes tooltipFade { 0% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
            @keyframes warningPopup { from { transform: translate(-50%,-50%) scale(0); opacity: 0; } to { transform: translate(-50%,-50%) scale(1); opacity: 1; } }
            @keyframes warningFadeOut { from { opacity: 1; } to { opacity: 0; } }
        `;
        document.head.appendChild(style);
    }

    function init(customConfig = {}) {
        Object.assign(CONFIG, customConfig);
        injectStyles();
        console.log('🛡️ GameSecurity Intermediate aktif');
        setupAntiTranslate();
        setupAntiCopy();
        setupRightClickProtection();
        setupLongPressProtection();
        setupAntiScreenshot();
        setupDevToolsDetection();
        setupAntiDrag();
        setupShortcutProtection();
        securityActive = true;
        return {
            get violations() { return violations; },
            isActive: () => securityActive,
            enable: () => { securityActive = true; },
            disable: () => { securityActive = false; },
            getLogs: () => {
                try { return JSON.parse(localStorage.getItem('game_security_logs') || '[]'); }
                catch (_) { return []; }
            },
            clearLogs: () => localStorage.removeItem('game_security_logs')
        };
    }

    return { init, CONFIG };
})();
