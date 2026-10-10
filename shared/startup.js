'use strict';
// Keep a usable explanation on screen even if the main script never starts.
(() => {
  function reportScriptFailure() {
    if (!document.querySelector('#workspace').hidden) return;
    document.querySelector('#loading').hidden = true;
    document.querySelector('#auth').hidden = false;
    document.querySelector('#auth-error').textContent = '页面脚本未能启动，请强制刷新页面（Ctrl+Shift+R，Mac：Cmd+Shift+R）。若仍失败，请检查 /shared/app.js 是否能正常打开。';
    document.querySelector('#auth-submit').disabled = true;
  }
  document.querySelector('#app-script').addEventListener('error', reportScriptFailure);
  window.addEventListener('error', event => {
    if (event.filename && new URL(event.filename, location.href).pathname === '/shared/app.js') reportScriptFailure();
  });
  setTimeout(() => {
    if (document.documentElement.dataset.journalReady !== 'true') reportScriptFailure();
  }, 10000);
})();
