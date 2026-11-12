/* Shared UI helpers: element builder, smart value fields, step picker, menus */
(function (G) {
  'use strict';
  const A = G.Alcazar;
  const W = A.W = {};

  W.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };
  W.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  const measureCtx = document.createElement('canvas').getContext('2d');
  W.textWidth = function (txt, font) { measureCtx.font = font || '600 13px "Segoe UI", system-ui, sans-serif'; return measureCtx.measureText(txt).width; };

  // ---------------------------------------------------------------- floating menu
  let openMenu = null;
  W.closeMenu = function () { if (openMenu) { openMenu.remove(); openMenu = null; } };
  document.addEventListener('mousedown', function (e) { if (openMenu && !openMenu.contains(e.target)) W.closeMenu(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') W.closeMenu(); });
  W.popup = function (x, y, content, cls) {
    W.closeMenu();
    const m = W.el('div', { class: 'alz-popup ' + (cls || '') }, [content]);
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    const px = Math.max(6, Math.min(x, innerWidth - r.width - 6)), py = Math.max(6, Math.min(y, innerHeight - r.height - 6));
    m.style.left = px + 'px'; m.style.top = py + 'px';
    openMenu = m;
    return m;
  };
  // items: [{label, icon, hint, onClick, color}] or '-' separators
  W.menu = function (x, y, items) {
    const box = W.el('div', { class: 'alz-menu' });
    items.forEach(function (it) {
      if (it === '-') { box.appendChild(W.el('div', { class: 'sep' })); return; }
      if (it.header) { box.appendChild(W.el('div', { class: 'hdr', text: it.header })); return; }
      box.appendChild(W.el('div', {
        class: 'item' + (it.disabled ? ' disabled' : ''),
        onclick: function () { if (it.disabled) return; W.closeMenu(); it.onClick(); }
      }, [
        it.dot ? W.el('span', { class: 'ic' }, [W.el('span', { class: 'dot', style: { background: it.dot } })])
          : W.el('span', { class: 'ic', html: A.icon(it.icon, 15) }),
        W.el('span', { class: 'lb', text: it.label }),
        it.hint ? W.el('span', { class: 'hint', text: it.hint }) : null
      ]));
    });
    return W.popup(x, y, box);
  };

  // ---------------------------------------------------------------- suggestions for value types
  // ctx: { objects(), scenes(), sounds(), images(), messages(), variables() }
  W.suggestionsFor = function (type, ctx) {
    const q = function (s) { return '"' + s + '"'; };
    switch (type) {
      case 'key': return A.KEYS.map(function (k) { return { label: k, value: q(k) }; });
      case 'obj': return ctx.objects().map(function (n) { return { label: n, value: q(n) }; });
      case 'scene': return ctx.scenes().map(function (n) { return { label: n, value: q(n) }; });
      case 'sound': return A.BUILTIN_SOUNDS.map(function (n) { return { label: n + '  (built-in)', value: q(n) }; })
        .concat(ctx.sounds().map(function (n) { return { label: n, value: q(n) }; }));
      case 'image': return ctx.images().map(function (n) { return { label: n, value: q(n) }; });
      case 'font': return ctx.fonts().map(function (n) { return { label: n + '  (imported)', value: q(n) }; })
        .concat(A.FONTS.map(function (n) { return { label: n, value: q(n) }; }));
      case 'msg': return ctx.messages().map(function (n) { return { label: n, value: q(n) }; });
      case 'color': return ['#ff4d4d', '#ff9a2e', '#ffd84d', '#3ccf5a', '#3dd6e0', '#4c7dff', '#9b5cf6', '#ff6fb5', '#ffffff', '#888888', '#222222']
        .map(function (c) { return { label: c, value: q(c), swatch: c }; });
      default: {
        const out = [];
        ctx.variables().forEach(function (v) { out.push({ label: v, value: v, group: 'Variables' }); });
        ['x', 'y', 'rotation', 'vx', 'vy', 'scale', 'alpha'].forEach(function (p) { out.push({ label: p, value: p, group: 'My properties' }); });
        ['random(1, 10)', 'key_down("space")', 'touching("Wall")', 'distance_to("Player")', 'mouse_x()', 'mouse_y()', 'time()', 'dt']
          .forEach(function (r) { out.push({ label: r, value: r, group: 'Sensing & math' }); });
        return out;
      }
    }
  };

  // A text field for an expression with validation + dropdown of suggestions
  W.exprField = function (value, type, ctx, onChange, opts) {
    opts = opts || {};
    const wrap = W.el('div', { class: 'alz-expr' + (opts.compact ? ' compact' : '') });
    const inp = W.el('input', { type: 'text', spellcheck: 'false', value: value, placeholder: opts.placeholder || '' });
    let swatch = null;
    function validate() {
      const err = opts.raw ? null : A.checkExpr(inp.value);
      wrap.classList.toggle('bad', !!err);
      wrap.title = err ? err : (opts.title || '');
      if (swatch) { const m = /^\s*"(#[0-9a-fA-F]{3,6})"\s*$/.exec(inp.value); swatch.style.background = m ? m[1] : 'transparent'; }
      return !err;
    }
    function fire() { if (validate()) onChange(inp.value.trim()); }
    inp.addEventListener('input', function () { if (opts.compact) autosize(); validate(); });
    inp.addEventListener('change', fire);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { inp.blur(); } e.stopPropagation(); });
    inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    function autosize() { inp.style.width = Math.max(28, W.textWidth(inp.value || ' ', '13px Consolas, monospace') + 14) + 'px'; }
    if (type === 'color') {
      swatch = W.el('span', { class: 'swatch' });
      const picker = W.el('input', { type: 'color', class: 'hidden-color' });
      picker.addEventListener('input', function () { inp.value = '"' + picker.value + '"'; fire(); });
      swatch.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      swatch.addEventListener('click', function () { picker.click(); });
      wrap.appendChild(swatch); wrap.appendChild(picker);
    }
    wrap.appendChild(inp);
    const btn = W.el('button', { class: 'drop', title: 'Choose a value', html: A.icon('chevron', 12), tabindex: '-1' });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      const sug = W.suggestionsFor(type, ctx);
      if (!sug.length) { W.menu(r.left, r.bottom + 2, [{ label: type === 'image' ? 'Import images in the Assets panel first' : 'Nothing to pick yet', disabled: true, onClick: function () {} }]); return; }
      const items = [];
      let lastGroup = null;
      sug.forEach(function (s) {
        if (s.group && s.group !== lastGroup) { items.push({ header: s.group }); lastGroup = s.group; }
        items.push({ label: s.label, dot: s.swatch, onClick: function () { inp.value = s.value; if (opts.compact) autosize(); fire(); } });
      });
      W.menu(r.left, r.bottom + 2, items);
    });
    wrap.appendChild(btn);
    if (opts.compact) autosize();
    validate();
    wrap.input = inp;
    return wrap;
  };

  // ---------------------------------------------------------------- step picker (insert a new step)
  // onPick({kind, fn})
  W.stepPicker = function (x, y, onPick, opts) {
    opts = opts || {};
    const box = W.el('div', { class: 'alz-picker' });
    const search = W.el('input', { type: 'text', placeholder: 'Search steps…  (e.g. move, jump, sound)', class: 'search' });
    const list = W.el('div', { class: 'list' });
    box.appendChild(search); box.appendChild(list);
    function entries() {
      const out = [];
      Object.keys(A.STRUCTS).forEach(function (k) {
        const s = A.STRUCTS[k];
        out.push({ kind: k, label: s.label, cat: s.cat, icon: s.icon, doc: k === 'if' ? 'Make a decision: do one thing or another.' : k === 'set' ? 'Remember a number or text in a variable.' : k === 'comment' ? 'A sticky note — does nothing.' : 'Do the steps inside again and again.' });
      });
      A.ACTION_LIST.forEach(function (a) {
        out.push({ kind: 'call', fn: a.fn, label: A.fillLabel(a.label, a.args.reduce(function (m, x) { m[x.n] = '…'; return m; }, {})), cat: a.cat, icon: a.icon, doc: a.doc });
      });
      return out;
    }
    const all = entries();
    let active = 0, shown = [];
    function draw() {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = '';
      shown = all.filter(function (e) { return !q || (e.label + ' ' + (e.fn || e.kind) + ' ' + e.cat + ' ' + e.doc).toLowerCase().indexOf(q) >= 0; });
      let cat = null;
      shown.forEach(function (e, i) {
        if (e.cat !== cat && !q) { cat = e.cat; list.appendChild(W.el('div', { class: 'cat', text: cat, style: { color: A.CATEGORIES[cat].color } })); }
        const row = W.el('div', { class: 'row' + (i === active ? ' active' : ''), title: e.doc, onclick: function () { W.closeMenu(); onPick(e); } }, [
          W.el('span', { class: 'cat-bar', style: { background: A.CATEGORIES[e.cat].color } }),
          W.el('span', { class: 'lb', text: e.label }),
          W.el('span', { class: 'doc', text: e.doc })
        ]);
        list.appendChild(row);
      });
      const a = list.querySelector('.active'); if (a) a.scrollIntoView({ block: 'nearest' });
    }
    search.addEventListener('input', function () { active = 0; draw(); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[active]) { W.closeMenu(); onPick(shown[active]); }
      e.stopPropagation();
    });
    draw();
    W.popup(x, y, box, 'picker-pop');
    setTimeout(function () { search.focus(); }, 0);
  };

  W.eventPicker = function (x, y, onPick) {
    const items = Object.keys(A.EVENTS).filter(function (k) { return k !== 'never'; }).map(function (k) {
      const e = A.EVENTS[k];
      return { label: e.label.replace('{p}', '…'), dot: A.CATEGORIES.Events.color, onClick: function () { onPick(k); } };
    });
    W.menu(x, y, [{ header: 'Start a new script…' }].concat(items));
  };

  // build the editor fields for one step (used by Flow's side panel)
  W.stepFields = function (s, ctx, onChange) {
    const box = W.el('div', { class: 'step-fields' });
    function row(label, field, hint) {
      box.appendChild(W.el('label', { class: 'f-row' }, [W.el('span', { class: 'f-lb', text: label }), field]));
      if (hint) box.appendChild(W.el('div', { class: 'f-hint', text: hint }));
    }
    switch (s.t) {
      case 'call': {
        const a = A.ACTIONS[s.fn];
        if (!a) break;
        a.args.forEach(function (d, i) {
          if (d.only3d && !ctx.is3d() && s.args[i] == null) return;
          row(d.n, W.exprField(s.args[i] != null ? s.args[i] : d.def, d.type, ctx, function (v) {
            while (s.args.length < i) s.args.push(a.args[s.args.length].def);
            s.args[i] = v; onChange();
          }));
        });
        break;
      }
      case 'set': {
        row('variable', W.exprField(s.target, 'num', ctx, function (v) {
          if (!/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/.test(v)) return;
          s.target = v; onChange();
        }, { raw: true, title: 'A name like score, or a property like x' }));
        const sel = W.el('select', { onchange: function () { s.op = sel.value; onChange(); } });
        [['=', 'set to'], ['+=', 'add'], ['-=', 'take away'], ['*=', 'multiply by'], ['/=', 'divide by']].forEach(function (o) {
          sel.appendChild(W.el('option', { value: o[0], text: o[1], selected: s.op === o[0] }));
        });
        row('how', sel);
        row('value', W.exprField(s.value, 'num', ctx, function (v) { s.value = v; onChange(); }));
        break;
      }
      case 'if': case 'while':
        row('condition', W.exprField(s.cond, 'bool', ctx, function (v) { s.cond = v; onChange(); }),
          'Examples: key_down("left") · score > 10 · touching("Coin") and lives > 0');
        break;
      case 'repeat':
        row('times', W.exprField(s.count, 'num', ctx, function (v) { s.count = v; onChange(); }));
        break;
      case 'comment': {
        const ta = W.el('textarea', { rows: '3' });
        ta.value = s.text;
        ta.addEventListener('input', function () { s.text = ta.value.replace(/\n/g, ' '); });
        ta.addEventListener('change', onChange);
        ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
        row('note', ta);
        break;
      }
    }
    return box;
  };

  W.eventFields = function (sc, ctx, onChange) {
    const box = W.el('div', { class: 'step-fields' });
    const sel = W.el('select', {
      onchange: function () {
        sc.event = sel.value;
        const e = A.EVENTS[sc.event];
        sc.param = e.param ? (e.def || '') : '';
        onChange(true);
      }
    });
    Object.keys(A.EVENTS).forEach(function (k) { sel.appendChild(W.el('option', { value: k, text: A.EVENTS[k].label.replace('{p}', '…'), selected: sc.event === k })); });
    box.appendChild(W.el('label', { class: 'f-row' }, [W.el('span', { class: 'f-lb', text: 'when' }), sel]));
    const ev = A.EVENTS[sc.event];
    if (ev && ev.param) {
      const shown = ev.param === 'num' ? sc.param : '"' + sc.param + '"';
      const f = W.exprField(shown, ev.param, ctx, function (v) {
        const m = /^\s*"(.*)"\s*$/.exec(v);
        sc.param = m ? m[1] : v.replace(/^"|"$/g, '');
        onChange();
      }, { raw: ev.param !== 'num' });
      box.appendChild(W.el('label', { class: 'f-row' }, [W.el('span', { class: 'f-lb', text: ev.param === 'num' ? 'seconds' : ev.param === 'obj' ? 'name or tag' : ev.param }), f]));
      if (ev.param === 'obj') box.appendChild(W.el('div', { class: 'f-hint', text: 'Use "any" for anything. Inside the script, other is the object you touched.' }));
    }
    return box;
  };

  W.toast = function (msg, kind) {
    const t = W.el('div', { class: 'alz-toast ' + (kind || ''), text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  };

  W.modal = function (title, body, buttons) {
    const back = W.el('div', { class: 'alz-modal-back' });
    const box = W.el('div', { class: 'alz-modal' }, [W.el('h2', { text: title }), body]);
    const bar = W.el('div', { class: 'btns' });
    function close() { back.remove(); }
    (buttons || [{ label: 'OK', primary: true }]).forEach(function (b) {
      bar.appendChild(W.el('button', { class: b.primary ? 'primary' : '', text: b.label, onclick: function () { if (b.onClick && b.onClick() === false) return; close(); } }));
    });
    box.appendChild(bar);
    back.appendChild(box);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    return { close: close, box: box };
  };
})(window);
