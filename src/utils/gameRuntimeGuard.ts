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
  /* Ensure start, restart and next stage buttons are always topmost, clickable and responsive on touch */
  #start-btn, #btn-start, #play-btn, #btn-play, .big-btn, .btn-main, button.btn-play,
  #restart-btn, #btn-restart, .restart-btn,
  #next-btn, #btn-next, #next-level-btn, #btn-next-level, .next-btn, .btn-next {
    pointer-events: auto !important;
    cursor: pointer !important;
    z-index: 99999 !important;
    position: relative;
    touch-action: manipulation !important;
  }
  .overlay, #start-screen, #win-screen, #lose-screen, #next-screen, #stage-screen, #level-screen, .screen-overlay, .transition-screen {
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

  // Game buttons (#start-btn, #next-btn, #restart-btn) are managed exclusively
  // by game code to prevent double-firing and skipped stages.
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
