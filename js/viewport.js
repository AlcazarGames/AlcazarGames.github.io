/* Scene view: place, move, resize objects. 2D: drag / wheel zoom / right-drag pan.
 * 3D: left-drag empty space to orbit, right-drag to pan, drag objects along the floor (Shift = up/down). */
(function (G) {
  'use strict';
  const A = G.Alcazar, W = A.W;

  function SceneView(container, ide) {
    this.ide = ide;
    this.container = container;
    container.innerHTML = '';
    this.stageBox = W.el('div', { class: 'sv-stage' });
    container.appendChild(this.stageBox);
    this.bar = W.el('div', { class: 'sv-bar' });
    container.appendChild(this.bar);
    this.hint = W.el('div', { class: 'sv-hint' });
    container.appendChild(this.hint);
    this.snap = true;
    this.world = null;
    this.dirty = true;
    const self = this;
    (function loop() { if (self.dirty && self.visible()) { self.dirty = false; self.draw(); } requestAnimationFrame(loop); })();
    setInterval(function () { self.dirty = true; }, 700); // pick up late-loading images
    this.bind();
  }
  SceneView.prototype.visible = function () { return this.container.offsetParent !== null; };
  SceneView.prototype.rebuild = function () {
    const ide = this.ide, sc = ide.scene();
    if (!sc) return;
    if (!this.world) {
      this.world = new A.World(ide.project, { container: this.stageBox, edit: true, sceneName: sc.name });
    } else {
      this.world.project = ide.project;
      this.world.design = { w: ide.project.width || 960, h: ide.project.height || 540 };
      this.world.load(sc.name);
    }
    this.world.opts.selectedId = ide.selectedId;
    this.buildBar();
    this.dirty = true;
  };
  SceneView.prototype.refresh = function () { if (this.world) this.world.opts.selectedId = this.ide.selectedId; this.dirty = true; };
  SceneView.prototype.draw = function () {
    if (!this.world) return;
    this.world.render();
    // keep drawing while a big model is still streaming its textures in
    if (this.world.r3 && this.world.r3.texPending) this.dirty = true;
  };
  SceneView.prototype.inst = function (def) { return this.world.objs.find(function (o) { return o.def === def; }); };

  SceneView.prototype.buildBar = function () {
    const self = this, sc = this.ide.scene(), d3 = sc.mode === '3d';
    this.bar.innerHTML = '';
    this.bar.appendChild(W.el('span', { class: 'sv-mode', text: d3 ? '3D' : '2D' }));
    const snap = W.el('label', { class: 'sv-chk', title: 'Snap positions to a grid while dragging' }, [W.el('input', { type: 'checkbox', checked: this.snap ? true : null, onchange: function (e) { self.snap = e.target.checked; } }), ' Snap']);
    this.bar.appendChild(snap);
    this.bar.appendChild(W.el('button', { html: A.icon('focus', 14) + 'Focus', title: 'Centre the view on the selected object (F)', onclick: function () { self.focus(); } }));
    if (d3) {
      this.bar.appendChild(W.el('button', {
        html: A.icon('camera', 14) + 'Use this view as game camera', title: 'The game will start looking exactly like this view',
        onclick: function () {
          const v = self.world.cam3View(); const s = self.ide.scene();
          s.camera = Object.assign(s.camera || {}, { ex: r2(v.eye[0]), ey: r2(v.eye[1]), ez: r2(v.eye[2]), tx: r2(v.target[0]), ty: r2(v.target[1]), tz: r2(v.target[2]) });
          self.ide.commit('Set camera'); W.toast('Game camera updated');
        }
      }));
      this.hint.textContent = 'Left-drag: orbit  ·  Right-drag: pan  ·  Wheel: zoom  ·  Drag an object to move it (Shift = up/down)';
    } else {
      this.bar.appendChild(W.el('button', {
        html: A.icon('camera', 14) + 'Game camera starts here', title: 'Put the game camera at the centre of this view',
        onclick: function () { const c = self.world.editCam2, s = self.ide.scene(); s.camera = Object.assign(s.camera || {}, { x: Math.round(c.x), y: Math.round(c.y) }); self.ide.commit('Set camera'); }
      }));
      this.hint.textContent = 'Drag objects to move  ·  Yellow corner: resize  ·  Right-drag: pan  ·  Wheel: zoom  ·  Del: delete  ·  Ctrl+D: duplicate';
    }
  };
  function r2(v) { return Math.round(v * 100) / 100; }

  SceneView.prototype.focus = function () {
    const def = this.ide.selectedDef();
    if (!this.world) return;
    if (this.world.d3) {
      const t = def ? [def.x, def.y, def.z] : [0, 0, 0];
      this.world.editCam3.target = t;
    } else {
      this.world.editCam2.x = def && !def.ui ? def.x : 0;
      this.world.editCam2.y = def && !def.ui ? def.y : 0;
    }
    this.dirty = true;
  };

  SceneView.prototype.bind = function () {
    const self = this, box = this.stageBox;
    box.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    box.addEventListener('wheel', function (e) {
      e.preventDefault();
      const w = self.world; if (!w) return;
      const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      if (w.d3) { w.editCam3.dist = Math.max(2, Math.min(300, w.editCam3.dist / k)); }
      else {
        const r = box.getBoundingClientRect(), lx = e.clientX - r.left, ly = e.clientY - r.top;
        const before = w.screenToWorld2(lx, ly);
        w.editCam2.zoom = Math.max(0.05, Math.min(8, w.editCam2.zoom * k));
        const after = w.screenToWorld2(lx, ly);
        w.editCam2.x += before[0] - after[0]; w.editCam2.y += before[1] - after[1];
      }
      self.dirty = true;
    }, { passive: false });
    box.addEventListener('mousedown', function (e) {
      const w = self.world; if (!w) return;
      box.focus();
      const r = box.getBoundingClientRect(), lx = e.clientX - r.left, ly = e.clientY - r.top;
      if (e.button === 0) {
        // resize handle (2D)
        const selDef = self.ide.selectedDef();
        if (selDef && !w.d3 && !A.MESH_TYPES.includes(selDef.type)) {
          const inst = self.inst(selDef);
          if (inst && self.onHandle(inst, lx, ly)) { self.dragResize(e, selDef, inst); return; }
        }
        const hit = w.pickLocal(lx, ly);
        if (hit) {
          self.ide.select(hit.def.id);
          self.dragMove(e, hit.def, self.inst(hit.def));
          return;
        }
        if (w.d3) { self.orbit(e); return; }
        self.ide.select(null);
        self.pan(e);
        return;
      }
      if (e.button === 2 || e.button === 1) { self.pan(e); }
    });
  };
  SceneView.prototype.onHandle = function (inst, lx, ly) {
    const w = this.world, e = A.extents(inst);
    const p = inst.ui ? uiToScreen(w, inst.x + e[0], inst.y - e[1]) : w.worldToScreen2(inst.x + e[0], inst.y - e[1]);
    return Math.abs(lx - p[0]) < 10 && Math.abs(ly - p[1]) < 10;
  };
  function uiToScreen(w, x, y) { const s = w.uiScale(), o = w.uiOrigin(); return [x * s + o[0], o[1] - y * s]; }

  function track(e, onMove, onUp) {
    const mv = function (m) { onMove(m); };
    const up = function (u) { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (onUp) onUp(u); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  SceneView.prototype.pan = function (e) {
    const w = this.world, self = this, sx = e.clientX, sy = e.clientY;
    if (w.d3) {
      const c = w.editCam3, t0 = c.target.slice(), yaw = c.yaw * Math.PI / 180;
      track(e, function (m) {
        const k = c.dist * 0.0018, dx = (m.clientX - sx) * k, dy = (m.clientY - sy) * k;
        c.target = [t0[0] - Math.cos(yaw) * dx - Math.sin(yaw) * dy * 0.0, t0[1] + dy, t0[2] + Math.sin(yaw) * dx];
        self.dirty = true;
      });
      return;
    }
    const c = w.editCam2, cx = c.x, cy = c.y;
    track(e, function (m) { c.x = cx - (m.clientX - sx) / c.zoom; c.y = cy + (m.clientY - sy) / c.zoom; self.dirty = true; });
  };
  SceneView.prototype.orbit = function (e) {
    const self = this, c = this.world.editCam3, sx = e.clientX, sy = e.clientY, y0 = c.yaw, p0 = c.pitch;
    let moved = false;
    track(e, function (m) {
      if (Math.abs(m.clientX - sx) + Math.abs(m.clientY - sy) > 3) moved = true;
      c.yaw = y0 - (m.clientX - sx) * 0.4; c.pitch = Math.max(-85, Math.min(89, p0 + (m.clientY - sy) * 0.3)); self.dirty = true;
    }, function () { if (!moved) self.ide.select(null); });
  };
  SceneView.prototype.snapv = function (v, step, e) { return (this.snap && !e.altKey) ? Math.round(v / step) * step : Math.round(v * 100) / 100; };
  SceneView.prototype.dragMove = function (e, def, inst) {
    const self = this, w = this.world, r = this.stageBox.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, ox = def.x, oy = def.y, oz = def.z;
    let moved = false;
    if (w.d3 && !def.ui) {
      // drag on horizontal plane through the object (or vertical with shift)
      const ray0 = w.ray3(sx - r.left, sy - r.top);
      const planeHit = function (ray, y) { if (Math.abs(ray.d[1]) < 1e-5) return null; const t = (y - ray.o[1]) / ray.d[1]; if (t < 0) return null; return [ray.o[0] + ray.d[0] * t, ray.o[2] + ray.d[2] * t]; };
      const h0 = planeHit(ray0, oy);
      track(e, function (m) {
        if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 3) return;
        moved = true;
        if (m.shiftKey) {
          def.y = inst.y = self.snapv(oy - (m.clientY - sy) * w.editCam3.dist * 0.003, 0.5, m);
        } else if (h0) {
          const h = planeHit(w.ray3(m.clientX - r.left, m.clientY - r.top), oy);
          if (h) { def.x = inst.x = self.snapv(ox + h[0] - h0[0], 0.5, m); def.z = inst.z = self.snapv(oz + h[1] - h0[1], 0.5, m); }
        }
        self.dirty = true; self.ide.liveInspector();
      }, function () { if (moved) self.ide.commit('Move ' + def.name); });
      return;
    }
    const s = def.ui ? w.uiScale() : w.scale2();
    track(e, function (m) {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 3) return;
      moved = true;
      def.x = inst.x = self.snapv(ox + (m.clientX - sx) / s, 10, m);
      def.y = inst.y = self.snapv(oy - (m.clientY - sy) / s, 10, m);
      self.dirty = true; self.ide.liveInspector();
    }, function () { if (moved) self.ide.commit('Move ' + def.name); });
  };
  SceneView.prototype.dragResize = function (e, def, inst) {
    const self = this, w = this.world, sx = e.clientX, sy = e.clientY;
    const s = def.ui ? w.uiScale() : w.scale2();
    const ow = def.w, oh = def.h, of = def.fontSize || 28;
    track(e, function (m) {
      const dx = (m.clientX - sx) / s * 2, dy = (m.clientY - sy) / s * 2;
      if (def.type === 'text') def.fontSize = inst.fontSize = Math.max(6, Math.round(of + dy / 2));
      else {
        def.w = inst.w = Math.max(2, self.snapv(ow + dx / Math.abs(def.sx || 1), 2, m));
        def.h = inst.h = Math.max(2, self.snapv(oh + dy / Math.abs(def.sy || 1), 2, m));
      }
      self.dirty = true; self.ide.liveInspector();
    }, function () { self.ide.commit('Resize ' + def.name); });
  };

  A.SceneView = SceneView;
})(window);
