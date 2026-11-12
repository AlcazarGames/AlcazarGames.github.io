/* Bridge to the native Alcazar.exe shell (WebView2). Falls back to browser APIs when opened in a normal browser. */
(function (G) {
  'use strict';
  const A = G.Alcazar;
  const wv = G.chrome && G.chrome.webview;
  let seq = 0;
  const pending = {};
  const listeners = {};
  if (wv) {
    wv.addEventListener('message', function (e) {
      let m = e.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (err) { return; } }
      if (m.id && pending[m.id]) {
        const p = pending[m.id]; delete pending[m.id];
        if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error || 'failed'));
      } else if (m.event && listeners[m.event]) listeners[m.event].forEach(function (f) { f(m.data); });
    });
  }

  function pickFiles(accept, multiple) {
    return new Promise(function (resolve) {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept; i.multiple = !!multiple;
      i.onchange = function () { resolve(Array.prototype.slice.call(i.files)); };
      i.click();
    });
  }
  function readAs(file, how) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); }; r.onerror = rej;
      if (how === 'text') r.readAsText(file); else r.readAsDataURL(file);
    });
  }
  function download(name, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/octet-stream' }));
    a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // browser fallbacks so the IDE can be developed/tested in any browser
  const fallback = {
    openProject: function () {
      return pickFiles('.alcazar,.json').then(function (f) {
        if (!f.length) return null;
        return readAs(f[0], 'text').then(function (t) { return { path: f[0].name, text: t }; });
      });
    },
    saveProject: function (d) { download((d.suggestedName || 'game') + '.alcazar', d.text, 'application/json'); return Promise.resolve({ path: (d.suggestedName || 'game') + '.alcazar' }); },
    readFile: function () { return Promise.reject(new Error('not available in browser')); },
    importAssets: function (d) {
      return pickFiles(d.kind === 'sound' ? 'audio/*' : d.kind === 'font' ? '.ttf,.otf,.woff,.woff2' : d.kind === 'model' ? '.glb,.gltf,.obj' : 'image/*', true).then(function (files) {
        return Promise.all(files.map(function (f) { return readAs(f, 'url').then(function (u) { return { name: f.name, dataUrl: u }; }); }));
      });
    },
    exportHtml: function (d) { download(d.name + '.html', d.html, 'text/html'); return Promise.resolve({ path: d.name + '.html' }); },
    exportExe: function () { return Promise.reject(new Error('Exporting an .exe needs the Alcazar desktop app. Use "Web page" export in the browser.')); },
    setTitle: function (d) { document.title = d.title; return Promise.resolve(); },
    setDirty: function () { return Promise.resolve(); },
    openFolder: function () { return Promise.resolve(); },
    runFile: function () { return Promise.resolve(); },
    info: function () { return Promise.resolve({ version: 'browser', native: false }); }
  };

  A.Host = {
    native: !!wv,
    call: function (cmd, data) {
      if (!wv) {
        const f = fallback[cmd];
        return f ? f(data || {}) : Promise.reject(new Error('unknown command ' + cmd));
      }
      const id = 'r' + (++seq);
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        wv.postMessage(JSON.stringify(Object.assign({ id: id, cmd: cmd }, data || {})));
      });
    },
    on: function (event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  };
})(window);
