/* Blocks mode: snap-together blocks. Same program as Flow and Text. */
(function (G) {
  'use strict';
  const A = G.Alcazar, W = A.W;

  function BlockEditor(root, api) {
    this.root = root; this.api = api;
    root.innerHTML = '';
    root.classList.add('bk-wrap');
    this.palette = W.el('div', { class: 'bk-palette' });
    this.scroller = W.el('div', { class: 'bk-scroller' });
    this.ws = W.el('div', { class: 'bk-ws' });
    this.scroller.appendChild(this.ws);
    root.appendChild(this.palette); root.appendChild(this.scroller);
    this.listMap = new Map();
    this.buildPalette();
    this.bindPan();
  }

  BlockEditor.prototype.scripts = function () { return this.api.getScripts(); };

  // ------------------------------------------------------------- block DOM
  BlockEditor.prototype.inlineLabel = function (row, label, values) {
    // label like "move by {dx}, {dy}" ; values: {name: element}
    label.split(/(\{\w+\})/).forEach(function (part) {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) { if (values[m[1]]) row.appendChild(values[m[1]]); }
      else if (part) row.appendChild(W.el('span', { class: 'bk-t', text: part }));
    });
  };
  BlockEditor.prototype.field = function (value, type, onChange) {
    const self = this;
    return W.exprField(value, type, this.api.ctx, function (v) { onChange(v); self.api.commit(); }, { compact: true });
  };
  BlockEditor.prototype.blockFor = function (s, list) {
    const self = this, cat = A.stmtCategory(s), c = A.CATEGORIES[cat].color;
    const b = W.el('div', { class: 'bk-block bk-' + s.t, 'data-id': s.id, style: { '--c': c } });
    const head = W.el('div', { class: 'bk-row' });
    b.appendChild(head);
    switch (s.t) {
      case 'call': {
        const a = A.ACTIONS[s.fn];
        const vals = {};
        a.args.forEach(function (d, i) {
          if (d.only3d) return;
          vals[d.n] = self.field(s.args[i] != null ? s.args[i] : d.def, d.type, function (v) { while (s.args.length < i) s.args.push(a.args[s.args.length].def); s.args[i] = v; });
        });
        this.inlineLabel(head, a.label, vals);
        a.args.forEach(function (d, i) {
          if (!d.only3d || (!self.api.ctx.is3d() && s.args[i] == null)) return;
          head.appendChild(W.el('span', { class: 'bk-t', text: ',' }));
          head.appendChild(self.field(s.args[i] != null ? s.args[i] : d.def, d.type, function (v) { while (s.args.length < i) s.args.push(a.args[s.args.length].def); s.args[i] = v; }));
        });
        break;
      }
      case 'set': {
        const sel = W.el('select', { class: 'bk-sel' });
        [['=', 'set'], ['+=', 'add to'], ['-=', 'take from'], ['*=', 'multiply'], ['/=', 'divide']].forEach(function (o) { sel.appendChild(W.el('option', { value: o[0], text: o[1], selected: s.op === o[0] })); });
        sel.addEventListener('change', function () { s.op = sel.value; self.api.commit(); });
        sel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        head.appendChild(sel);
        head.appendChild(W.exprField(s.target, 'num', this.api.ctx, function (v) { if (/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/.test(v)) { s.target = v; self.api.commit(); } }, { compact: true, raw: true }));
        head.appendChild(W.el('span', { class: 'bk-t', text: s.op === '=' ? 'to' : s.op === '*=' || s.op === '/=' ? 'by' : 'amount' }));
        head.appendChild(this.field(s.value, 'num', function (v) { s.value = v; }));
        break;
      }
      case 'comment': {
        const inp = W.el('input', { class: 'bk-note', value: s.text, spellcheck: 'false' });
        inp.addEventListener('change', function () { s.text = inp.value; self.api.commit(); });
        inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
        head.appendChild(W.el('span', { class: 'bk-t', text: 'note' }));
        head.appendChild(inp);
        break;
      }
      case 'if':
        head.appendChild(W.el('span', { class: 'bk-t', text: 'if' }));
        head.appendChild(this.field(s.cond, 'bool', function (v) { s.cond = v; }));
        head.appendChild(W.el('span', { class: 'bk-t', text: 'then' }));
        b.appendChild(this.mouth(s.then));
        if (!s.else) s.else = [];
        b.appendChild(W.el('div', { class: 'bk-row bk-mid' }, [W.el('span', { class: 'bk-t', text: 'else' })]));
        b.appendChild(this.mouth(s.else));
        b.appendChild(W.el('div', { class: 'bk-foot' }));
        break;
      case 'repeat': case 'while': case 'forever':
        if (s.t === 'repeat') { head.appendChild(W.el('span', { class: 'bk-t', text: 'repeat' })); head.appendChild(this.field(s.count, 'num', function (v) { s.count = v; })); head.appendChild(W.el('span', { class: 'bk-t', text: 'times' })); }
        else if (s.t === 'while') { head.appendChild(W.el('span', { class: 'bk-t', text: 'repeat while' })); head.appendChild(this.field(s.cond, 'bool', function (v) { s.cond = v; })); }
        else head.appendChild(W.el('span', { class: 'bk-t', text: 'forever' }));
        b.appendChild(this.mouth(s.body));
        b.appendChild(W.el('div', { class: 'bk-foot' }, ));
        break;
    }
    b.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('input,select,button,.alz-expr')) return;
      e.preventDefault(); e.stopPropagation();
      const idx = list.indexOf(s);
      self.beginDrag(e, { list: list, index: idx, stmts: list.slice(idx) }, b);
    });
    b.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();
      W.menu(e.clientX, e.clientY, [
        { label: 'Duplicate', icon: 'copy', onClick: function () { list.splice(list.indexOf(s) + 1, 0, A.cloneStmt(s)); self.api.commit(); self.render(); } },
        { label: 'Delete', icon: 'trash', onClick: function () { list.splice(list.indexOf(s), 1); self.api.commit(); self.render(); } }
      ]);
    });
    return b;
  };
  BlockEditor.prototype.mouth = function (list) {
    const m = W.el('div', { class: 'bk-mouth' });
    m.appendChild(this.listEl(list));
    return m;
  };
  BlockEditor.prototype.listEl = function (list) {
    const self = this, el = W.el('div', { class: 'bk-list' });
    this.listMap.set(el, list);
    list.forEach(function (s) { el.appendChild(self.blockFor(s, list)); });
    return el;
  };
  BlockEditor.prototype.hatFor = function (sc) {
    const self = this, scripts = this.scripts(), ev = A.EVENTS[sc.event];
    const hat = W.el('div', { class: 'bk-hat' + (sc.event === 'never' ? ' off' : ''), style: { '--c': sc.event === 'never' ? '#666' : A.CATEGORIES.Events.color } });
    const row = W.el('div', { class: 'bk-row' });
    hat.appendChild(row);
    const vals = {};
    if (ev.param) {
      vals.p = W.exprField(ev.param === 'num' ? sc.param : '"' + sc.param + '"', ev.param, this.api.ctx, function (v) {
        const m = /^\s*"(.*)"\s*$/.exec(v); sc.param = m ? m[1] : v; self.api.commit();
      }, { compact: true, raw: true });
    }
    this.inlineLabel(row, ev.label, vals);
    hat.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('input,select,button,.alz-expr')) return;
      e.preventDefault(); e.stopPropagation();
      self.beginDrag(e, { script: sc }, hat.parentNode);
    });
    hat.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();
      const items = [{ header: 'Change trigger' }];
      Object.keys(A.EVENTS).forEach(function (k) {
        items.push({ label: A.EVENTS[k].label.replace('{p}', '…'), onClick: function () { sc.event = k; sc.param = A.EVENTS[k].def || ''; self.api.commit(); self.render(); } });
      });
      items.push('-', { label: 'Delete whole script', icon: 'trash', onClick: function () { scripts.splice(scripts.indexOf(sc), 1); self.api.commit(); self.render(); } });
      W.menu(e.clientX, e.clientY, items);
    });
    return hat;
  };

  BlockEditor.prototype.render = function () {
    const self = this, scripts = this.scripts();
    this.ws.innerHTML = '';
    this.listMap = new Map();
    if (!scripts) { this.ws.appendChild(W.el('div', { class: 'bk-empty', text: 'Select an object to see its blocks.' })); return; }
    if (!scripts.length) this.ws.appendChild(W.el('div', { class: 'bk-empty', text: 'Drag a yellow "when" block here to start a script.' }));
    let maxX = 1200, maxY = 900;
    scripts.forEach(function (sc) {
      const st = W.el('div', { class: 'bk-stack', 'data-sc': sc.id, style: { left: sc.x + 'px', top: sc.y + 'px' } });
      st.appendChild(self.hatFor(sc));
      st.appendChild(self.listEl(sc.body));
      self.ws.appendChild(st);
      maxX = Math.max(maxX, sc.x + 900); maxY = Math.max(maxY, sc.y + 900);
    });
    this.ws.style.width = maxX + 'px'; this.ws.style.height = maxY + 'px';
  };

  // ------------------------------------------------------------- palette
  BlockEditor.prototype.buildPalette = function () {
    const self = this, p = this.palette;
    p.innerHTML = '';
    const groups = {};
    function grp(cat) {
      if (!groups[cat]) {
        p.appendChild(W.el('div', { class: 'bk-pcat', style: { color: A.CATEGORIES[cat].color }, text: cat }));
        groups[cat] = p;
      }
    }
    function proto(label, cat, make, isHat, title) {
      grp(cat);
      const el = W.el('div', { class: 'bk-proto' + (isHat ? ' hat' : ''), style: { '--c': A.CATEGORIES[cat].color }, text: label, title: title || '' });
      el.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        const made = make();
        self.beginDrag(e, isHat ? { newScript: made } : { stmts: [made] }, el);
      });
      p.appendChild(el);
    }
    Object.keys(A.EVENTS).filter(function (k) { return k !== 'never'; }).forEach(function (k) {
      proto(A.EVENTS[k].label.replace('{p}', '…'), 'Events', function () { return A.newScript(k); }, true);
    });
    const cats = ['Motion', 'Physics', 'Looks', 'Sound', 'Control', 'Camera', 'Data'];
    cats.forEach(function (cat) {
      if (cat === 'Control') ['if', 'repeat', 'while', 'forever'].forEach(function (k) { proto(A.STRUCTS[k].label, 'Control', function () { return A.newStmt(k); }); });
      if (cat === 'Data') { proto('set variable', 'Data', function () { return A.newStmt('set'); }); proto('note', 'Data', function () { return A.newStmt('comment'); }); }
      A.ACTION_LIST.filter(function (a) { return a.cat === cat; }).forEach(function (a) {
        proto(A.fillLabel(a.label, a.args.reduce(function (m, x) { m[x.n] = '( )'; return m; }, {})), cat, function () { return A.newStmt('call', a.fn); }, false, a.doc);
      });
    });
  };

  // ------------------------------------------------------------- drag + drop
  BlockEditor.prototype.dropTargets = function (exclude) {
    const out = [];
    this.listMap.forEach(function (list, el) {
      if (exclude && exclude.contains(el)) return;
      const r = el.getBoundingClientRect(), kids = el.children;
      for (let i = 0; i <= kids.length; i++) {
        const y = i < kids.length ? kids[i].getBoundingClientRect().top : (kids.length ? kids[kids.length - 1].getBoundingClientRect().bottom : r.top);
        out.push({ list: list, index: i, x: r.left, y: y });
      }
    });
    return out;
  };
  BlockEditor.prototype.beginDrag = function (e, payload, srcEl) {
    const self = this, scripts = this.scripts();
    if (!scripts) return;
    const sr = srcEl.getBoundingClientRect();
    const offX = e.clientX - sr.left, offY = e.clientY - sr.top;
    let ghost = null, moved = false, target = null, targets = null;
    const marker = W.el('div', { class: 'bk-marker' });
    // the blocks being dragged (to exclude their own lists as targets)
    const draggedEls = [];
    if (payload.list) {
      const parent = srcEl.parentNode;
      const kids = Array.prototype.slice.call(parent.children);
      for (let i = kids.indexOf(srcEl); i < kids.length; i++) draggedEls.push(kids[i]);
    }
    function move(ev) {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      if (!moved) {
        moved = true;
        ghost = W.el('div', { class: 'bk-ghost' });
        if (payload.list) draggedEls.forEach(function (d) { ghost.appendChild(d.cloneNode(true)); d.classList.add('bk-dragging'); });
        else ghost.appendChild(srcEl.cloneNode(true));
        document.body.appendChild(ghost);
        document.body.appendChild(marker);
        targets = payload.script || payload.newScript ? [] : self.dropTargets(null).filter(function (t) {
          return !draggedEls.some(function (d) { return d.contains(self.elForList(t.list)); });
        });
      }
      const gx = ev.clientX - offX, gy = ev.clientY - offY;
      ghost.style.left = gx + 'px'; ghost.style.top = gy + 'px';
      target = null;
      let bd = 46;
      targets.forEach(function (t) { const d = Math.hypot(t.x - gx, t.y - gy); if (d < bd) { bd = d; target = t; } });
      if (target) { marker.style.display = 'block'; marker.style.left = target.x + 'px'; marker.style.top = target.y - 3 + 'px'; }
      else marker.style.display = 'none';
    }
    function up(ev) {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      marker.remove();
      if (!moved) return;
      ghost.remove();
      const wr = self.ws.getBoundingClientRect(), pr = self.palette.getBoundingClientRect();
      const wx = Math.round(ev.clientX - offX - wr.left), wy = Math.round(ev.clientY - offY - wr.top);
      const overPalette = ev.clientX < pr.right && ev.clientX >= pr.left;
      if (payload.script) {
        if (overPalette) scripts.splice(scripts.indexOf(payload.script), 1);
        else { payload.script.x = Math.max(0, wx); payload.script.y = Math.max(0, wy); }
      } else if (payload.newScript) {
        if (overPalette) { self.render(); return; }
        payload.newScript.x = Math.max(0, wx); payload.newScript.y = Math.max(0, wy);
        scripts.push(payload.newScript);
      } else {
        const stmts = payload.stmts;
        if (payload.list) payload.list.splice(payload.index, stmts.length);
        if (overPalette) { /* deleted */ }
        else if (target) {
          let idx = target.index;
          if (target.list === payload.list && payload.index < idx) idx -= stmts.length;
          Array.prototype.splice.apply(target.list, [idx, 0].concat(stmts));
        } else {
          // loose blocks become an unused script so nothing is lost
          const sc = A.newScript('never'); sc.x = Math.max(0, wx); sc.y = Math.max(0, wy - 34); sc.body = stmts;
          scripts.push(sc);
        }
        // remove empty "never" scripts
        for (let i = scripts.length - 1; i >= 0; i--) if (scripts[i].event === 'never' && !scripts[i].body.length) scripts.splice(i, 1);
      }
      self.api.commit(); self.render();
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  BlockEditor.prototype.elForList = function (list) {
    let found = null;
    this.listMap.forEach(function (l, el) { if (l === list) found = el; });
    return found;
  };
  BlockEditor.prototype.bindPan = function () {
    const sc = this.scroller;
    sc.addEventListener('mousedown', function (e) {
      if (e.target !== sc && e.target.className !== 'bk-ws') return;
      const sx = e.clientX, sy = e.clientY, l = sc.scrollLeft, t = sc.scrollTop;
      const mv = function (m) { sc.scrollLeft = l - (m.clientX - sx); sc.scrollTop = t - (m.clientY - sy); };
      const up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  };
  BlockEditor.prototype.highlight = function (hits, frame) {
    const nodes = this.ws.querySelectorAll('.bk-block');
    for (let i = 0; i < nodes.length; i++) {
      const f = hits ? hits[nodes[i].getAttribute('data-id')] : undefined;
      nodes[i].classList.toggle('hot', f != null && frame - f < 3);
    }
  };

  A.BlockEditor = BlockEditor;
})(window);
