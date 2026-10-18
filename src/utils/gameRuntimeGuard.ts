/**
 * Runtime Guard & Polyfill Injector for 'Билайн ИИ-игры от Пакман'
 *
 * Ensures that any generated game runs reliably in sandboxed iframes without crashing,
 * even when the LLM makes calls to sandbox-restricted APIs (localStorage, pointerLock)
 * or when event listeners have ID mismatches.
 */

export const RUNTIME_GUARD_SCRIPT = `
<!-- AI-Games Runtime Guard & Safety Layer -->
<style id="aigames-guard-styles">
  /* Ensure start and restart buttons are always topmost and clickable */
  #start-btn, #btn-start, #play-btn, #btn-play, .big-btn, .btn-main, button.btn-play,
  #restart-btn, #btn-restart, .restart-btn {
    pointer-events: auto !important;
    cursor: pointer !important;
    z-index: 99999 !important;
    position: relative;
  }
  .overlay, #start-screen, #win-screen, #lose-screen, .screen-overlay {
    pointer-events: auto !important;
  }
  #aigames-error-boundary {
    display: none;
    position: fixed;
    bottom: 12px;
    left: 12px;
    right: 12px;
    background: rgba(220, 38, 38, 0.95);
    color: #fff;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-family: sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  #aigames-error-boundary.show {
    display: flex;
  }
</style>
<script id="aigames-guard-script">
(function() {
  'use strict';

  // 1. In-memory LocalStorage & SessionStorage Shim for sandboxed iframe
  (function() {
    var isStorageAvailable = false;
    try {
      var test = window.localStorage;
      test.setItem('__aigames_test', '1');
      test.removeItem('__aigames_test');
      isStorageAvailable = true;
    } catch (e) {
      isStorageAvailable = false;
    }

    if (!isStorageAvailable) {
      var createMemoryStorage = function() {
        var store = {};
        return {
          getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
          setItem: function(k, v) { store[k] = String(v); },
          removeItem: function(k) { delete store[k]; },
          clear: function() { store = {}; },
          key: function(i) { return Object.keys(store)[i] || null; },
          get length() { return Object.keys(store).length; }
        };
      };
      try {
        var memLocal = createMemoryStorage();
        var memSession = createMemoryStorage();
        Object.defineProperty(window, 'localStorage', { value: memLocal, configurable: true, writable: true });
        Object.defineProperty(window, 'sessionStorage', { value: memSession, configurable: true, writable: true });
      } catch (err) {
        // window property couldn't be redefined
      }
    }
  })();

  // 2. Safe PointerLock & Fullscreen Stubs (prevent unhandled DOMExceptions)
  if (typeof Element !== 'undefined') {
    var origReqPointerLock = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function() {
      try {
        if (origReqPointerLock) {
          var res = origReqPointerLock.call(this);
          if (res && typeof res.catch === 'function') {
            res.catch(function(e) { /* ignore sandbox rejection */ });
          }
          return res;
        }
      } catch (e) {
        // PointerLock disallowed in iframe without allow-pointer-lock
      }
      return Promise.resolve();
    };

    var origReqFullscreen = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function() {
      try {
        if (origReqFullscreen) {
          var res = origReqFullscreen.call(this);
          if (res && typeof res.catch === 'function') {
            res.catch(function(e) { /* ignore */ });
          }
          return res;
        }
      } catch (e) {}
      return Promise.resolve();
    };
  }

  // 3. Global Error Boundary inside the sandbox iframe
  var createErrorBoundary = function() {
    if (document.getElementById('aigames-error-boundary')) return;
    var div = document.createElement('div');
    div.id = 'aigames-error-boundary';
    div.innerHTML = '<span>⚠️ Замечена ошибка скрипта: <span id="aigames-err-text"></span></span><button style="background:#fff;color:#000;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-weight:bold" onclick="location.reload()">Заново</button>';
    document.body ? document.body.appendChild(div) : document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(div); });
  };

  window.addEventListener('error', function(e) {
    console.warn('[AIGames Sandbox Intercepted Error]:', e.message);
    // Don't show banner for benign sound/audio or minor warnings
    if (e.message && (e.message.indexOf('Audio') !== -1 || e.message.indexOf('ResizeObserver') !== -1)) return;
    createErrorBoundary();
    var errSpan = document.getElementById('aigames-err-text');
    var banner = document.getElementById('aigames-error-boundary');
    if (errSpan && banner) {
      errSpan.textContent = (e.message || 'Ошибка выполнения').slice(0, 60);
      banner.classList.add('show');
    }
  });

  // 4. Universal Start/Restart Button Auto-Binder Fallback
  // Guarantees that even if the AI script had an ID typo or failed to attach onclick,
  // clicking "ИГРАТЬ" / "Запустить" will hide the start screen and launch the game.
  function setupButtonFallbacks() {
    var startButtons = document.querySelectorAll(
      '#start-btn, #btn-start, #play-btn, #btn-play, #start, button.btn-play, .big-btn, .btn-main, button'
    );

    startButtons.forEach(function(btn) {
      var text = (btn.textContent || '').trim().toLowerCase();
      var isStartBtn = btn.id.match(/(start|play|launch)/i) || text.match(/(играть|старт|запустить|начать|play|start)/i);
      var isRestartBtn = btn.id.match(/(restart|retry|again)/i) || text.match(/(снова|заново|restart|retry)/i);

      if (isStartBtn && !isRestartBtn) {
        var triggerStart = function() {
          // Hide known overlays
          var overlays = document.querySelectorAll(
            '#start-screen, .start-screen, .overlay:not(#win-screen):not(#lose-screen), .screen-overlay:not(#win-screen):not(#lose-screen)'
          );
          overlays.forEach(function(ov) {
            ov.classList.add('hidden');
            ov.style.display = 'none';
          });

          // Call global start functions if defined
          if (typeof window.startGame === 'function') {
            try { window.startGame(); } catch (e) { console.warn(e); }
          } else if (typeof window.initGame === 'function') {
            try { window.initGame(); } catch (e) { console.warn(e); }
          } else if (typeof window.start === 'function') {
            try { window.start(); } catch (e) { console.warn(e); }
          }
        };

        btn.addEventListener('click', triggerStart);
        btn.addEventListener('touchend', triggerStart);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupButtonFallbacks);
  } else {
    setupButtonFallbacks();
  }
  // Also run after a brief delay for dynamically rendered DOM
  setTimeout(setupButtonFallbacks, 300);
})();
</script>
`;

/**
 * Injects the runtime guard into HTML document before any other scripts run.
 */
export function injectRuntimeGuard(html: string): string {
  if (!html || typeof html !== 'string') return html;

  // Avoid double injection
  if (html.includes('aigames-guard-script')) return html;

  // Insert immediately after <head> if possible
  if (html.includes('<head>')) {
    return html.replace('<head>', '<head>\n' + RUNTIME_GUARD_SCRIPT);
  }

  // Or after <!DOCTYPE html> / <html>
  if (html.includes('<html>')) {
    return html.replace('<html>', '<html>\n<head>' + RUNTIME_GUARD_SCRIPT + '</head>');
  }

  return RUNTIME_GUARD_SCRIPT + '\n' + html;
}
