/* Flow mode: a living flowchart. Click + on any arrow to add a step, drag steps to move them,
 * click a step to edit it on the right. While the game runs, steps light up as they execute. */
(function (G) {
  'use strict';
  const A = G.Alcazar, W = A.W;
  const NH = 40, GAP = 34, PAD = 16, PILL = 38;

  function tw(s) { return W.textWidth(String(s)); }
  function color(s) { return A.CATEGORIES[A.stmtCategory(s)].color; }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function FlowEditor(root, api) {
    this.root = root; this.api = api;
    this.view = { x: 30, y: 20, z: 1 };
    this.sel = null;
    root.innerHTML = '';
    root.classList.add('flow-wrap');
    this.palette = W.el('div', { class: 'flow-palette' });
    this.canvas = W.el('div', { class: 'flow-canvas', tabindex: '0' });
    this.side = W.el('div', { class: 'flow-side' });
    root.appendChild(this.palette); root.appendChild(this.canvas); root.appendChild(this.side);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'flow-svg');
    this.canvas.appendChild(this.svg);
    this.empty = W.el('div', { class: 'flow-empty' });
    this.canvas.appendChild(this.empty);
    this.zoomBar = W.el('div', { class: 'flow-zoom' }, [
      W.el('button', { html: A.icon('minus', 14), title: 'Zoom out', onclick: () => this.zoomBy(1 / 1.2) }),
      W.el('button', { html: A.icon('fit', 14), title: 'Fit everything', onclick: () => this.fit() }),
      W.el('button', { html: A.icon('plus', 14), title: 'Zoom in', onclick: () => this.zoomBy(1.2) })
    ]);
    this.canvas.appendChild(this.zoomBar);
    this.buildPalette();
    this.bind();
  }

  FlowEditor.prototype.scripts = function () { return this.api.getScripts(); };

  // ------------------------------------------------------------- palette
  FlowEditor.prototype.buildPalette = function () {
    const self = this, p = this.palette;
    p.innerHTML = '';
    p.appendChild(W.el('div', { class: 'pal-title', text: 'Drag onto an arrow' }));
    function item(label, icon, cat, make, title) {
      const it = W.el('div', { class: 'pal-item', title: title || '' }, [
        W.el('span', { class: 'cat-bar', style: { background: A.CATEGORIES[cat].color } }),
        W.el('span', { text: label })
      ]);
      it.addEventListener('mousedown', function (e) { if (e.button === 0) { e.preventDefault(); self.beginDrag(e, make(), null, label); } });
      return it;
    }
    const groups = {};
    function grp(cat) {
      if (!groups[cat]) {
        const g = W.el('details', { class: 'pal-group', open: cat === 'Events' || cat === 'Motion' || cat === 'Control' ? true : null }, [
          W.el('summary', { style: { color: A.CATEGORIES[cat].color }, text: cat })
        ]);
        groups[cat] = g; p.appendChild(g);
      }
      return groups[cat];
    }
    Object.keys(A.EVENTS).filter(function (k) { return k !== 'never'; }).forEach(function (k) {
      const e = A.EVENTS[k];
      grp('Events').appendChild(item(e.label.replace('{p}', '…'), e.icon, 'Events', function () { return { script: A.newScript(k) }; }, 'Drag anywhere to start a new script'));
    });
    ['if', 'repeat', 'while', 'forever'].forEach(function (k) {
      grp('Control').appendChild(item(A.STRUCTS[k].label, A.STRUCTS[k].icon, 'Control', function () { return A.newStmt(k); }));
    });
    A.ACTION_LIST.forEach(function (a) {
      grp(a.cat).appendChild(item(A.fillLabel(a.label, a.args.reduce(function (m, x) { m[x.n] = '_'; return m; }, {})), a.icon, a.cat, function () { return A.newStmt('call', a.fn); }, a.doc));
    });
    grp('Data').appendChild(item('set variable', '', 'Data', function () { return A.newStmt('set'); }));
    grp('Data').appendChild(item('note', '', 'Data', function () { return A.newStmt('comment'); }));
  };

  // ------------------------------------------------------------- measuring
  FlowEditor.prototype.m = function (s) {
    let r = this.cache.get(s);
    if (r) return r;
    switch (s.t) {
      case 'if': {
        const dw = Math.max(130, tw(trunc(s.cond, 40) + ' ?') + 70), dh = 56;
        const T = this.mList(s.then), E = this.mList(s.else || []);
        const tx = Math.max(dw / 2 + 12, T.r + 26), ex = Math.max(dw / 2 + 12, E.l + 26);
        r = { l: tx + T.l, r: ex + E.r, h: dh / 2 + Math.max(T.h, E.h) + 18, dw: dw, dh: dh, tx: tx, ex: ex, T: T, E: E };
        break;
      }
      case 'repeat': case 'while': case 'forever': {
        const hw = tw(trunc(A.stmtLabel(s), 40)) + 64, B = this.mList(s.body);
        const sl = Math.max(hw / 2, B.l) + 24, sr = Math.max(hw / 2, B.r) + 24;
        const fe = s.t === 'forever';
        r = { l: sl + 6, r: fe ? Math.max(hw / 2, B.r) : sr + 6, h: NH + B.h + (fe ? 14 : 26), hw: hw, B: B, sl: sl, sr: sr };
        break;
      }
      default: {
        const w = Math.max(110, tw(trunc(A.stmtLabel(s), 48)) + PAD * 2 + 26);
        r = { l: w / 2, r: w / 2, h: NH, w: w };
      }
    }
    this.cache.set(s, r);
    return r;
  };
  FlowEditor.prototype.mList = function (list) {
    let l = 16, r = 16, h = GAP;
    for (let i = 0; i < list.length; i++) { const m = this.m(list[i]); l = Math.max(l, m.l); r = Math.max(r, m.r); h += m.h + GAP; }
    return { l: l, r: r, h: h };
  };

  // ------------------------------------------------------------- drawing
  FlowEditor.prototype.edge = function (list, i, cx, y, out, arrow) {
    const id = this.targets.length;
    this.targets.push({ list: list, index: i, x: cx, y: y + GAP / 2 });
    out.push('<line class="fl-line" x1="' + cx + '" y1="' + y + '" x2="' + cx + '" y2="' + (y + GAP) + '"' + (arrow ? ' marker-end="url(#fl-arrow)"' : '') + '/>');
    out.push('<g class="fl-plus" data-plus="' + id + '" transform="translate(' + cx + ',' + (y + GAP / 2) + ')"><circle r="9"/><path d="M-4 0H4M0 -4V4"/></g>');
  };
  FlowEditor.prototype.drawList = function (list, cx, y, out) {
    for (let i = 0; i <= list.length; i++) {
      this.edge(list, i, cx, y, out, i < list.length);
      y += GAP;
      if (i < list.length) y = this.drawStmt(list[i], cx, y, out);
    }
    return y;
  };
  FlowEditor.prototype.drawStmt = function (s, cx, y, out) {
    const m = this.m(s), c = color(s), esc = W.esc;
    const selCls = this.sel === s.id ? ' sel' : '';
    switch (s.t) {
      case 'if': {
        const hy = y + m.dh / 2;
        out.push('<g class="fl-node' + selCls + '" data-id="' + s.id + '"><polygon class="fl-shape" fill="' + c + '" points="' + cx + ',' + y + ' ' + (cx + m.dw / 2) + ',' + hy + ' ' + cx + ',' + (y + m.dh) + ' ' + (cx - m.dw / 2) + ',' + hy + '"/>' +
          '<text class="fl-txt" x="' + cx + '" y="' + (hy + 4.5) + '" text-anchor="middle">' + esc(trunc(s.cond, 40)) + ' ?</text></g>');
        const lx = cx - m.tx, rx = cx + m.ex;
        out.push('<path class="fl-line" d="M' + (cx - m.dw / 2) + ' ' + hy + 'H' + lx + '"/><path class="fl-line" d="M' + (cx + m.dw / 2) + ' ' + hy + 'H' + rx + '"/>');
        out.push('<text class="fl-yes" x="' + (cx - m.dw / 2 - 6) + '" y="' + (hy - 6) + '" text-anchor="end">yes</text><text class="fl-no" x="' + (cx + m.dw / 2 + 6) + '" y="' + (hy - 6) + '">no</text>');
        const ty = this.drawList(s.then, lx, hy, out);
        if (!s.else) s.else = [];
        const ey = this.drawList(s.else, rx, hy, out);
        const my = hy + Math.max(m.T.h, m.E.h) + 10;
        out.push('<path class="fl-line" d="M' + lx + ' ' + ty + 'V' + my + 'H' + rx + 'V' + ey + '"/>');
        out.push('<path class="fl-line" d="M' + cx + ' ' + my + 'V' + (y + m.h) + '"/><circle class="fl-dot" cx="' + cx + '" cy="' + my + '" r="4"/>');
        return y + m.h;
      }
      case 'repeat': case 'while': case 'forever': {
        const hw = m.hw, x0 = cx - hw / 2, x1 = cx + hw / 2, my = y + NH / 2;
        out.push('<g class="fl-node' + selCls + '" data-id="' + s.id + '"><polygon class="fl-shape" fill="' + c + '" points="' + (x0 + 14) + ',' + y + ' ' + (x1 - 14) + ',' + y + ' ' + x1 + ',' + my + ' ' + (x1 - 14) + ',' + (y + NH) + ' ' + (x0 + 14) + ',' + (y + NH) + ' ' + x0 + ',' + my + '"/>' +
          '<text class="fl-txt" x="' + cx + '" y="' + (my + 4.5) + '" text-anchor="middle">' + esc(trunc(A.stmtLabel(s), 40)) + '</text></g>');
        const by = this.drawList(s.body, cx, y + NH, out);
        out.push('<path class="fl-line fl-loop" marker-end="url(#fl-arrow)" d="M' + cx + ' ' + by + 'V' + (by + 8) + 'H' + (cx - m.sl) + 'V' + my + 'H' + (x0 - 2) + '"/>');
        if (s.t !== 'forever') {
          out.push('<path class="fl-line" d="M' + x1 + ' ' + my + 'H' + (cx + m.sr) + 'V' + (y + m.h - 6) + 'H' + cx + 'V' + (y + m.h) + '"/>');
          out.push('<text class="fl-no" x="' + (x1 + 6) + '" y="' + (my - 6) + '">done</text>');
        }
        return y + m.h;
      }
      case 'comment': {
        out.push('<g class="fl-node fl-note' + selCls + '" data-id="' + s.id + '"><rect class="fl-shape" x="' + (cx - m.w / 2) + '" y="' + y + '" width="' + m.w + '" height="' + NH + '" rx="4"/>' +
          '<text class="fl-txt" x="' + cx + '" y="' + (y + NH / 2 + 4.5) + '" text-anchor="middle">' + esc(trunc(s.text, 48)) + '</text></g>');
        return y + NH;
      }
      default: {
        const x0 = cx - m.w / 2;
        out.push('<g class="fl-node' + selCls + '" data-id="' + s.id + '"><rect class="fl-shape fl-box" x="' + x0 + '" y="' + y + '" width="' + m.w + '" height="' + NH + '" rx="7"/>' +
          '<rect class="fl-accent" fill="' + c + '" x="' + x0 + '" y="' + y + '" width="5" height="' + NH + '" rx="2"/>' +
          '<text class="fl-txt fl-dark" x="' + (cx + 2) + '" y="' + (y + NH / 2 + 4.5) + '" text-anchor="middle">' + esc(trunc(A.stmtLabel(s), 48)) + '</text></g>');
        return y + NH;
      }
    }
  };

  FlowEditor.prototype.render = function () {
    const scripts = this.scripts();
    this.cache = new Map();
    this.targets = [];
    const out = [];
    out.push('<defs><marker id="fl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="fl-arrowhead"/></marker></defs>');
    out.push('<g id="fl-root" transform="translate(' + this.view.x + ',' + this.view.y + ') scale(' + this.view.z + ')">');
    const self = this;
    this.bounds = [];
    if (scripts) scripts.forEach(function (sc) {
      const label = A.eventLabel(sc), ev = A.EVENTS[sc.event] || {};
      const pw = tw(label) + 56, M = self.mList(sc.body);
      const L = Math.max(M.l, pw / 2) + 18, R = Math.max(M.r, pw / 2) + 18;
      const cx = sc.x + L, y0 = sc.y;
      const total = PILL + M.h + 28;
      const inner = [];
      const ye = self.drawList(sc.body, cx, y0 + PILL, inner);
      out.push('<rect class="fl-group' + (sc.event === 'never' ? ' off' : '') + '" x="' + sc.x + '" y="' + (y0 - 10) + '" width="' + (L + R) + '" height="' + (total + 22) + '" rx="16"/>');
      out.push('<g class="fl-event' + (self.sel === 'ev:' + sc.id ? ' sel' : '') + '" data-sc="' + sc.id + '"><rect x="' + (cx - pw / 2) + '" y="' + y0 + '" width="' + pw + '" height="' + PILL + '" rx="19" fill="' + (sc.event === 'never' ? '#666' : A.CATEGORIES.Events.color) + '"/>' +
        '<text class="fl-txt fl-evtxt" x="' + cx + '" y="' + (y0 + PILL / 2 + 5) + '" text-anchor="middle">' + W.esc(label) + '</text></g>');
      out.push(inner.join(''));
      out.push('<g class="fl-end"><rect x="' + (cx - 28) + '" y="' + ye + '" width="56" height="22" rx="11"/><text x="' + cx + '" y="' + (ye + 15) + '" text-anchor="middle">end</text></g>');
      self.bounds.push({ x0: sc.x, y0: y0 - 10, x1: sc.x + L + R, y1: y0 + total + 12 });
    });
    out.push('<g id="fl-drop"></g></g>');
    this.svg.innerHTML = out.join('');
    const has = scripts && scripts.length;
    this.empty.style.display = has ? 'none' : 'flex';
    this.empty.innerHTML = '';
    if (!scripts) this.empty.appendChild(W.el('div', { class: 'msg' }, [W.el('b', { text: 'Select an object' }), W.el('span', { text: ' in the scene list to see its scripts.' })]));
    else if (!has) {
      this.empty.appendChild(W.el('div', { class: 'msg' }, [
        W.el('b', { text: 'No scripts yet' }),
        W.el('p', { text: 'Every script starts with a "when" trigger. Drag one in from the left, or start with:' }),
        W.el('button', { class: 'primary', text: 'When game starts', onclick: () => this.addScript('start', 40, 40) }),
        W.el('button', { text: 'Every frame', onclick: () => this.addScript('update', 40, 40) })
      ]));
    }
    this.renderSide();
  };

  FlowEditor.prototype.renderSide = function () {
    const side = this.side, self = this, scripts = this.scripts();
    side.innerHTML = '';
    const ctx = this.api.ctx;
    const commit = function (full) { self.api.commit(); self.render(); if (full !== true) return; };
    if (this.sel && scripts) {
      if (this.sel.indexOf('ev:') === 0) {
        const sc = scripts.find(function (x) { return 'ev:' + x.id === self.sel; });
        if (sc) {
          side.appendChild(W.el('div', { class: 'side-hd', style: { borderColor: A.CATEGORIES.Events.color } }, [W.el('b', { text: 'Script trigger' })]));
          side.appendChild(W.el('p', { class: 'side-doc', text: 'This decides when the steps below it run.' }));
          side.appendChild(W.eventFields(sc, ctx, function (full) { self.api.commit(); self.svgOnly(); if (full) self.renderSide(); }));
          side.appendChild(W.el('div', { class: 'side-btns' }, [
            W.el('button', { text: 'Duplicate script', onclick: function () { const c = JSON.parse(JSON.stringify(sc)); c.id = A.uid(); c.x += 40; c.y += 40; A.walk(c.body, function (s) { s.id = A.uid(); }); scripts.push(c); self.sel = 'ev:' + c.id; commit(); } }),
            W.el('button', { class: 'danger', text: 'Delete script', onclick: function () { scripts.splice(scripts.indexOf(sc), 1); self.sel = null; commit(); } })
          ]));
          return;
        }
      } else {
        const f = A.findStmt(scripts, this.sel);
        if (f) {
          const s = f.stmt, cat = A.stmtCategory(s), c = A.CATEGORIES[cat].color;
          const title = s.t === 'call' ? A.fillLabel(A.ACTIONS[s.fn].label, A.ACTIONS[s.fn].args.reduce(function (m, x) { m[x.n] = '…'; return m; }, {})) : A.STRUCTS[s.t].label;
          side.appendChild(W.el('div', { class: 'side-hd', style: { borderColor: c } }, [W.el('b', { text: title }), W.el('span', { class: 'side-cat', style: { color: c }, text: cat })]));
          const doc = s.t === 'call' ? A.ACTIONS[s.fn].doc : s.t === 'if' ? 'If the condition is true, follow "yes". Otherwise follow "no".' : s.t === 'set' ? 'Variables remember things, like score or lives. Properties like x, y or vx work too.' : s.t === 'comment' ? 'Notes don\'t do anything — they explain your idea.' : 'The steps inside repeat. Each loop waits one frame, so animations look smooth.';
          side.appendChild(W.el('p', { class: 'side-doc', text: doc }));
          side.appendChild(W.stepFields(s, ctx, function () { self.api.commit(); self.svgOnly(); }));
          side.appendChild(W.el('div', { class: 'side-btns' }, [
            W.el('button', { text: 'Duplicate', onclick: function () { const c2 = A.cloneStmt(s); f.list.splice(f.index + 1, 0, c2); self.sel = c2.id; commit(); } }),
            W.el('button', { class: 'danger', text: 'Delete', onclick: function () { self.deleteSel(); } })
          ]));
          return;
        }
      }
      this.sel = null;
    }
    side.appendChild(W.el('div', { class: 'side-help' }, [
      W.el('h3', { text: 'How Flow works' }),
      W.el('ol', { html: '<li>A script starts at a <b>yellow “when” bubble</b>.</li><li>Steps run top to bottom, following the arrows.</li><li>Click the <b>+</b> on any arrow to add a step there, or drag one from the left.</li><li>Click a step to change it here. Drag it to move it.</li><li><b>Diamonds</b> make choices, <b>hexagons</b> repeat.</li><li>Press <b>Play</b> and watch the steps light up as they run.</li>' }),
      W.el('div', { class: 'side-keys', html: '<kbd>Del</kbd> delete step · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · drag background to pan · wheel to zoom · double-click background for a new script' })
    ]));
  };
  // re-render only the diagram (keeps side-panel inputs focused)
  FlowEditor.prototype.svgOnly = function () {
    const side = this.renderSide;
    this.renderSide = function () {};
    try { this.render(); } finally { this.renderSide = side; }
  };

  // ------------------------------------------------------------- editing helpers
  FlowEditor.prototype.addScript = function (event, x, y) {
    const scripts = this.scripts();
    if (!scripts) return;
    const sc = A.newScript(event); sc.x = Math.round(x); sc.y = Math.round(y);
    scripts.push(sc);
    this.sel = 'ev:' + sc.id;
    this.api.commit(); this.render();
  };
  FlowEditor.prototype.insertAt = function (target, s) {
    target.list.splice(target.index, 0, s);
    this.sel = s.id;
    this.api.commit(); this.render();
  };
  FlowEditor.prototype.deleteSel = function () {
    const scripts = this.scripts();
    if (!this.sel || !scripts) return;
    if (this.sel.indexOf('ev:') === 0) {
      const i = scripts.findIndex((x) => 'ev:' + x.id === this.sel);
      if (i >= 0) scripts.splice(i, 1);
    } else {
      const f = A.findStmt(scripts, this.sel);
      if (f) f.list.splice(f.index, 1);
    }
    this.sel = null;
    this.api.commit(); this.render();
  };
  function listsInside(s) {
    const set = new Set();
    A.walk([s], function (n) { ['then', 'else', 'body'].forEach(function (k) { if (n[k]) set.add(n[k]); }); });
    return set;
  }

  // ------------------------------------------------------------- input
  FlowEditor.prototype.toWorld = function (e) {
    const r = this.svg.getBoundingClientRect();
    return [(e.clientX - r.left - this.view.x) / this.view.z, (e.clientY - r.top - this.view.y) / this.view.z];
  };
  FlowEditor.prototype.applyView = function () {
    const g = this.svg.querySelector('#fl-root');
    if (g) g.setAttribute('transform', 'translate(' + this.view.x + ',' + this.view.y + ') scale(' + this.view.z + ')');
  };
  FlowEditor.prototype.zoomBy = function (k, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const z = Math.max(0.25, Math.min(2.5, this.view.z * k));
    this.view.x = cx - (cx - this.view.x) * (z / this.view.z);
    this.view.y = cy - (cy - this.view.y) * (z / this.view.z);
    this.view.z = z;
    this.applyView();
  };
  FlowEditor.prototype.fit = function () {
    if (!this.bounds || !this.bounds.length) { this.view = { x: 30, y: 20, z: 1 }; this.applyView(); return; }
    const b = this.bounds.reduce(function (a, c) { return { x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }; });
    const r = this.svg.getBoundingClientRect();
    const z = Math.max(0.25, Math.min(1.2, Math.min((r.width - 40) / (b.x1 - b.x0), (r.height - 40) / (b.y1 - b.y0))));
    this.view = { z: z, x: 20 - b.x0 * z, y: 20 - b.y0 * z };
    this.applyView();
  };
  FlowEditor.prototype.nearestTarget = function (wx, wy) {
    let best = null, bd = 34 / this.view.z;
    (this.targets || []).forEach(function (t) {
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bd) { bd = d; best = t; }
    });
    return best;
  };
  FlowEditor.prototype.beginDrag = function (e, payload, from, label) {
    const self = this;
    const ghost = W.el('div', { class: 'fl-ghost', text: label || (payload.script ? A.eventLabel(payload.script) : A.stmtLabel(payload)) });
    document.body.appendChild(ghost);
    let moved = !!(payload.script || !from);
    const sx = e.clientX, sy = e.clientY;
    let target = null;
    const forbidden = from ? listsInside(from.stmt) : new Set();
    function move(ev) {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true;
      ghost.style.display = 'block';
      ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 6 + 'px';
      const wpt = self.toWorld(ev);
      target = payload.script ? null : self.nearestTarget(wpt[0], wpt[1]);
      if (target && forbidden.has(target.list)) target = null;
      const drop = self.svg.querySelector('#fl-drop');
      if (drop) drop.innerHTML = target ? '<circle class="fl-droptarget" cx="' + target.x + '" cy="' + target.y + '" r="14"/>' : '';
    }
    function up(ev) {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      ghost.remove();
      if (!moved) { if (from) { self.sel = from.stmt.id; self.render(); self.canvas.focus(); } return; }
      const r = self.canvas.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (payload.script) {
        if (!inside || !self.scripts()) { self.render(); return; }
        const wpt = self.toWorld(ev);
        self.addScript(payload.script.event, wpt[0] - 60, wpt[1] - 15);
        return;
      }
      if (!target) { self.render(); return; }
      if (from) {
        let idx = target.index;
        if (target.list === from.list && from.index < idx) idx--;
        from.list.splice(from.index, 1);
        target.list.splice(idx, 0, from.stmt);
        self.sel = from.stmt.id;
        self.api.commit(); self.render();
      } else self.insertAt(target, payload);
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  FlowEditor.prototype.bind = function () {
    const self = this, svg = this.svg;
    svg.addEventListener('mousedown', function (e) {
      self.canvas.focus();
      const scripts = self.scripts();
      if (!scripts) return;
      const plus = e.target.closest('[data-plus]');
      if (plus && e.button === 0) {
        const t = self.targets[+plus.getAttribute('data-plus')];
        e.preventDefault();
        W.stepPicker(e.clientX + 10, e.clientY - 20, function (pick) {
          self.insertAt(t, pick.kind === 'call' ? A.newStmt('call', pick.fn) : A.newStmt(pick.kind));
        });
        return;
      }
      const node = e.target.closest('[data-id]');
      if (node && e.button === 0) {
        e.preventDefault();
        const f = A.findStmt(scripts, node.getAttribute('data-id'));
        if (f) self.beginDrag(e, f.stmt, f);
        return;
      }
      const ev = e.target.closest('[data-sc]');
      if (ev && e.button === 0) {
        e.preventDefault();
        const sc = scripts.find(function (x) { return x.id === ev.getAttribute('data-sc'); });
        const start = self.toWorld(e), ox = sc.x, oy = sc.y;
        let moved = false;
        const mv = function (m) {
          const p = self.toWorld(m);
          if (!moved && Math.hypot(p[0] - start[0], p[1] - start[1]) * self.view.z < 4) return;
          moved = true;
          sc.x = Math.round(ox + p[0] - start[0]); sc.y = Math.round(oy + p[1] - start[1]);
          self.svgOnly();
        };
        const up = function () {
          document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
          if (moved) self.api.commit(true);
          else { self.sel = 'ev:' + sc.id; self.render(); }
        };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
        return;
      }
      // background: pan
      const sx = e.clientX, sy = e.clientY, vx = self.view.x, vy = self.view.y;
      let moved = false;
      const mv = function (m) {
        if (Math.hypot(m.clientX - sx, m.clientY - sy) > 3) moved = true;
        self.view.x = vx + m.clientX - sx; self.view.y = vy + m.clientY - sy; self.applyView();
      };
      const up = function () {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        if (!moved && self.sel) { self.sel = null; self.render(); }
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    svg.addEventListener('dblclick', function (e) {
      if (e.target.closest('[data-id],[data-sc],[data-plus]') || !self.scripts()) return;
      const p = self.toWorld(e);
      W.eventPicker(e.clientX, e.clientY, function (k) { self.addScript(k, p[0] - 60, p[1] - 15); });
    });
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) > 0 && !e.shiftKey) self.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
      else { self.view.x -= e.deltaX || e.deltaY; self.applyView(); }
    }, { passive: false });
    this.canvas.addEventListener('keydown', function (e) {
      if (e.key === 'Delete' || e.key === 'Backspace') { self.deleteSel(); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && self.sel && self.sel.indexOf('ev:') !== 0) {
        const f = A.findStmt(self.scripts(), self.sel);
        if (f) { const c = A.cloneStmt(f.stmt); f.list.splice(f.index + 1, 0, c); self.sel = c.id; self.api.commit(); self.render(); }
        e.preventDefault();
      }
    });
  };

  // live highlighting while the game runs
  FlowEditor.prototype.highlight = function (hits, frame) {
    const nodes = this.svg.querySelectorAll('[data-id]');
    for (let i = 0; i < nodes.length; i++) {
      const f = hits ? hits[nodes[i].getAttribute('data-id')] : undefined;
      nodes[i].classList.toggle('hot', f != null && frame - f < 3);
      nodes[i].classList.toggle('warm', f != null && frame - f >= 3 && frame - f < 30);
    }
  };

  A.FlowEditor = FlowEditor;
})(window);
