/* Alcazar IDE controller */
(function (G) {
  'use strict';
  const A = G.Alcazar, W = A.W, Host = A.Host;
  const $ = function (id) { return document.getElementById(id); };
  const el = W.el;

  const TYPE_ICON = { sprite: 'square', text: 'type', cube: 'cube', sphere: 'circle', plane: 'plane', cylinder: 'cylinder', cone: 'triangle', model: 'cube',
    terrain: 'mountain', scatter: 'tree', ragdoll: 'person', pine: 'tree', tree: 'tree', bush: 'tree', rock: 'circle', grass: 'tree' };

  const IDE = A.IDE = {
    project: null, path: null, sceneName: null, selectedId: null, dirty: false,
    tab: 'scene', mode: 'flow', undoStack: [], redoStack: [], play: null,

    // ------------------------------------------------------------------ boot
    init: function () {
      const self = this;
      A.applyIcons(document);
      // big model files are served by the desktop app from the project's models folder
      if (Host.native) A.fileBase = 'https://files.alcazar/';
      this.sceneView = new A.SceneView($('tabScene'), this);
      const api = {
        getScripts: function () { const d = self.selectedDef(); return d ? d.scripts : null; },
        commit: function () { self.commit('Edit script', { fromScript: true }); },
        ctx: this.ctx()
      };
      this.editors = {
        flow: new A.FlowEditor($('edFlow'), api),
        blocks: new A.BlockEditor($('edBlocks'), api),
        text: new A.TextEditor($('edText'), api)
      };
      this.bindUI();
      this.bindKeys();
      Host.on('requestSave', function () { self.save(); });
      Host.call('info').then(function (i) { self.hostInfo = i; if (i && i.openPath) self.openPath(i.openPath); }).catch(function () {});
      this.showStart();
      setInterval(function () { self.autosave(); }, 30000);
    },

    ctx: function () {
      const self = this;
      return {
        is3d: function () { const s = self.scene(); return !!s && s.mode === '3d'; },
        objects: function () { const s = self.scene(); return s ? uniq(s.objects.map(function (o) { return o.name; })) : []; },
        scenes: function () { return self.project ? self.project.scenes.map(function (s) { return s.name; }) : []; },
        sounds: function () { return self.assetNames('sound'); },
        images: function () { return self.assetNames('image'); },
        fonts: function () { return self.assetNames('font'); },
        messages: function () {
          const out = [];
          if (!self.project) return out;
          self.project.scenes.forEach(function (sc) {
            sc.objects.forEach(function (o) {
              (o.scripts || []).forEach(function (s) {
                if (s.event === 'message' && s.param) out.push(s.param);
                A.walk(s.body, function (st) { if (st.t === 'call' && st.fn === 'broadcast') out.push(A.prettyArg(st.args[0])); });
              });
            });
          });
          return uniq(out);
        },
        variables: function () {
          const out = (self.project ? self.project.globals : []).map(function (g) { return g.name; });
          const d = self.selectedDef();
          if (d) (d.scripts || []).forEach(function (s) { A.walk(s.body, function (st) { if (st.t === 'set' && st.target.indexOf('.') < 0 && A.PROPERTIES.indexOf(st.target) < 0) out.push(st.target); }); });
          return uniq(out);
        }
      };
    },
    assetNames: function (type) {
      const a = (this.project && this.project.assets) || {};
      return Object.keys(a).filter(function (k) { return a[k].type === type; });
    },

    // ------------------------------------------------------------------ project lifecycle
    showStart: function () {
      const self = this, box = $('start');
      box.innerHTML = '';
      box.style.display = 'flex';
      // templates grouped: blank projects, then 2D and 3D starters with a ready-to-move character
      const cards = el('div', { class: 'st-groups' });
      [['blank', 'Blank'], ['2d', '2D starters'], ['3d', '3D starters']].forEach(function (g) {
        const keys = Object.keys(A.SAMPLES).filter(function (k) { return (A.SAMPLES[k].group || 'blank') === g[0]; });
        if (!keys.length) return;
        const grid = el('div', { class: 'st-cards' });
        keys.forEach(function (k) {
          const s = A.SAMPLES[k];
          grid.appendChild(el('div', { class: 'st-card', onclick: function () { self.loadProject(s.make(), null); } }, [
            el('div', { class: 'st-tag ' + s.mode, text: s.mode.toUpperCase() }),
            el('b', { text: s.title }), el('p', { text: s.desc }),
            s.controls ? el('p', { class: 'st-controls', text: s.controls }) : null
          ]));
        });
        cards.appendChild(el('div', { class: 'st-group' }, [el('div', { class: 'st-group-title', text: g[1] }), grid]));
      });
      const recent = this.recent();
      const rec = el('div', { class: 'st-recent' }, [el('h3', { text: 'Recent' })]);
      if (!recent.length) rec.appendChild(el('p', { class: 'muted', text: 'Nothing yet.' }));
      recent.forEach(function (p) { rec.appendChild(el('div', { class: 'st-rec', title: p, text: p.split(/[\\/]/).pop(), onclick: function () { self.openPath(p); } })); });
      let auto = null;
      try { auto = localStorage.getItem('alz-autosave'); } catch (e) { /* storage unavailable */ }
      if (auto) rec.appendChild(el('button', { class: 'st-recover', text: 'Recover last unsaved work', onclick: function () { try { self.loadProject(JSON.parse(auto), null); self.markDirty(); } catch (e) { W.toast('Could not recover', 'err'); } } }));
      box.appendChild(el('div', { class: 'st-inner' }, [
        el('div', { class: 'st-head' }, [el('img', { src: 'img/logo.svg', class: 'st-logo' }), el('div', {}, [el('h1', { text: 'Alcazar' }), el('p', { text: 'Make 2D and 3D games by drawing how they work.' })])]),
        el('div', { class: 'st-cols' }, [
          el('div', { class: 'st-new' }, [el('h3', { text: 'Start something new' }), cards]),
          el('div', { class: 'st-side' }, [el('button', { class: 'primary big', text: 'Open a project…', onclick: function () { self.open(); } }), rec])
        ])
      ]));
    },
    recent: function () { try { return JSON.parse(localStorage.getItem('alz-recent') || '[]'); } catch (e) { return []; } },
    addRecent: function (p) {
      if (!p) return;
      try { const r = this.recent().filter(function (x) { return x !== p; }); r.unshift(p); localStorage.setItem('alz-recent', JSON.stringify(r.slice(0, 8))); } catch (e) { /* ignore */ }
    },
    autosave: function () {
      if (!this.project || !this.dirty) return;
      try { localStorage.setItem('alz-autosave', JSON.stringify(this.project)); } catch (e) { /* quota: skip */ }
    },
    loadProject: function (p, path) {
      this.stopGame();
      p = migrate(p);
      this.project = p; this.path = path;
      if (!path) Host.call('newProject').catch(function () {});
      this.sceneName = p.startScene || p.scenes[0].name;
      this.selectedId = null;
      this.undoStack = []; this.redoStack = [];
      this.snapshot = this.serialize();
      this.dirty = false;
      $('start').style.display = 'none';
      const first = this.scene().objects.find(function (o) { return o.scripts && o.scripts.length; });
      this.selectedId = first ? first.id : null;
      this.refreshAll();
      this.setTab('scene');
      this.updateTitle();
      this.addRecent(path);
    },
    openPath: function (path) {
      const self = this;
      Host.call('readFile', { path: path }).then(function (r) {
        try { self.loadProject(JSON.parse(r.text), path); } catch (e) { W.toast('That file is not an Alcazar project', 'err'); }
      }).catch(function (e) { W.toast('Could not open: ' + e.message, 'err'); });
    },
    open: function () {
      const self = this;
      if (!this.confirmDiscard()) return;
      Host.call('openProject').then(function (r) {
        if (!r) return;
        try { self.loadProject(JSON.parse(r.text), r.path); } catch (e) { W.toast('That file is not an Alcazar project', 'err'); }
      }).catch(function (e) { W.toast(e.message, 'err'); });
    },
    save: function (saveAs) {
      const self = this;
      if (!this.project) return Promise.resolve();
      if (this.editors.text.hasError() && this.mode === 'text') W.toast('Note: your text code has an error — the last working version was saved.', 'warn');
      return Host.call('saveProject', { path: saveAs ? null : this.path, text: JSON.stringify(this.project, null, 1), suggestedName: this.project.name }).then(function (r) {
        if (!r) return;
        self.path = r.path; self.dirty = false; self.addRecent(r.path); self.updateTitle();
        try { localStorage.removeItem('alz-autosave'); } catch (e) { /* ignore */ }
        W.toast('Saved');
      }).catch(function (e) { W.toast('Save failed: ' + e.message, 'err'); });
    },
    confirmDiscard: function () { return !this.dirty || confirm('You have unsaved changes. Throw them away?'); },
    updateTitle: function () {
      const t = (this.project ? this.project.name : 'Alcazar') + (this.dirty ? ' •' : '') + ' — Alcazar';
      Host.call('setTitle', { title: t });
      Host.call('setDirty', { dirty: this.dirty });
      $('projName').textContent = this.project ? this.project.name + (this.dirty ? ' •' : '') : '';
    },

    // ------------------------------------------------------------------ model helpers
    scene: function () {
      if (!this.project) return null;
      const n = this.sceneName;
      return this.project.scenes.find(function (s) { return s.name === n; }) || this.project.scenes[0];
    },
    selectedDef: function () {
      const s = this.scene(), id = this.selectedId;
      return s && id ? s.objects.find(function (o) { return o.id === id; }) || null : null;
    },
    select: function (id) {
      if (this.selectedId === id) return;
      if (!this.leaveTextOk()) return;
      this.selectedId = id;
      this.sceneView.refresh();
      this.renderTree(); this.renderInspector();
      if (this.tab === 'script') this.renderScript();
      this.updateScriptHeader();
    },
    leaveTextOk: function () {
      if (this.tab === 'script' && this.mode === 'text' && this.editors.text.hasError()) {
        return confirm('Your text code has an error, so the last change wasn\'t applied. Leave anyway?');
      }
      return true;
    },
    serialize: function () {
      const p = this.project;
      return JSON.stringify(Object.assign({}, p, { assets: undefined }));
    },
    markDirty: function () { if (!this.dirty) { this.dirty = true; this.updateTitle(); } },
    commit: function (label, opts) {
      opts = opts || {};
      const snap = this.serialize();
      if (snap === this.snapshot) return;
      this.undoStack.push(this.snapshot);
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack = [];
      this.snapshot = snap;
      this.markDirty();
      this.sceneView.rebuild();
      this.renderTree();
      if (!opts.fromInspector && !opts.fromScript) this.renderInspector();
      if (opts.fromScript && this.mode !== 'text') this.renderScriptSoft();
      this.updateScriptHeader();
    },
    restore: function (snap) {
      const assets = this.project.assets;
      this.project = JSON.parse(snap);
      this.project.assets = assets;
      this.snapshot = snap;
      if (!this.project.scenes.find((s) => s.name === this.sceneName)) this.sceneName = this.project.scenes[0].name;
      this.markDirty();
      this.refreshAll();
    },
    undo: function () { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot); this.restore(this.undoStack.pop()); W.toast('Undo'); },
    redo: function () { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot); this.restore(this.redoStack.pop()); W.toast('Redo'); },
    refreshAll: function () {
      this.renderScenes(); this.renderTree(); this.renderVars(); this.renderAssets(); this.renderInspector();
      this.sceneView.rebuild();
      this.renderScript();
      this.updateScriptHeader();
    },
    uniqueName: function (base) {
      const names = this.scene().objects.map(function (o) { return o.name; });
      if (names.indexOf(base) < 0) return base;
      let i = 2; while (names.indexOf(base + ' ' + i) >= 0) i++;
      return base + ' ' + i;
    },

    // ------------------------------------------------------------------ scenes panel
    renderScenes: function () {
      const self = this, box = $('scenes'), p = this.project;
      box.innerHTML = '';
      p.scenes.forEach(function (s) {
        const row = el('div', { class: 'sc-row' + (s.name === self.sceneName ? ' on' : ''), onclick: function () { if (self.leaveTextOk()) { self.sceneName = s.name; self.selectedId = null; self.refreshAll(); } } }, [
          el('span', { class: 'sc-mode ' + s.mode, text: s.mode.toUpperCase() }),
          el('span', { class: 'sc-name', text: s.name }),
          p.startScene === s.name ? el('span', { class: 'sc-start', title: 'The game starts in this scene', html: A.icon('flag', 12) }) : null
        ]);
        row.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          W.menu(e.clientX, e.clientY, [
            { label: 'Rename…', icon: 'edit', onClick: function () { const n = prompt('Scene name', s.name); if (n && n.trim() && !p.scenes.some(function (x) { return x.name === n.trim(); })) { if (p.startScene === s.name) p.startScene = n.trim(); if (self.sceneName === s.name) self.sceneName = n.trim(); s.name = n.trim(); self.renderScenes(); self.commit('Rename scene'); } } },
            { label: 'Start the game here', icon: 'flag', onClick: function () { p.startScene = s.name; self.renderScenes(); self.commit('Start scene'); } },
            { label: 'Duplicate', icon: 'copy', onClick: function () { const c = JSON.parse(JSON.stringify(s)); c.name = s.name + ' copy'; c.objects.forEach(function (o) { o.id = A.uid(); }); p.scenes.push(c); self.renderScenes(); self.commit('Duplicate scene'); } },
            { label: 'Delete', icon: 'trash', disabled: p.scenes.length < 2, onClick: function () { if (!confirm('Delete scene "' + s.name + '"?')) return; p.scenes.splice(p.scenes.indexOf(s), 1); if (p.startScene === s.name) p.startScene = p.scenes[0].name; self.sceneName = p.scenes[0].name; self.selectedId = null; self.commit('Delete scene'); self.refreshAll(); } }
          ]);
        });
        box.appendChild(row);
      });
    },
    addScene: function (mode) {
      const p = this.project;
      let n = 'Level ' + (p.scenes.length + 1);
      while (p.scenes.some(function (s) { return s.name === n; })) n += '+';
      const sc = mode === '3d'
        ? { name: n, mode: '3d', bg: '#8fc6ff', gravity: 25, camera: { ex: 0, ey: 6, ez: 12, tx: 0, ty: 0, tz: 0, fov: 60 }, objects: [A.makeObject({ name: 'Floor', type: 'plane', sx: 30, sz: 30, color: '#6cbf6a', body: 'solid' })] }
        : { name: n, mode: '2d', bg: '#1f2a3d', gravity: 1400, camera: { x: 0, y: 0, zoom: 1 }, objects: [] };
      p.scenes.push(sc);
      this.sceneName = n; this.selectedId = null;
      this.commit('Add scene');
      this.refreshAll();
    },

    // ------------------------------------------------------------------ object tree
    renderTree: function () {
      const self = this, box = $('tree'), sc = this.scene();
      box.innerHTML = '';
      if (!sc) return;
      if (!sc.objects.length) box.appendChild(el('div', { class: 'muted pad', text: 'No objects yet. Click "+ Add".' }));
      sc.objects.forEach(function (o, i) {
        const row = el('div', { class: 'tr-row' + (o.id === self.selectedId ? ' on' : '') + (o.template ? ' tmpl' : ''), draggable: 'true' }, [
          el('span', { class: 'tr-ic', style: { color: o.type === 'text' ? '#ddd' : o.color }, html: A.icon(TYPE_ICON[o.type] || 'square', 14) }),
          el('span', { class: 'tr-name', text: o.name }),
          o.scripts && o.scripts.length ? el('span', { class: 'tr-badge', title: o.scripts.length + ' script(s)', text: String(o.scripts.length) }) : null,
          el('span', { class: 'tr-eye' + (o.visible ? '' : ' off'), title: 'Visible at start', html: A.icon(o.visible ? 'eye' : 'eyeOff', 14), onclick: function (e) { e.stopPropagation(); o.visible = !o.visible; self.commit('Toggle visible'); } })
        ]);
        row.addEventListener('click', function () { self.select(o.id); });
        row.addEventListener('dblclick', function () { self.select(o.id); self.setTab('script'); });
        row.addEventListener('contextmenu', function (e) { e.preventDefault(); self.select(o.id); self.objectMenu(e.clientX, e.clientY, o); });
        row.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/alz-obj', String(i)); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('dropover'); });
        row.addEventListener('dragleave', function () { row.classList.remove('dropover'); });
        row.addEventListener('drop', function (e) {
          e.preventDefault(); row.classList.remove('dropover');
          const from = +e.dataTransfer.getData('text/alz-obj');
          if (isNaN(from) || from === i) return;
          const item = sc.objects.splice(from, 1)[0];
          sc.objects.splice(i, 0, item);
          self.commit('Reorder');
        });
        box.appendChild(row);
      });
    },
    objectMenu: function (x, y, o) {
      const self = this;
      W.menu(x, y, [
        { label: 'Edit scripts', icon: 'code', onClick: function () { self.setTab('script'); } },
        { label: 'Rename…', icon: 'edit', onClick: function () { const n = prompt('Name', o.name); if (n && n.trim()) { o.name = n.trim(); self.commit('Rename'); } } },
        { label: 'Duplicate', icon: 'copy', hint: 'Ctrl+D', onClick: function () { self.duplicate(); } },
        { label: 'Delete', icon: 'trash', hint: 'Del', onClick: function () { self.deleteSelected(); } }
      ]);
    },
    addMenu: function (x, y) {
      const self = this, d3 = this.scene().mode === '3d';
      const make = function (props) {
        return function () {
          const o = A.makeObject(props);
          o.name = self.uniqueName(props.name);
          if (!props.ui && !d3) { const c = self.sceneView.world ? self.sceneView.world.editCam2 : { x: 0, y: 0 }; o.x = Math.round(c.x / 10) * 10; o.y = Math.round(c.y / 10) * 10; }
          self.scene().objects.push(o);
          self.selectedId = o.id;
          self.commit('Add ' + o.name);
          self.renderInspector();
          if (self.tab === 'script') self.renderScript();
        };
      };
      const items = d3 ? [
        { header: 'Open world' },
        { label: 'Terrain (island)', icon: 'mountain', onClick: function () { self.addNature('terrain'); } },
        { label: 'Water (sea)', icon: 'plane', onClick: make({ name: 'Sea', type: 'plane', sx: 3000, sz: 3000, color: '#1d6f8f', water: true, castShadow: false, pickable: false }) },
        { label: 'Forest (pines)', icon: 'tree', onClick: function () { self.addNature('pine'); } },
        { label: 'Trees', icon: 'tree', onClick: function () { self.addNature('tree'); } },
        { label: 'Rocks', icon: 'circle', onClick: function () { self.addNature('rock'); } },
        { label: 'Grass', icon: 'tree', onClick: function () { self.addNature('grass'); } },
        { label: 'Turn on sky and sun', icon: 'globe', onClick: function () { const s = self.scene(); s.sky = true; if (s.timeOfDay == null) s.timeOfDay = 16.5; self.commit('Sky on'); self.renderInspector(); } },
        { header: '3D shapes' },
        { label: 'Cube', icon: 'cube', onClick: make({ name: 'Cube', type: 'cube', y: 0.5, color: '#9775ea' }) },
        { label: 'Ball', icon: 'circle', onClick: make({ name: 'Ball', type: 'sphere', y: 0.5, color: '#ff6f61' }) },
        { label: 'Cylinder', icon: 'cylinder', onClick: make({ name: 'Cylinder', type: 'cylinder', y: 0.5, color: '#3dd6e0' }) },
        { label: 'Cone', icon: 'triangle', onClick: make({ name: 'Cone', type: 'cone', y: 0.5, color: '#ffd84d' }) },
        { label: 'Floor (plane)', icon: 'plane', onClick: make({ name: 'Floor', type: 'plane', sx: 10, sz: 10, color: '#6cbf6a', body: 'solid' }) },
        { header: 'Ready-made' },
        { label: 'Ragdoll character', icon: 'person', onClick: make({ name: 'Ragdoll', type: 'ragdoll', y: 1, body: 'dynamic', color: '#ffffff', shirt: '#e04a3a', pants: '#2f3f6b', skin: '#f1c27d' }) },
        { label: 'Player ball (physics)', icon: 'person', onClick: make({ name: 'Player', type: 'sphere', y: 2, color: '#9775ea', body: 'dynamic' }) },
        { label: 'Wall (solid)', icon: 'square', onClick: make({ name: 'Wall', type: 'cube', y: 1, sx: 4, sy: 2, sz: 0.5, color: '#8a6d4d', body: 'solid' }) },
        { header: 'Imported models' }
      ].concat(this.assetNames('model').length ? this.assetNames('model').map(function (n) {
        // big imported files are almost always maps: keep their real size and make them walkable
        const big = !!self.project.assets[n].file;
        return { label: n + (big ? '  (map)' : ''), icon: 'cube', onClick: make({ name: n.replace(/[^\w ]/g, ' ').trim() || 'Model', type: 'model', model: n, y: big ? 0 : 0.5, color: '#ffffff', realSize: big, meshCollision: big }) };
      }) : [{ label: 'Import .glb / .obj in Assets first', icon: 'cube', disabled: true, onClick: function () {} }]).concat([
        { header: 'Screen' },
        { label: 'Text on screen (UI)', icon: 'type', onClick: make({ name: 'Label', type: 'text', ui: true, text: 'Score: {score}', color: '#ffffff' }) }
      ]) : [
        { header: 'Shapes' },
        { label: 'Square', icon: 'square', onClick: make({ name: 'Square', color: '#4c7dff' }) },
        { label: 'Circle', icon: 'circle', onClick: make({ name: 'Circle', shape: 'circle', color: '#ff6f61' }) },
        { label: 'Triangle', icon: 'triangle', onClick: make({ name: 'Triangle', shape: 'triangle', color: '#ffd84d' }) },
        { label: 'Star', icon: 'star', onClick: make({ name: 'Star', shape: 'star', color: '#ffd84d' }) },
        { header: 'Ready-made' },
        { label: 'Player (physics + face)', icon: 'person', onClick: make({ name: 'Player', w: 44, h: 56, shape: 'rounded', eyes: true, color: '#9775ea', body: 'dynamic' }) },
        { label: 'Platform (solid)', icon: 'platform', onClick: make({ name: 'Platform', w: 240, h: 28, shape: 'rounded', color: '#56606e', body: 'solid' }) },
        { label: 'Picture (sprite)', icon: 'image', onClick: make({ name: 'Sprite', w: 64, h: 64, color: '#ffffff', image: this.assetNames('image')[0] || '' }) },
        { header: 'Text' },
        { label: 'Text in the world', icon: 'type', onClick: make({ name: 'Text', type: 'text', text: 'Hello!', color: '#ffffff' }) },
        { label: 'Text on screen (UI)', icon: 'type', onClick: make({ name: 'Label', type: 'text', ui: true, x: -360, y: 230, text: 'Score: {score}', color: '#ffffff', fontSize: 26 }) }
      ];
      W.menu(x, y, items);
    },
    // terrain / scattered nature presets; the scene's sky is switched on with them
    addNature: function (kind) {
      const sc = this.scene(), objs = sc.objects;
      let o;
      if (kind === 'terrain') o = A.makeObject({ name: this.uniqueName('Island'), type: 'terrain', sx: 500, sy: 70, sz: 500, tseed: Math.floor(Math.random() * 1000), tres: 200, color: '#ffffff', pickable: true });
      else {
        const presets = {
          pine: { name: 'Pine forest', smesh: 'pine', scount: 1200, ssize: 9, sclump: 0.45, shmin: 1.5, shmax: 34, sslope: 0.4, body: 'solid' },
          tree: { name: 'Trees', smesh: 'tree', scount: 400, ssize: 7, sclump: 0.3, shmin: 1.2, shmax: 22, sslope: 0.35, body: 'solid' },
          rock: { name: 'Rocks', smesh: 'rock', scount: 350, ssize: 2.2, svar: 0.6, shmin: -2, shmax: 60, sslope: 0.8, body: 'solid' },
          grass: { name: 'Grass', smesh: 'grass', scount: 6000, ssize: 1.1, svar: 0.4, shmin: 1, shmax: 26, sslope: 0.32, castShadow: false }
        };
        const terr = objs.find(function (x) { return x.type === 'terrain'; });
        const area = terr ? [Math.abs(terr.sx), Math.abs(terr.sz), terr.x, terr.z] : [100, 100, 0, 0];
        const p = presets[kind];
        o = A.makeObject(Object.assign({ type: 'scatter', sx: area[0], sy: 1, sz: area[1], x: area[2], z: area[3], color: '#ffffff', sseed: Math.floor(Math.random() * 1000), pickable: false }, p, { name: this.uniqueName(p.name) }));
      }
      if (!sc.sky) { sc.sky = true; if (sc.timeOfDay == null) sc.timeOfDay = 16.5; }
      objs.push(o);
      this.selectedId = o.id;
      this.commit('Add ' + o.name);
      this.renderInspector();
      if (kind === 'terrain' && this.sceneView.world) { const c = this.sceneView.world.editCam3; c.dist = 260; c.pitch = 38; c.target = [0, 0, 0]; }
    },
    duplicate: function () {
      const d = this.selectedDef(); if (!d) return;
      const c = JSON.parse(JSON.stringify(d));
      c.id = A.uid();
      (c.scripts || []).forEach(function (s) { s.id = A.uid(); A.walk(s.body, function (st) { st.id = A.uid(); }); });
      if (this.scene().mode === '3d') c.x += 1; else { c.x += 20; c.y -= 20; }
      const objs = this.scene().objects;
      objs.splice(objs.indexOf(d) + 1, 0, c);
      this.selectedId = c.id;
      this.commit('Duplicate'); this.renderInspector();
    },
    deleteSelected: function () {
      const d = this.selectedDef(); if (!d) return;
      const objs = this.scene().objects;
      objs.splice(objs.indexOf(d), 1);
      this.selectedId = null;
      this.commit('Delete ' + d.name);
      this.renderInspector();
      if (this.tab === 'script') this.renderScript();
    },

    // ------------------------------------------------------------------ variables + assets
    renderVars: function () {
      const self = this, box = $('vars'), g = this.project.globals;
      box.innerHTML = '';
      if (!g.length) box.appendChild(el('div', { class: 'muted pad', text: 'Shared values like score or lives.' }));
      g.forEach(function (v, i) {
        const name = el('input', { class: 'v-name', value: v.name, spellcheck: 'false' });
        const val = el('input', { class: 'v-val', value: String(v.value), title: 'Starting value' });
        name.addEventListener('change', function () { const n = name.value.trim(); if (/^[A-Za-z_]\w*$/.test(n)) { v.name = n; self.commit('Rename variable'); } else { name.value = v.name; W.toast('Names use letters, numbers and _', 'warn'); } });
        val.addEventListener('change', function () { v.value = A.parseInitial(val.value); self.commit('Variable value'); });
        box.appendChild(el('div', { class: 'v-row' }, [name, el('span', { text: '=' }), val, el('button', { class: 'x', html: A.icon('x', 13), title: 'Delete', onclick: function () { g.splice(i, 1); self.commit('Delete variable'); self.renderVars(); } })]));
      });
    },
    addVar: function () {
      const g = this.project.globals;
      let n = 'score', i = 2;
      while (g.some(function (v) { return v.name === n; })) n = (g.length < 2 ? 'lives' : 'value' + i++);
      g.push({ name: n, value: n === 'lives' ? 3 : 0 });
      this.commit('Add variable'); this.renderVars();
    },
    renderAssets: function () {
      const self = this, box = $('assets'), a = this.project.assets || (this.project.assets = {});
      box.innerHTML = '';
      const keys = Object.keys(a);
      if (!keys.length) box.appendChild(el('div', { class: 'muted pad', text: 'Import pictures and sounds to use them.' }));
      keys.forEach(function (k) {
        const it = a[k];
        const row = el('div', { class: 'as-row', title: it.type === 'image' ? 'Click to use on the selected sprite' : 'Click to listen' }, [
          it.type === 'image' ? el('img', { src: it.data }) : it.type === 'font' ? el('span', { class: 'as-snd as-font', text: 'Aa', style: { fontFamily: '"' + k + '"' } }) : it.type === 'model' ? el('span', { class: 'as-snd', html: A.icon('cube', 14) }) : el('span', { class: 'as-snd', html: A.icon('music', 14) }),
          el('span', { class: 'as-name', text: k }),
          el('button', { class: 'x', html: A.icon('x', 13), onclick: function (e) { e.stopPropagation(); if (confirm('Remove "' + k + '"?')) { delete a[k]; self.markDirty(); self.renderAssets(); } } })
        ]);
        row.addEventListener('click', function () {
          if (it.type === 'sound') { A.Audio.ensure(); A.Audio.buffers[k] = null; A.Audio.load(k, it.data); setTimeout(function () { A.Audio.play(k); }, 150); return; }
          const d = self.selectedDef();
          if (it.type === 'font') {
            if (d && d.type === 'text') { d.font = k; self.commit('Set font'); self.renderInspector(); }
            else W.toast('Select a text object, then click a font to use it');
            return;
          }
          if (d && d.type === 'sprite') { d.image = k; self.commit('Set image'); self.renderInspector(); }
        });
        box.appendChild(row);
      });
    },
    importAssets: function () {
      const self = this;
      W.menu($('bImport').getBoundingClientRect().left, $('bImport').getBoundingClientRect().bottom, [
        { label: 'Pictures (png, jpg, gif, webp)', icon: 'image', onClick: function () { go('image'); } },
        { label: 'Sounds (wav, mp3, ogg)', icon: 'music', onClick: function () { go('sound'); } },
        { label: 'Fonts (ttf, otf, woff)', icon: 'type', onClick: function () { go('font'); } },
        { label: '3D models (glb, gltf, obj)', icon: 'cube', onClick: function () { go('model'); } }
      ]);
      function go(kind) {
        Host.call('importAssets', { kind: kind }).then(function (files) {
          if (!files || !files.length) return;
          const a = self.project.assets;
          files.forEach(function (f) {
            let n = f.name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]/g, '_');
            let i = 2; const base = n; while (a[n]) n = base + i++;
            a[n] = f.file ? { type: kind, file: f.file, size: f.size } : { type: kind, data: f.dataUrl };
          });
          A.loadFonts(self.project);
          self.markDirty(); self.renderAssets(); self.renderInspector(); self.sceneView.rebuild();
          W.toast('Imported ' + files.length + ' file(s)');
        }).catch(function (e) { W.toast(e.message, 'err'); });
      }
    },

    // ------------------------------------------------------------------ inspector
    renderInspector: function () {
      const self = this, box = $('inspector');
      box.innerHTML = '';
      if (!this.project) return;
      const d = this.selectedDef();
      if (d) this.objectInspector(box, d); else this.sceneInspector(box);
    },
    // helpers produce rows bound to obj[key]
    insp: function (obj, opts) {
      const self = this;
      opts = opts || {};
      const live = function () { self.sceneView.rebuild(); };
      const done = function (label) { self.commit(label || 'Edit', { fromInspector: true }); if (opts.after) opts.after(); };
      return {
        num: function (label, key, step, title) {
          const inp = el('input', { type: 'number', step: step || 1, value: round(obj[key]), 'data-key': key });
          inp.addEventListener('input', function () { if (inp.value !== '' && !isNaN(+inp.value)) { obj[key] = +inp.value; live(); } });
          inp.addEventListener('change', function () { done('Change ' + label); });
          const lb = el('span', { class: 'i-lb scrub', text: label, title: (title ? title + ' — ' : '') + 'drag to change' });
          lb.addEventListener('mousedown', function (e) {
            e.preventDefault();
            const sx = e.clientX, v0 = +obj[key] || 0, st = +(step || 1);
            const mv = function (m) { obj[key] = round(v0 + Math.round((m.clientX - sx) / 3) * st); inp.value = obj[key]; live(); };
            const up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); done('Change ' + label); };
            document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
          });
          return el('label', { class: 'i-num' }, [lb, inp]);
        },
        text: function (label, key, title) {
          const inp = el('input', { type: 'text', value: obj[key] == null ? '' : obj[key], title: title || '' });
          inp.addEventListener('input', function () { obj[key] = inp.value; live(); });
          inp.addEventListener('change', function () { done('Change ' + label); });
          return el('label', { class: 'i-row' }, [el('span', { class: 'i-lb', text: label }), inp]);
        },
        color: function (label, key) {
          const c = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key]) ? obj[key] : '#ffffff' });
          const t = el('input', { type: 'text', value: obj[key], class: 'i-hex' });
          c.addEventListener('input', function () { obj[key] = c.value; t.value = c.value; live(); });
          c.addEventListener('change', function () { done('Colour'); });
          t.addEventListener('change', function () { obj[key] = t.value; if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; done('Colour'); });
          const sw = el('div', { class: 'i-swatches' });
          ['#9775ea', '#4c7dff', '#3dd6e0', '#3ccf5a', '#ffd84d', '#ff9a2e', '#ff4d4d', '#ff6fb5', '#ffffff', '#56606e', '#222222'].forEach(function (h) {
            sw.appendChild(el('span', { style: { background: h }, title: h, onclick: function () { obj[key] = h; c.value = h; t.value = h; done('Colour'); } }));
          });
          return el('div', {}, [el('label', { class: 'i-row' }, [el('span', { class: 'i-lb', text: label }), c, t]), sw]);
        },
        select: function (label, key, options, title) {
          const s = el('select', { title: title || '' });
          options.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1], selected: String(obj[key]) === String(o[0]) })); });
          s.addEventListener('change', function () { obj[key] = s.value; done('Change ' + label); self.renderInspector(); });
          return el('label', { class: 'i-row' }, [el('span', { class: 'i-lb', text: label }), s]);
        },
        check: function (label, key, title) {
          const c = el('input', { type: 'checkbox', checked: obj[key] ? true : null });
          c.addEventListener('change', function () { obj[key] = c.checked; done(label); });
          return el('label', { class: 'i-chk', title: title || '' }, [c, el('span', { text: label })]);
        }
      };
    },
    section: function (box, title, rows, open) {
      const d = el('details', { class: 'i-sec', open: open === false ? null : true }, [el('summary', { text: title })]);
      const body = el('div', { class: 'i-body' });
      rows.forEach(function (r) { if (r) body.appendChild(r); });
      d.appendChild(body);
      box.appendChild(d);
      return body;
    },
    objectInspector: function (box, d) {
      const self = this, f = this.insp(d), d3 = this.scene().mode === '3d', mesh = A.MESH_TYPES.indexOf(d.type) >= 0 || d.type === 'model';
      const isText = d.type === 'text';
      const head = el('div', { class: 'i-head' }, [
        el('span', { class: 'tr-ic big', style: { color: d.color }, html: A.icon(TYPE_ICON[d.type] || 'square', 20) }),
        (function () {
          const n = el('input', { class: 'i-title', value: d.name, spellcheck: 'false' });
          n.addEventListener('change', function () { if (n.value.trim()) { d.name = n.value.trim(); self.commit('Rename'); } });
          return n;
        })(),
        el('button', { class: 'i-scriptbtn', text: 'Edit scripts', onclick: function () { self.setTab('script'); } })
      ]);
      box.appendChild(head);
      const row3 = function (a, b, c) { return el('div', { class: 'i-trio' }, [a, b, c].filter(Boolean)); };
      if (d.type === 'terrain') {
        this.section(box, 'Island', [
          el('div', { class: 'f-hint', text: 'A procedural island. Change the seed for a new landscape.' }),
          row3(f.num('seed', 'tseed', 1), f.num('detail', 'tres', 16, 'Grid resolution (32-320). Higher = smoother, slower to build')),
          row3(f.num('width', 'sx', 10), f.num('depth', 'sz', 10)),
          row3(f.num('height', 'sy', 2, 'Tallest mountains'), f.num('feature size', 'tfeature', 0.1, 'Bigger = broader hills and wider valleys')),
          f.num('roughness', 'trough', 0.1, 'Small bumps on the hills'),
          f.check('Island shape (sea around the edge)', 'tisland')
        ]);
        this.section(box, 'Position', [row3(f.num('x', 'x', 1), f.num('y', 'y', 0.5, 'Sea level is y = 0'), f.num('z', 'z', 1))]);
        return;
      }
      if (d.type === 'ragdoll') {
        this.section(box, 'Position', [row3(f.num('x', 'x', 0.5), f.num('y', 'y', 0.5), f.num('z', 'z', 0.5)), f.num('facing', 'ry', 15, 'Which way it faces, in degrees')]);
        this.section(box, 'Ragdoll', [
          el('div', { class: 'f-hint', text: 'A floppy physics character. Move it with walk(), knock it over with knock_down() or flop().' }),
          f.num('size', 'sy', 0.1, '1 = about 1.9 m tall'),
          f.color('shirt', 'shirt'), f.color('trousers', 'pants'), f.color('skin', 'skin'),
          f.text('hat colour', 'hat', 'Leave empty for no hat, or type a colour like #ffffff'),
          f.check('Trip when running into walls', 'stumble')
        ]);
        this.section(box, 'Advanced', [f.text('tags', 'tags'), f.check('Template (hidden until spawned)', 'template'), f.check('Visible at start', 'visible')], false);
        return;
      }
      if (d.type === 'scatter') {
        const meshSel = f.select('kind', 'smesh', A.NATURE_MESHES.concat(['cube', 'sphere', 'cone', 'cylinder']).map(function (m) { return [m, m]; }));
        this.section(box, 'Scatter', [
          el('div', { class: 'f-hint', text: 'Spreads many copies over the terrain. Fast even with thousands.' }),
          meshSel,
          row3(f.num('count', 'scount', 50), f.num('seed', 'sseed', 1)),
          row3(f.num('size', 'ssize', 0.5), f.num('variety', 'svar', 0.05, '0 = all the same size')),
          row3(f.num('lowest', 'shmin', 0.5, 'Only place above this height'), f.num('highest', 'shmax', 1, 'Only place below this height')),
          row3(f.num('max slope', 'sslope', 0.05, '0 = flat ground only, 1 = cliffs too'), f.num('clumping', 'sclump', 0.05, '0 = even spread, 0.6 = dense forests with clearings')),
          f.select('physics', 'body', [['none', 'None, walk through'], ['solid', 'Solid trunks and rocks']])
        ]);
        this.section(box, 'Area', [row3(f.num('x', 'x', 1), f.num('z', 'z', 1)), row3(f.num('width', 'sx', 10), f.num('depth', 'sz', 10))]);
        this.section(box, 'Looks', [f.color('tint', 'color'), f.num('wind', 'swind', 0.01, 'How much it sways (leave empty for the default)'), f.check('Cast shadows', 'castShadow')]);
        return;
      }
      if (d3 && !d.ui) {
        this.section(box, 'Position', [row3(f.num('x', 'x', 0.5), f.num('y', 'y', 0.5), f.num('z', 'z', 0.5))]);
        if (mesh) {
          this.section(box, 'Rotation (degrees)', [row3(f.num('x', 'rx', 5), f.num('y', 'ry', 5), f.num('z', 'rz', 5))]);
          this.section(box, 'Size', [row3(f.num('x', 'sx', 0.1), d.type === 'plane' ? null : f.num('y', 'sy', 0.1), f.num('z', 'sz', 0.1))]);
        }
      } else {
        this.section(box, d.ui ? 'Position on screen' : 'Position', [row3(f.num('x', 'x', 1), f.num('y', 'y', 1), f.num('rot', 'rz', 5, 'rotation in degrees'))]);
        if (!isText) this.section(box, 'Size', [row3(f.num('width', 'w', 1), f.num('height', 'h', 1)), row3(f.num('scale x', 'sx', 0.1), f.num('scale y', 'sy', 0.1))]);
      }
      const look = [];
      if (isText) {
        look.push(f.text('text', 'text', 'Put a variable in {curly brackets} to show it live, e.g. Score: {score}'));
        look.push(el('div', { class: 'f-hint', text: 'Tip: {score} shows a variable live.' }));
        const fonts = this.assetNames('font').map(function (n) { return [n, n + '  (imported)']; }).concat(A.FONTS.map(function (n) { return [n, n]; }));
        if (d.font && !fonts.some(function (x) { return x[0] === d.font; })) fonts.unshift([d.font, d.font + '  (missing)']);
        const fontRow = f.select('font', 'font', fonts);
        Array.prototype.forEach.call(fontRow.querySelectorAll('option'), function (op) { op.style.fontFamily = '"' + op.value + '"'; });
        fontRow.querySelector('select').style.fontFamily = '"' + (d.font || 'Segoe UI') + '"';
        look.push(fontRow);
        look.push(el('div', { class: 'i-trio' }, [f.check('Bold', 'bold'), f.check('Italic', 'italic')]));
        look.push(el('div', { class: 'f-hint', text: 'Import your own .ttf / .otf font in Assets to add it to this list.' }));
        look.push(f.num('font size', 'fontSize', 1));
        look.push(f.check('Stick to the screen (UI)', 'ui', 'UI stays put when the camera moves'));
      } else if (!mesh) {
        look.push(f.select('shape', 'shape', [['rect', 'Rectangle'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['triangle', 'Triangle'], ['star', 'Star']]));
        const imgs = [['', '(none — use shape)']].concat(this.assetNames('image').map(function (n) { return [n, n]; }));
        look.push(f.select('picture', 'image', imgs));
        look.push(f.check('Pixel art (sharp pixels)', 'pixelArt'));
        look.push(f.check('Cute face', 'eyes'));
        look.push(f.check('Stick to the screen (UI)', 'ui'));
      } else {
        // shape: built-in meshes plus every imported 3D model
        const shapeSel = el('select');
        A.MESH_TYPES.forEach(function (t) { shapeSel.appendChild(el('option', { value: t, text: t, selected: d.type === t })); });
        const models = this.assetNames('model');
        if (models.length) {
          const og = el('optgroup', { label: 'Imported models' });
          models.forEach(function (n) { og.appendChild(el('option', { value: 'model:' + n, text: n, selected: d.type === 'model' && d.model === n })); });
          shapeSel.appendChild(og);
        }
        if (d.type === 'model' && models.indexOf(d.model) < 0) shapeSel.appendChild(el('option', { value: 'model:' + d.model, text: d.model + ' (missing)', selected: true }));
        shapeSel.addEventListener('change', function () {
          const v = shapeSel.value;
          if (v.indexOf('model:') === 0) {
            if (d.type !== 'model') d.color = '#ffffff';
            d.type = 'model'; d.model = v.slice(6);
          } else d.type = v;
          self.commit('Change shape'); self.renderInspector();
        });
        look.push(el('label', { class: 'i-row' }, [el('span', { class: 'i-lb', text: 'shape' }), shapeSel]));
        if (d.type === 'model') {
          const md = A.Models.get(this.project, d.model);
          look.push(el('div', { class: 'f-hint', text: !md ? 'Model not found in Assets.' : md.status === 'error' ? 'Could not load: ' + md.error : md.status === 'loading' ? 'Loading model...' : md.triangles + ' triangles. Colour tints the model (white = original colours).' }));
          if (md && md.status === 'loading') setTimeout(function () { if (self.selectedId === d.id) self.renderInspector(); }, 400);
        } else if (!models.length) look.push(el('div', { class: 'f-hint', text: 'Import .glb, .gltf or .obj files in Assets to use your own 3D models.' }));
        look.push(f.check('Glow (ignore lighting)', 'glow'));
        if (d.type === 'model') {
          look.push(f.check('Keep real size (for maps and levels)', 'realSize', 'Use the size the model was made at instead of shrinking it to 1 unit'));
          look.push(f.check('Walkable level (mesh collision)', 'meshCollision', 'Characters walk on its floors and bump into its walls. Best for maps; can be slow to prepare for huge models'));
        }
        look.push(f.check('Cast shadow', 'castShadow'));
      }
      look.push(f.color('colour', 'color'));
      look.push(f.num('opacity', 'alpha', 0.05));
      if (!d3) look.push(f.num('layer', 'layer', 1, 'Higher layers draw on top'));
      look.push(f.check('Visible at start', 'visible'));
      this.section(box, 'Looks', look);
      if (!isText && !d.ui) {
        const phys = [f.select('physics', 'body', [['none', 'None — passes through things'], ['solid', 'Solid — a wall or floor that never moves'], ['dynamic', 'Dynamic — falls and bumps into solids']])];
        if (d.body === 'dynamic') {
          phys.push(f.num('gravity ×', 'gravity', 0.1, '1 = normal, 0 = floats'));
          phys.push(f.num('bounce', 'bounce', 0.1, '0 = no bounce, 1 = super bouncy'));
          phys.push(f.num('friction', 'friction', 0.1, 'Slows sliding on the ground'));
        } else if (d.body === 'solid') phys.push(f.num('bounce', 'bounce', 0.1));
        this.section(box, 'Physics', phys);
      }
      this.section(box, 'Advanced', [
        f.text('tags', 'tags', 'Group objects, e.g. "enemy". Events and touching() match names or tags.'),
        f.check('Template (hidden until spawned)', 'template', 'Template objects only appear when a spawn or shoot step creates copies of them.'),
        f.check('Can be aimed at and clicked', 'pickable', 'Turn off for bullets, effects and decorations so they never block the crosshair.'),
        el('div', { class: 'i-btns' }, [
          el('button', { text: 'Duplicate', onclick: function () { self.duplicate(); } }),
          el('button', { class: 'danger', text: 'Delete', onclick: function () { self.deleteSelected(); } })
        ])
      ], false);
    },
    sceneInspector: function (box) {
      const self = this, sc = this.scene(), p = this.project, f = this.insp(sc), d3 = sc.mode === '3d';
      sc.camera = sc.camera || {};
      const fc = this.insp(sc.camera);
      box.appendChild(el('div', { class: 'i-head' }, [el('span', { class: 'tr-ic big', html: A.icon('scene', 20) }), el('b', { class: 'i-title-static', text: 'Scene: ' + sc.name })]));
      box.appendChild(el('p', { class: 'muted pad', text: 'Nothing selected — these are the settings for the whole scene.' }));
      this.section(box, 'Scene', [
        f.color('background', 'bg'),
        f.num('gravity', 'gravity', d3 ? 1 : 50, d3 ? 'About 25 feels like Earth' : 'About 1400 feels good for platformers'),
        d3 && !sc.sky ? f.num('light amount', 'ambient', 0.05, 'Brightness of shadows (0-1)') : null
      ]);
      if (d3) {
        if (sc.sky) { // show the real defaults instead of blank fields
          if (sc.timeOfDay == null) sc.timeOfDay = 16.5;
          if (sc.clouds == null) sc.clouds = 0.45;
          if (sc.fogDensity == null) sc.fogDensity = 0.0035;
          if (sc.shadowSize == null) sc.shadowSize = 60;
        }
        this.section(box, 'Sky and atmosphere', [
          f.check('Sky with sun, clouds and fog', 'sky', 'Realistic outdoor lighting. Best for open worlds.'),
          sc.sky ? f.num('time of day', 'timeOfDay', 0.25, 'Hours, 0-24. Try 7 (sunrise), 13 (midday), 18.5 (sunset), 22 (night)') : null,
          sc.sky ? f.num('clouds', 'clouds', 0.05, '0 = clear sky, 1 = overcast') : null,
          sc.sky ? f.num('fog', 'fogDensity', 0.0005, 'How quickly distant things fade. 0.003 is a light haze') : null,
          sc.sky ? f.num('shadow range', 'shadowSize', 5, 'How far around the camera shadows reach (bigger = softer)') : null
        ]);
      }
      if (d3) {
        this.section(box, 'Camera', [
          el('div', { class: 'f-hint', text: 'Tip: in the Scene view, move your view then click "Set game camera to this view".' }),
          el('div', { class: 'i-trio' }, [fc.num('eye x', 'ex', 0.5), fc.num('eye y', 'ey', 0.5), fc.num('eye z', 'ez', 0.5)]),
          el('div', { class: 'i-trio' }, [fc.num('look x', 'tx', 0.5), fc.num('look y', 'ty', 0.5), fc.num('look z', 'tz', 0.5)]),
          fc.num('field of view', 'fov', 1)
        ]);
      } else {
        this.section(box, 'Camera', [el('div', { class: 'i-trio' }, [fc.num('x', 'x', 10), fc.num('y', 'y', 10), fc.num('zoom', 'zoom', 0.1)])]);
      }
      const fp = this.insp(p, { after: function () { self.updateTitle(); } });
      this.section(box, 'Game', [
        fp.text('game name', 'name'),
        el('div', { class: 'i-trio' }, [fp.num('width', 'width', 10, 'Design width in pixels'), fp.num('height', 'height', 10, 'Design height in pixels')]),
        fp.select('starts in', 'startScene', p.scenes.map(function (s) { return [s.name, s.name]; }))
      ]);
    },
    liveInspector: function () {
      const d = this.selectedDef(); if (!d) return;
      const inputs = $('inspector').querySelectorAll('input[data-key]');
      for (let i = 0; i < inputs.length; i++) { const k = inputs[i].getAttribute('data-key'); if (document.activeElement !== inputs[i]) inputs[i].value = round(d[k]); }
    },

    // ------------------------------------------------------------------ tabs + script editors
    setTab: function (t) {
      if (t !== this.tab && !this.leaveTextOk()) return;
      this.tab = t;
      document.querySelectorAll('#tabs [data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
      ['scene', 'script', 'game'].forEach(function (k) { $('tab' + k[0].toUpperCase() + k.slice(1)).style.display = k === t ? '' : 'none'; });
      $('scriptModes').style.visibility = t === 'script' ? 'visible' : 'hidden';
      if (t === 'script') this.renderScript();
      if (t === 'scene') this.sceneView.refresh();
      if (t === 'game' && this.play) this.play.world.resize();
      this.updateScriptHeader();
    },
    setMode: function (m) {
      if (m === this.mode) return;
      if (this.mode === 'text' && this.editors.text.hasError() && !confirm('Your text has an error, so the last change wasn\'t applied. Switch anyway?')) return;
      this.mode = m;
      try { localStorage.setItem('alz-mode', m); } catch (e) { /* ignore */ }
      document.querySelectorAll('#scriptModes [data-mode]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); });
      this.renderScript();
    },
    renderScript: function () {
      const m = this.mode;
      ['flow', 'blocks', 'text'].forEach(function (k) { $('ed' + k[0].toUpperCase() + k.slice(1)).style.display = k === m ? '' : 'none'; });
      if (this.tab !== 'script') return;
      this.editors[m].render();
      if (m === 'flow' && !this.flowFitted) { this.flowFitted = true; }
    },
    renderScriptSoft: function () { /* editors re-render themselves after their own edits */ },
    updateScriptHeader: function () {
      const d = this.selectedDef();
      $('scriptFor').textContent = this.tab === 'script' ? (d ? 'Scripts for ' + d.name : 'No object selected') : '';
    },

    // ------------------------------------------------------------------ play
    startGame: function () {
      const self = this;
      if (!this.project) return;
      if (this.mode === 'text' && this.tab === 'script' && !this.editors.text.apply()) { W.toast('Fix the error in your code first', 'err'); return; }
      this.stopGame(true);
      this.clearConsole();
      const prevTab = this.tab;
      this.setTab('game');
      this.returnTab = prevTab === 'game' ? 'scene' : prevTab;
      const stage = $('gameStage');
      $('gameIdle').style.display = 'none';
      A.Audio.ensure();
      let world;
      try {
        world = new A.World(JSON.parse(JSON.stringify(this.project)), {
          container: stage, sceneName: this.sceneName,
          onLog: function (msg, kind, who) { self.log(msg, kind, who); },
          onSceneChange: function (n) { self.log('Scene → ' + n, 'info'); }
        });
      } catch (e) { this.log('Could not start: ' + e.message, 'error'); return; }
      world.start();
      this.play = { world: world };
      document.body.classList.add('playing');
      stage.focus();
      this.log('Playing "' + this.sceneName + '". Click the game, then use the keyboard. Esc stops.', 'info');
      this.hiTimer = setInterval(function () {
        if (!self.play) return;
        const ed = self.editors[self.mode];
        if (self.tab === 'script' && ed.highlight) ed.highlight(self.play.world.hits, self.play.world.frame);
        $('fps').textContent = self.play.world.objs.length + ' objects';
      }, 80);
    },
    stopGame: function (silent) {
      if (!this.play) return;
      this.play.world.destroy();
      this.play = null;
      clearInterval(this.hiTimer);
      document.body.classList.remove('playing');
      $('gameIdle').style.display = '';
      $('fps').textContent = '';
      const ed = this.editors[this.mode];
      if (ed.highlight) ed.highlight(null, 0);
      if (!silent) { this.log('Stopped', 'info'); if (this.tab === 'game' && this.returnTab) this.setTab(this.returnTab); }
    },

    // ------------------------------------------------------------------ console
    log: function (msg, kind, who) {
      const box = $('consoleBody');
      const row = el('div', { class: 'c-row c-' + (kind || 'log') }, [
        el('span', { class: 'c-t', text: new Date().toLocaleTimeString().slice(0, 8) }),
        who ? el('span', { class: 'c-who', text: who }) : null,
        el('span', { class: 'c-msg', text: msg })
      ]);
      if (who && this.project) {
        row.classList.add('link');
        row.title = 'Click to open this object';
        const self = this;
        row.addEventListener('click', function () {
          const d = self.scene().objects.find(function (o) { return o.name === who; });
          if (d) { self.select(d.id); self.setTab('script'); }
        });
      }
      box.appendChild(row);
      while (box.children.length > 400) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
      if (kind === 'error') $('console').classList.add('has-error');
    },
    clearConsole: function () { $('consoleBody').innerHTML = ''; $('console').classList.remove('has-error'); },

    // ------------------------------------------------------------------ export
    buildGameHtml: function () {
      const self = this;
      // the runtime is rebuilt from the loaded modules' own source, so export also works when
      // index.html is opened straight from disk (browsers block fetch() on file:// pages)
      const mods = A._mods || {};
      return Promise.resolve().then(function () {
        if (!mods.lang || !mods.engine) throw new Error('the game engine is not loaded');
        const src = [mods.lang, mods.engine].map(function (fn) {
          return '(' + fn.toString() + ')(typeof window !== "undefined" ? window : globalThis);';
        });
        const p = JSON.stringify(self.project).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
        const title = W.esc(self.project.name);
        return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>' + title + '</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden;user-select:none}#game{position:absolute;inset:0}</style></head>' +
          '<body><div id="game" tabindex="0"></div>\n<script>\n' + src.map(function (s) { return s.replace(/<\/script/gi, '<\\/script'); }).join('\n</script>\n<script>\n') + '\n</script>\n' +
          '<script>\nvar ALCAZAR_PROJECT=' + p + ';\nwindow.addEventListener("load",function(){document.getElementById("game").focus();Alcazar.bootPlayer(ALCAZAR_PROJECT,document.getElementById("game"));});\n</script></body></html>';
      });
    },
    exportGame: function (kind) {
      const self = this;
      if (!this.project) return;
      const name = (this.project.name || 'Game').replace(/[\\/:*?"<>|]/g, '_');
      const KIND = {
        exe: { what: 'Windows app', cmd: 'exportExe', note: 'It is a single file — send it to friends and they can play on any Windows 10/11 PC, no install needed.' },
        dmg: { what: 'Mac app', cmd: 'exportDmg', note: 'On a Mac, open the .dmg and drag the game into Applications. The game opens in its own Chrome or Edge window (or Safari if neither is installed). The app is not signed, so the first time, right-click it and choose Open.' },
        deb: { what: 'Linux package', cmd: 'exportDeb', note: 'On Ubuntu or Debian, install it with "sudo apt install ./FILE", then start it from the app menu. It opens in its own Chrome/Chromium window, or the default browser.' },
        html: { what: 'web page', cmd: 'exportHtml', note: 'Open it in any web browser, or upload it to a site like itch.io.' }
      }[kind];
      W.toast('Building ' + KIND.what + '…');
      this.buildGameHtml().then(function (html) {
        const files = Object.keys(self.project.assets || {}).map(function (k) { return self.project.assets[k].file; }).filter(Boolean);
        return Host.call(KIND.cmd, { html: html, name: name, files: files, width: self.project.width || 960, height: self.project.height || 540 });
      }).then(function (r) {
        if (!r) return;
        self.log('Exported: ' + r.path, 'info');
        if (!Host.native) { W.toast('Downloaded'); return; }
        W.modal('Export finished', el('div', {}, [
          el('p', { text: 'Your game was saved to:' }), el('code', { class: 'path', text: r.path }),
          el('p', { class: 'muted', text: KIND.note.replace('FILE', r.path.split(/[\\/]/).pop()) })
        ]), kind === 'exe' || kind === 'html' ? [
          { label: 'Show in folder', onClick: function () { Host.call('openFolder', { path: r.path }); } },
          { label: 'Run it now', primary: true, onClick: function () { Host.call('runFile', { path: r.path }); } }
        ] : [
          { label: 'Show in folder', primary: true, onClick: function () { Host.call('openFolder', { path: r.path }); } }
        ]);
      }).catch(function (e) { W.toast('Export failed: ' + e.message, 'err'); self.log('Export failed: ' + e.message, 'error'); });
    },

    // ------------------------------------------------------------------ help
    help: function () {
      W.modal('Welcome to Alcazar', el('div', { class: 'help' }, [
        el('p', { html: '<b>1. Build your world</b> in the <b>Scene</b> tab: click <b>+ Add</b>, drag things around, change them on the right.' }),
        el('p', { html: '<b>2. Give objects behaviour</b> in the <b>Script</b> tab. Every script starts with a yellow <b>“when”</b> — like <i>when game starts</i> or <i>when key space is pressed</i>.' }),
        el('p', { html: '<b>3. Pick how you like to code</b> — they all edit the same program, switch any time:' }),
        el('ul', { html: '<li><b>Flow</b> — a flowchart. Click + on an arrow to add a step. Diamonds decide, hexagons repeat.</li><li><b>Blocks</b> — snap blocks together like LEGO.</li><li><b>Text</b> — type code, with autocomplete and a cheat sheet.</li>' }),
        el('p', { html: '<b>4. Press Play</b> (F5). In Flow mode, steps glow as they run, so you can see what your game is thinking.' }),
        el('p', { html: '<b>5. Export</b> a Windows <b>.exe</b>, a Mac <b>.dmg</b>, a Linux <b>.deb</b> or a web page to share.' }),
        el('h3', { text: 'Handy words' }),
        el('ul', { html: '<li><code>x</code>, <code>y</code>, <code>vx</code>, <code>vy</code>, <code>rotation</code>, <code>visible</code> — properties of the object running the script.</li><li><code>score</code> — any name becomes a variable. Add shared ones under <b>Variables</b>.</li><li><code>Player.x</code> — another object\'s property. <code>other</code> — the thing you just touched.</li><li>Text objects show variables live: <code>Score: {score}</code></li>' }),
        el('h3', { text: 'Shortcuts' }),
        el('p', { class: 'muted', html: '<kbd>F5</kbd> play · <kbd>Esc</kbd> stop · <kbd>Ctrl+S</kbd> save · <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd> undo/redo · <kbd>Ctrl+D</kbd> duplicate · <kbd>Del</kbd> delete · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> Scene/Script/Game' })
      ]));
    },

    // ------------------------------------------------------------------ wiring
    bindUI: function () {
      const self = this;
      $('bNew').onclick = function () { if (self.confirmDiscard()) { self.stopGame(true); self.showStart(); } };
      $('bOpen').onclick = function () { self.open(); };
      $('bSave').onclick = function () { self.save(); };
      $('bSave').oncontextmenu = function (e) { e.preventDefault(); self.save(true); };
      $('bUndo').onclick = function () { self.undo(); };
      $('bRedo').onclick = function () { self.redo(); };
      $('bPlay').onclick = function () { self.startGame(); };
      $('bStop').onclick = function () { self.stopGame(); };
      $('bHelp').onclick = function () { self.help(); };
      $('bExport').onclick = function () {
        const r = $('bExport').getBoundingClientRect();
        W.menu(r.left - 120, r.bottom + 4, [
          { header: 'Export your game as…' },
          { label: 'Windows app (.exe)', icon: 'window', hint: 'one file', onClick: function () { self.exportGame('exe'); } },
          { label: 'Mac app (.dmg)', icon: 'window', hint: 'macOS', onClick: function () { self.exportGame('dmg'); } },
          { label: 'Linux package (.deb)', icon: 'window', hint: 'Ubuntu, Debian', onClick: function () { self.exportGame('deb'); } },
          { label: 'Web page (.html)', icon: 'globe', hint: 'any browser', onClick: function () { self.exportGame('html'); } },
          '-',
          { label: 'Save project as…', icon: 'save', onClick: function () { self.save(true); } }
        ]);
      };
      $('bAdd').onclick = function () { const r = $('bAdd').getBoundingClientRect(); self.addMenu(r.left, r.bottom + 4); };
      $('bAddScene').onclick = function () {
        const r = $('bAddScene').getBoundingClientRect();
        W.menu(r.left, r.bottom + 4, [{ label: 'New 2D scene', icon: 'square', onClick: function () { self.addScene('2d'); } }, { label: 'New 3D scene', icon: 'cube', onClick: function () { self.addScene('3d'); } }]);
      };
      $('bAddVar').onclick = function () { self.addVar(); };
      $('bImport').onclick = function () { self.importAssets(); };
      $('bClear').onclick = function () { self.clearConsole(); };
      $('bConsole').onclick = function () { $('console').classList.toggle('collapsed'); };
      document.querySelectorAll('#tabs [data-tab]').forEach(function (b) { b.onclick = function () { self.setTab(b.getAttribute('data-tab')); }; });
      document.querySelectorAll('#scriptModes [data-mode]').forEach(function (b) { b.onclick = function () { self.setMode(b.getAttribute('data-mode')); }; });
      let m = 'flow';
      try { m = localStorage.getItem('alz-mode') || 'flow'; } catch (e) { /* ignore */ }
      this.mode = '';
      this.setMode(m);
      G.addEventListener('resize', function () { self.sceneView.refresh(); });
      G.addEventListener('beforeunload', function (e) { if (self.dirty && !Host.native) { e.preventDefault(); e.returnValue = ''; } });
      // drop files onto the window to import
      document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) e.preventDefault(); });
      document.addEventListener('drop', function (e) {
        if (!e.dataTransfer || !e.dataTransfer.files.length || !self.project) return;
        e.preventDefault();
        const files = Array.prototype.slice.call(e.dataTransfer.files);
        files.forEach(function (f) {
          const kind = /^image\//.test(f.type) ? 'image' : /^audio\//.test(f.type) ? 'sound' : /\.(ttf|otf|woff2?)$/i.test(f.name) ? 'font' : /\.(glb|gltf|obj)$/i.test(f.name) ? 'model' : null;
          if (/\.alcazar$/i.test(f.name)) { const r = new FileReader(); r.onload = function () { try { self.loadProject(JSON.parse(r.result), null); } catch (er) { W.toast('Not a project', 'err'); } }; r.readAsText(f); return; }
          if (!kind) return;
          const r = new FileReader();
          r.onload = function () {
            let n = f.name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]/g, '_'); const base = n; let i = 2;
            while (self.project.assets[n]) n = base + i++;
            self.project.assets[n] = { type: kind, data: r.result };
            A.loadFonts(self.project);
            self.markDirty(); self.renderAssets(); self.renderInspector(); W.toast('Imported ' + n);
          };
          r.readAsDataURL(f);
        });
      });
    },
    bindKeys: function () {
      const self = this;
      document.addEventListener('keydown', function (e) {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
        const ctrl = e.ctrlKey || e.metaKey;
        if (e.key === 'F5') { e.preventDefault(); if (e.shiftKey) self.stopGame(); else self.startGame(); return; }
        if (e.key === 'Escape' && self.play) { self.stopGame(); return; }
        if (!self.project) return;
        if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); self.save(e.shiftKey); return; }
        if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); self.open(); return; }
        if (typing || self.play && self.tab === 'game') return;
        if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) self.redo(); else self.undo(); return; }
        if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); self.redo(); return; }
        if (self.tab === 'script') return; // script editors handle their own keys
        if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); self.duplicate(); return; }
        if (e.key === 'Delete') { self.deleteSelected(); return; }
        if (e.key === '1') self.setTab('scene');
        if (e.key === '2') self.setTab('script');
        if (e.key === '3') self.setTab('game');
        if (e.key.toLowerCase() === 'f' && self.tab === 'scene') self.sceneView.focus();
        if (self.tab === 'scene' && e.key.indexOf('Arrow') === 0) {
          const d = self.selectedDef(); if (!d) return;
          e.preventDefault();
          const d3 = self.scene().mode === '3d', st = e.shiftKey ? (d3 ? 1 : 10) : (d3 ? 0.1 : 1);
          if (e.key === 'ArrowLeft') d.x = round(d.x - st);
          if (e.key === 'ArrowRight') d.x = round(d.x + st);
          if (e.key === 'ArrowUp') { if (d3) d.z = round(d.z - st); else d.y = round(d.y + st); }
          if (e.key === 'ArrowDown') { if (d3) d.z = round(d.z + st); else d.y = round(d.y - st); }
          self.commit('Nudge', { fromInspector: true }); self.liveInspector();
        }
      });
    }
  };

  function uniq(a) { return a.filter(function (x, i) { return x !== '' && x != null && a.indexOf(x) === i; }); }
  function round(v) { return Math.round((+v || 0) * 1000) / 1000; }
  function migrate(p) {
    if (!p || p.format !== 'alcazar' || !Array.isArray(p.scenes) || !p.scenes.length) throw new Error('not an Alcazar project');
    p.globals = p.globals || []; p.assets = p.assets || {};
    p.width = p.width || 960; p.height = p.height || 540;
    p.scenes.forEach(function (s) { s.objects = (s.objects || []).map(function (o) { return A.makeObject(o); }); });
    return p;
  }

  G.addEventListener('DOMContentLoaded', function () { IDE.init(); });
})(window);
