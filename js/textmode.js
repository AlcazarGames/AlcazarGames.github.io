/* Text mode: AlcazarScript, a tiny Python-style language that maps 1:1 to Flow and Blocks. */
(function (G) {
  'use strict';
  const A = G.Alcazar, W = A.W;
  const KW = ['when', 'if', 'elif', 'else', 'repeat', 'while', 'forever', 'pass', 'and', 'or', 'not', 'true', 'false'];

  function highlight(src) {
    const esc = W.esc;
    return src.split('\n').map(function (line) {
      let out = '', i = 0;
      while (i < line.length) {
        const rest = line.slice(i);
        let m;
        if ((m = /^#.*/.exec(rest))) { out += '<span class="t-com">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
        if ((m = /^"(?:[^"\\]|\\.)*"?|^'(?:[^'\\]|\\.)*'?/.exec(rest))) { out += '<span class="t-str">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
        if ((m = /^\d+(\.\d+)?/.exec(rest))) { out += '<span class="t-num">' + m[0] + '</span>'; i += m[0].length; continue; }
        if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
          const w = m[0], after = line.slice(i + w.length);
          let cls = '';
          if (KW.indexOf(w) >= 0) cls = 't-kw';
          else if (/^\s*\(/.test(after)) cls = A.ACTIONS[w] ? 't-act t-' + A.ACTIONS[w].cat.toLowerCase() : A.REPORTERS[w] ? 't-fn' : 't-bad';
          else if (/^when\s+$/.test(line.slice(0, i))) cls = A.EVENTS[w] ? 't-ev' : 't-bad';
          else if (A.PROPERTIES.indexOf(w) >= 0) cls = 't-prop';
          out += cls ? '<span class="' + cls + '">' + w + '</span>' : esc(w);
          i += w.length; continue;
        }
        out += esc(line[i]); i++;
      }
      return out;
    }).join('\n') + '\n';
  }

  function TextEditor(root, api) {
    this.root = root; this.api = api;
    root.innerHTML = '';
    root.classList.add('tx-wrap');
    this.gutter = W.el('div', { class: 'tx-gutter' });
    this.pre = W.el('pre', { class: 'tx-hl', 'aria-hidden': 'true' });
    this.ta = W.el('textarea', { class: 'tx-ta', spellcheck: 'false', autocomplete: 'off', wrap: 'off' });
    this.err = W.el('div', { class: 'tx-err' });
    const ed = W.el('div', { class: 'tx-ed' }, [this.pre, this.ta]);
    const main = W.el('div', { class: 'tx-main' }, [W.el('div', { class: 'tx-body' }, [this.gutter, ed]), this.err]);
    this.ref = W.el('div', { class: 'tx-ref' });
    root.appendChild(main); root.appendChild(this.ref);
    this.ac = W.el('div', { class: 'tx-ac' });
    document.body.appendChild(this.ac);
    this.buildRef();
    this.bind();
    this.errorLine = 0;
  }

  TextEditor.prototype.render = function () {
    const scripts = this.api.getScripts();
    this.ta.disabled = !scripts;
    this.ta.value = scripts ? A.printScripts(scripts) : '# Select an object to see its code.';
    this.sync();
    this.setError(null);
  };
  TextEditor.prototype.sync = function () {
    this.pre.innerHTML = highlight(this.ta.value);
    const n = this.ta.value.split('\n').length;
    let g = '';
    for (let i = 1; i <= n; i++) g += '<div' + (i === this.errorLine ? ' class="bad"' : '') + '>' + i + '</div>';
    this.gutter.innerHTML = g;
    this.pre.scrollTop = this.ta.scrollTop; this.pre.scrollLeft = this.ta.scrollLeft; this.gutter.scrollTop = this.ta.scrollTop;
  };
  TextEditor.prototype.setError = function (e) {
    this.errorLine = e ? e.line : 0;
    this.err.className = 'tx-err' + (e ? ' show' : ' ok');
    this.err.textContent = e ? 'Line ' + e.line + ': ' + e.message : 'No errors. Changes are saved into the project as you type.';
  };
  // returns true if the text is valid (and applied)
  TextEditor.prototype.apply = function () {
    const scripts = this.api.getScripts();
    if (!scripts) return true;
    try {
      const parsed = A.parseText(this.ta.value, scripts);
      scripts.length = 0;
      Array.prototype.push.apply(scripts, parsed);
      this.setError(null);
      this.api.commit();
      this.sync();
      return true;
    } catch (e) {
      this.setError(e);
      this.sync();
      return false;
    }
  };
  TextEditor.prototype.hasError = function () { return !!this.errorLine; };

  TextEditor.prototype.completions = function (prefix) {
    const out = [];
    A.ACTION_LIST.forEach(function (a) { out.push({ w: a.fn, ins: a.fn + '(' + a.args.filter(function (x) { return !x.only3d; }).map(function (x) { return x.def; }).join(', ') + ')', doc: a.doc, k: 'action' }); });
    A.REPORTER_LIST.forEach(function (r) { out.push({ w: r.fn, ins: r.example, doc: r.doc, k: 'value' }); });
    A.PROPERTIES.forEach(function (p) { out.push({ w: p, ins: p, doc: 'property', k: 'prop' }); });
    ['if', 'elif', 'else', 'repeat', 'while', 'forever', 'when', 'and', 'or', 'not', 'true', 'false'].forEach(function (k) { out.push({ w: k, ins: k, doc: 'keyword', k: 'kw' }); });
    Object.keys(A.EVENTS).forEach(function (k) { out.push({ w: k, ins: k, doc: 'event', k: 'event' }); });
    this.api.ctx.variables().forEach(function (v) { out.push({ w: v, ins: v, doc: 'variable', k: 'var' }); });
    const p = prefix.toLowerCase();
    return out.filter(function (c) { return c.w.toLowerCase().indexOf(p) === 0 && c.w !== prefix; }).slice(0, 12);
  };
  TextEditor.prototype.showAC = function () {
    const ta = this.ta, pos = ta.selectionStart, before = ta.value.slice(0, pos);
    const m = /[A-Za-z_]\w*$/.exec(before);
    if (!m || m[0].length < 2 || /["'#]/.test(before.slice(before.lastIndexOf('\n') + 1).replace(/"[^"]*"/g, ''))) { this.hideAC(); return; }
    const list = this.completions(m[0]);
    if (!list.length) { this.hideAC(); return; }
    this.acItems = list; this.acPrefix = m[0]; this.acIdx = 0;
    // caret position estimate
    const lineStart = before.lastIndexOf('\n') + 1, line = before.slice(lineStart), row = before.split('\n').length - 1;
    const r = ta.getBoundingClientRect(), cw = W.textWidth('m', '14px Consolas, "Cascadia Mono", monospace');
    const x = r.left + 12 + line.length * cw - ta.scrollLeft, y = r.top + 10 + (row + 1) * 21 - ta.scrollTop;
    this.ac.style.left = Math.min(x, innerWidth - 380) + 'px'; this.ac.style.top = y + 'px';
    this.drawAC();
    this.ac.style.display = 'block';
  };
  TextEditor.prototype.drawAC = function () {
    const self = this;
    this.ac.innerHTML = '';
    this.acItems.forEach(function (c, i) {
      self.ac.appendChild(W.el('div', { class: 'ac-row' + (i === self.acIdx ? ' on' : ''), onmousedown: function (e) { e.preventDefault(); self.acIdx = i; self.acceptAC(); } }, [
        W.el('span', { class: 'ac-k ac-' + c.k, text: c.k }), W.el('b', { text: c.w }), W.el('span', { class: 'ac-doc', text: c.doc })
      ]));
    });
  };
  TextEditor.prototype.hideAC = function () { this.ac.style.display = 'none'; this.acItems = null; };
  TextEditor.prototype.acceptAC = function () {
    const c = this.acItems[this.acIdx], ta = this.ta, pos = ta.selectionStart;
    const after = ta.value.slice(pos);
    let ins = c.ins;
    if (/^\s*\(/.test(after)) ins = c.w;
    ta.value = ta.value.slice(0, pos - this.acPrefix.length) + ins + after;
    let caret = pos - this.acPrefix.length + ins.length;
    const paren = ins.indexOf('(');
    if (paren > 0 && ins.length > paren + 2) { // select the first argument
      const end = ins.indexOf(',') > 0 ? ins.indexOf(',') : ins.length - 1;
      ta.setSelectionRange(pos - this.acPrefix.length + paren + 1, pos - this.acPrefix.length + end);
    } else ta.setSelectionRange(caret, caret);
    this.hideAC();
    this.changed();
  };
  TextEditor.prototype.changed = function () {
    const self = this;
    this.sync();
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.apply(); }, 450);
  };

  TextEditor.prototype.bind = function () {
    const self = this, ta = this.ta;
    ta.addEventListener('input', function () { self.changed(); self.showAC(); });
    ta.addEventListener('scroll', function () { self.pre.scrollTop = ta.scrollTop; self.pre.scrollLeft = ta.scrollLeft; self.gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener('blur', function () { setTimeout(function () { self.hideAC(); }, 100); });
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (self.acItems) {
        if (e.key === 'ArrowDown') { self.acIdx = (self.acIdx + 1) % self.acItems.length; self.drawAC(); e.preventDefault(); return; }
        if (e.key === 'ArrowUp') { self.acIdx = (self.acIdx + self.acItems.length - 1) % self.acItems.length; self.drawAC(); e.preventDefault(); return; }
        if (e.key === 'Tab' || e.key === 'Enter') { self.acceptAC(); e.preventDefault(); return; }
        if (e.key === 'Escape') { self.hideAC(); e.preventDefault(); return; }
      }
      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (e.key === 'Tab') {
        e.preventDefault();
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        if (e.shiftKey) {
          if (v.substr(ls, 4) === '    ') { ta.value = v.slice(0, ls) + v.slice(ls + 4); ta.setSelectionRange(Math.max(ls, s - 4), Math.max(ls, en - 4)); }
        } else if (s !== en && v.slice(s, en).indexOf('\n') >= 0) {
          const block = v.slice(ls, en).replace(/^/gm, '    ');
          ta.value = v.slice(0, ls) + block + v.slice(en); ta.setSelectionRange(ls, ls + block.length);
        } else { ta.value = v.slice(0, s) + '    ' + v.slice(en); ta.setSelectionRange(s + 4, s + 4); }
        self.changed();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s);
        let ind = /^ */.exec(line)[0];
        if (/:\s*(#.*)?$/.test(line)) ind += '    ';
        ta.value = v.slice(0, s) + '\n' + ind + v.slice(en);
        ta.setSelectionRange(s + 1 + ind.length, s + 1 + ind.length);
        self.changed();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        const ls = v.lastIndexOf('\n', s - 1) + 1, le = v.indexOf('\n', en); const end = le < 0 ? v.length : le;
        const lines = v.slice(ls, end).split('\n');
        const allC = lines.every(function (l) { return /^\s*#/.test(l) || !l.trim(); });
        const out = lines.map(function (l) { return allC ? l.replace(/^(\s*)# ?/, '$1') : l.replace(/^(\s*)/, '$1# '); }).join('\n');
        ta.value = v.slice(0, ls) + out + v.slice(end); ta.setSelectionRange(ls, ls + out.length);
        self.changed();
      }
    });
  };

  TextEditor.prototype.buildRef = function () {
    const self = this, r = this.ref;
    r.appendChild(W.el('h3', { text: 'Cheat sheet' }));
    r.appendChild(W.el('pre', { class: 'tx-sample', text: 'when key_pressed "space":\n    jump(600)\n    play_sound("jump")\n\nwhen update:\n    if key_down("right"):\n        x += 5\n    elif key_down("left"):\n        x -= 5\n\nwhen collide "Coin":\n    score += 1\n    other.visible = false' }));
    r.appendChild(W.el('div', { class: 'tx-tip', text: 'Click anything below to insert it.' }));
    function insert(text) {
      const ta = self.ta, s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(ta.selectionEnd);
      ta.focus(); ta.setSelectionRange(s + text.length, s + text.length);
      self.changed();
    }
    const cats = {};
    A.ACTION_LIST.forEach(function (a) { (cats[a.cat] = cats[a.cat] || []).push({ code: a.fn + '(' + a.args.filter(function (x) { return !x.only3d; }).map(function (x) { return x.def; }).join(', ') + ')', doc: a.doc }); });
    const ev = Object.keys(A.EVENTS).map(function (k) { const e = A.EVENTS[k]; return { code: 'when ' + k + (e.param ? (e.param === 'num' ? ' 1' : ' "' + (e.def || '') + '"') : '') + ':', doc: e.label.replace('{p}', '…') }; });
    const sections = [['Events', ev], ['Control', [{ code: 'if cond:', doc: 'choice' }, { code: 'elif cond:', doc: 'another choice' }, { code: 'else:', doc: 'otherwise' }, { code: 'repeat 10:', doc: 'loop N times' }, { code: 'while cond:', doc: 'loop while true' }, { code: 'forever:', doc: 'loop forever' }].concat(cats.Control)]];
    Object.keys(cats).forEach(function (c) { if (c !== 'Control') sections.push([c, cats[c]]); });
    sections.push(['Values', A.REPORTER_LIST.map(function (x) { return { code: x.example, doc: x.doc }; })]);
    sections.push(['Properties', A.PROPERTIES.map(function (p) { return { code: p, doc: '' }; })]);
    sections.forEach(function (s) {
      const d = W.el('details', { class: 'tx-sec', open: s[0] === 'Events' ? true : null }, [W.el('summary', { text: s[0], style: { color: (A.CATEGORIES[s[0]] || A.CATEGORIES.Data).color } })]);
      s[1].forEach(function (it) { d.appendChild(W.el('div', { class: 'tx-item', title: it.doc, onclick: function () { insert(it.code); } }, [W.el('code', { text: it.code })])); });
      r.appendChild(d);
    });
  };

  A.TextEditor = TextEditor;
})(window);
