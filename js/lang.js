/* Alcazar language core
 * One program model (AST) shared by Flow, Blocks and Text modes.
 *
 * Script     { id, event, param, x, y, body:[Stmt] }
 * Stmt       { id, t:'call', fn, args:[exprSrc] }
 *            { id, t:'set', target, op, value }
 *            { id, t:'if', cond, then:[], else:[]|null }
 *            { id, t:'repeat', count, body:[] }
 *            { id, t:'while', cond, body:[] }
 *            { id, t:'forever', body:[] }
 *            { id, t:'comment', text }
 * Expressions are stored as source strings and compiled on demand.
 */
(function alcazarLang(G) {
  'use strict';
  const A = G.Alcazar = G.Alcazar || {};
  // exports rebuild the game page from these functions (fetching js/*.js fails when index.html is opened from disk)
  (A._mods = A._mods || {}).lang = alcazarLang;

  let uidCounter = 0;
  A.uid = function () {
    uidCounter = (uidCounter + 1) % 1e6;
    return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + uidCounter.toString(36);
  };

  // ---------------------------------------------------------------- catalog
  A.CATEGORIES = {
    Events:  { color: '#d99a00' },
    Motion:  { color: '#4c7dff' },
    Physics: { color: '#11a493' },
    Looks:   { color: '#8a5cf6' },
    Sound:   { color: '#c14fc1' },
    Control: { color: '#ee8a00' },
    Camera:  { color: '#e0567a' },
    Data:    { color: '#f06a1d' },
    Sensing: { color: '#2b9bd0' },
    Math:    { color: '#3aa845' }
  };

  // arg: [name, type, default, flags]  flags: '3d' = only shown for 3D scenes
  const ACT = [
    // Motion
    ['move', 'Motion', '➜', 'move by {dx}, {dy}', [['dx', 'num', '5'], ['dy', 'num', '0'], ['dz', 'num', '0', '3d']], 'Move this object by an amount (x, y, z).'],
    ['move_forward', 'Motion', '⬆', 'move forward {dist}', [['dist', 'num', '5']], 'Move in the direction the object is facing.'],
    ['go_to', 'Motion', '⌖', 'go to {x}, {y}', [['x', 'num', '0'], ['y', 'num', '0'], ['z', 'num', '0', '3d']], 'Jump to an exact position.'],
    ['go_to_object', 'Motion', '⌖', 'go to {name}', [['name', 'obj', '"Player"']], 'Jump to where another object is.'],
    ['glide_to', 'Motion', '〰', 'glide {secs} s to {x}, {y}', [['secs', 'num', '1'], ['x', 'num', '0'], ['y', 'num', '0'], ['z', 'num', '0', '3d']], 'Smoothly slide to a position over time.'],
    ['turn', 'Motion', '↻', 'turn {deg}°', [['deg', 'num', '15']], 'Rotate by some degrees.'],
    ['set_rotation', 'Motion', '∠', 'set rotation to {deg}°', [['deg', 'num', '0']], 'Face an exact angle.'],
    ['point_towards', 'Motion', '◎', 'point towards {name}', [['name', 'obj', '"Player"']], 'Turn to face another object.'],
    ['walk', 'Motion', '🚶', 'walk forward {forward} right {right}', [['forward', 'num', '6'], ['right', 'num', '0']], 'Set speed relative to the way the object faces (3D). Great for first-person.'],
    ['keep_on_screen', 'Motion', '▣', 'keep on screen', [], 'Stop this object leaving the camera view (2D).'],
    // Physics
    ['set_velocity', 'Physics', '⇶', 'set velocity {vx}, {vy}', [['vx', 'num', '0'], ['vy', 'num', '0'], ['vz', 'num', '0', '3d']], 'Set speed directly (units per second).'],
    ['push', 'Physics', '⇥', 'push {fx}, {fy}', [['fx', 'num', '0'], ['fy', 'num', '300'], ['fz', 'num', '0', '3d']], 'Add to the current speed.'],
    ['jump', 'Physics', '⤒', 'jump with power {power}', [['power', 'num', '600']], 'Jump upward, only when standing on something.'],
    ['set_gravity', 'Physics', '⇓', 'set world gravity to {g}', [['g', 'num', '1200']], 'Change how strongly everything falls.'],
    // Looks
    ['show', 'Looks', '◉', 'show', [], 'Make this object visible.'],
    ['hide', 'Looks', '○', 'hide', [], 'Make this object invisible.'],
    ['set_color', 'Looks', '🎨', 'set color to {color}', [['color', 'color', '"#ff4d4d"']], 'Change the colour.'],
    ['set_alpha', 'Looks', '◐', 'set opacity to {a}', [['a', 'num', '0.5']], '0 = invisible, 1 = solid.'],
    ['set_scale', 'Looks', '⤢', 'set size to {s} ×', [['s', 'num', '1.5']], 'Grow or shrink (1 = normal).'],
    ['set_text', 'Looks', 'T', 'set text to {text}', [['text', 'str', '"Hello"']], 'Change the words of a text object.'],
    ['set_image', 'Looks', '🖼', 'set image to {image}', [['image', 'image', '""']], 'Change the picture of a sprite.'],
    ['set_font', 'Looks', 'Aa', 'set font to {font}', [['font', 'font', '"Impact"']], 'Change the lettering of a text object.'],
    ['say', 'Looks', '💬', 'say {text} for {secs} s', [['text', 'str', '"Hello!"'], ['secs', 'num', '2']], 'Show a speech bubble (0 seconds = until changed).'],
    ['burst', 'Looks', '✺', 'burst {count} {color} particles', [['count', 'num', '20'], ['color', 'color', '"#ffd84d"']], 'A quick explosion of particles.'],
    ['set_time_of_day', 'Looks', '', 'set time of day to {hours}', [['hours', 'num', '18']], 'Move the sun (0-24 hours) in scenes with a sky: sunrise, midday, sunset, night.'],
    ['set_clouds', 'Looks', '', 'set cloud cover to {amount}', [['amount', 'num', '0.6']], 'How cloudy the sky is, from 0 (clear) to 1 (overcast).'],
    ['set_background', 'Looks', '▧', 'set background to {color}', [['color', 'color', '"#223344"']], 'Change the scene background colour.'],
    // Sound
    ['play_sound', 'Sound', '♪', 'play sound {sound}', [['sound', 'sound', '"coin"']], 'Play an imported or built-in sound.'],
    ['tone', 'Sound', '♫', 'play tone {freq} Hz for {secs} s', [['freq', 'num', '440'], ['secs', 'num', '0.2']], 'Beep at a pitch.'],
    ['stop_sounds', 'Sound', '🔇', 'stop all sounds', [], 'Silence everything.'],
    // Control
    ['wait', 'Control', '⏱', 'wait {secs} s', [['secs', 'num', '1']], 'Pause this script.'],
    ['stop', 'Control', '⏹', 'stop this script', [], 'End this script now.'],
    ['broadcast', 'Control', '📣', 'broadcast {msg}', [['msg', 'msg', '"go"']], 'Send a message to every object.'],
    ['spawn', 'Control', '✚', 'spawn {name} at {x}, {y}', [['name', 'obj', '"Enemy"'], ['x', 'num', 'x'], ['y', 'num', 'y'], ['z', 'num', 'z', '3d']], 'Create a new copy of an object.'],
    ['shoot', 'Control', '', 'shoot {count} × {template} at speed {speed}, spread {spread}°', [['template', 'obj', '"Bullet"'], ['speed', 'num', '60'], ['spread', 'num', '0'], ['count', 'num', '1']], 'Fire copies of a template object toward the crosshair (3D) or the mouse (2D).'],
    ['shoot_at', 'Control', '', 'shoot {template} at {target}, speed {speed}, spread {spread}°', [['template', 'obj', '"Bullet"'], ['target', 'obj', '"Player"'], ['speed', 'num', '20'], ['spread', 'num', '0']], 'Fire a copy of a template object toward another object.'],
    ['damage_near', 'Control', '', 'damage {tag} within {radius} by {amount}', [['tag', 'obj', '"enemy"'], ['radius', 'num', '4'], ['amount', 'num', '5']], 'Take amount away from the hp variable of every matching object nearby. Good for explosions.'],
    ['grab', 'Control', '', 'grab nearest {tag} within {reach}', [['tag', 'obj', '"item"'], ['reach', 'num', '2']], 'Pick up the closest object with this name or tag and carry it.'],
    ['drop', 'Control', '', 'drop what you are holding', [], 'Put the carried object down in front of you.'],
    ['throw_held', 'Control', '', 'throw what you are holding at speed {speed}', [['speed', 'num', '8']], 'Throw the carried object forward.'],
    ['give_to', 'Control', '', 'give a new {template} to {target}', [['template', 'obj', '"Burger"'], ['target', 'obj', '"Player"']], 'Make a copy of a template and put it in someone\'s hands.'],
    ['remove', 'Control', '', 'remove {target}', [['target', 'obj', 'other']], 'Delete another object, for example other.'],
    ['knock_down', 'Physics', '', 'knock down {target} for {secs} s', [['target', 'obj', '"Player"'], ['secs', 'num', '1.5'], ['push', 'num', '4']], 'Make a ragdoll go limp and fall over.'],
    ['flop', 'Physics', '', 'flop over for {secs} s', [['secs', 'num', '1.5']], 'This ragdoll collapses on purpose.'],
    ['destroy', 'Control', '✖', 'destroy this object', [], 'Remove this object from the game.'],
    ['pause_game', 'Control', '⏸', 'pause the game', [], 'Freeze movement, physics and timers. Key presses, clicks and messages still work.'],
    ['resume_game', 'Control', '▶', 'resume the game', [], 'Unfreeze the game after a pause.'],
    ['go_to_scene', 'Control', '⎆', 'go to scene {scene}', [['scene', 'scene', '"Main"']], 'Switch to another scene.'],
    ['restart_scene', 'Control', '⟲', 'restart scene', [], 'Start the current scene again.'],
    // Camera
    ['camera_follow', 'Camera', '🎥', 'camera follow {name}', [['name', 'obj', '"Player"']], 'Make the camera chase an object ("" to stop).'],
    ['camera_shake', 'Camera', '≋', 'shake camera {power} for {secs} s', [['power', 'num', '8'], ['secs', 'num', '0.3']], 'Rumble!'],
    ['first_person', 'Camera', '👁', 'first-person view from {name} at eye height {height}', [['name', 'obj', '"Player"'], ['height', 'num', '0.6']], 'See through an object\'s eyes (3D). Click the game to capture the mouse.'],
    ['third_person', 'Camera', '', 'third-person view of {name}: distance {distance}, height {height}, side {side}', [['name', 'obj', '"Player"'], ['distance', 'num', '6'], ['height', 'num', '1.6'], ['side', 'num', '0.8']], 'Over-the-shoulder camera behind an object (3D). Use with "look around with the mouse".'],
    ['mouse_look', 'Camera', '🖱', 'look around with the mouse, speed {speed}', [['speed', 'num', '0.12']], 'Turn and look up/down by moving the mouse (use every frame).'],
    ['camera_zoom', 'Camera', '🔍', 'set camera zoom to {zoom}', [['zoom', 'num', '1.5']], 'Zoom in or out (2D).'],
    // Data
    ['log', 'Data', '🖹', 'print {value}', [['value', 'str', '"hi"']], 'Write something in the console.']
  ];
  A.ACTIONS = {};
  A.ACTION_LIST = ACT.map(function (a) {
    const o = { fn: a[0], cat: a[1], icon: a[2], label: a[3], doc: a[5],
      args: a[4].map(function (x) { return { n: x[0], type: x[1], def: x[2], only3d: x[3] === '3d' }; }) };
    A.ACTIONS[o.fn] = o;
    return o;
  });

  // Reporters usable in expressions (for help + autocomplete)
  A.REPORTER_LIST = [
    ['key_down', 'Sensing', 'key_down("space")', 'Is a key held down?'],
    ['key_pressed', 'Sensing', 'key_pressed("space")', 'Was a key pressed this frame?'],
    ['mouse_x', 'Sensing', 'mouse_x()', 'Mouse X position.'],
    ['mouse_y', 'Sensing', 'mouse_y()', 'Mouse Y position.'],
    ['mouse_down', 'Sensing', 'mouse_down()', 'Is the mouse button held?'],
    ['mouse_dx', 'Sensing', 'mouse_dx()', 'How far the mouse moved sideways this frame.'],
    ['mouse_dy', 'Sensing', 'mouse_dy()', 'How far the mouse moved up/down this frame.'],
    ['mouse_wheel', 'Sensing', 'mouse_wheel()', 'Mouse wheel this frame: 1 = down, -1 = up, 0 = not moved.'],
    ['mouse_locked', 'Sensing', 'mouse_locked()', 'Is the mouse captured by the game (first-person)?'],
    ['aim_target', 'Sensing', 'aim_target()', 'The object under the crosshair (centre of the screen), or 0.'],
    ['aiming_at', 'Sensing', 'aiming_at("Target")', 'Is the crosshair on this object (name or tag)?'],
    ['touching', 'Sensing', 'touching("Wall")', 'Am I overlapping an object (name or tag)?'],
    ['on_ground', 'Sensing', 'on_ground()', 'Am I standing on something solid?'],
    ['distance_to', 'Sensing', 'distance_to("Player")', 'Distance to another object.'],
    ['angle_to', 'Sensing', 'angle_to("Player")', 'Angle (degrees) towards another object.'],
    ['exists', 'Sensing', 'exists("Boss")', 'Is there an object with this name?'],
    ['count', 'Sensing', 'count("Enemy")', 'How many objects have this name or tag?'],
    ['time', 'Sensing', 'time()', 'Seconds since the scene started.'],
    ['held', 'Sensing', 'held()', 'The object being carried, or 0. held().name gives its name.'],
    ['holding', 'Sensing', 'holding("Burger")', 'Am I carrying something with this name or tag?'],
    ['is_held', 'Sensing', 'is_held()', 'Is somebody carrying me?'],
    ['is_down', 'Sensing', 'is_down()', 'Is this ragdoll knocked over? is_down("Player") checks another one.'],
    ['atan2', 'Math', 'atan2(y, x)', 'Angle in degrees of a direction.'],
    ['time_of_day', 'Sensing', 'time_of_day()', 'The hour shown by the sky (0-24).'],
    ['ground_height', 'Sensing', 'ground_height(x, z)', 'Height of the terrain at a spot (3D).'],
    ['paused', 'Sensing', 'paused()', 'Is the game paused right now?'],
    ['random', 'Math', 'random(1, 10)', 'Random number (whole if both ends are whole).'],
    ['abs', 'Math', 'abs(n)', 'Absolute value.'],
    ['round', 'Math', 'round(n)', 'Round to nearest whole number.'],
    ['floor', 'Math', 'floor(n)', 'Round down.'],
    ['ceil', 'Math', 'ceil(n)', 'Round up.'],
    ['sqrt', 'Math', 'sqrt(n)', 'Square root.'],
    ['sin', 'Math', 'sin(deg)', 'Sine (degrees).'],
    ['cos', 'Math', 'cos(deg)', 'Cosine (degrees).'],
    ['min', 'Math', 'min(a, b)', 'Smaller value.'],
    ['max', 'Math', 'max(a, b)', 'Bigger value.'],
    ['clamp', 'Math', 'clamp(v, lo, hi)', 'Keep a value between two limits.'],
    ['lerp', 'Math', 'lerp(a, b, t)', 'Blend from a to b.'],
    ['join', 'Data', 'join("a", "b")', 'Stick text together.'],
    ['length', 'Data', 'length("text")', 'Number of letters.'],
    ['obj', 'Data', 'obj("Big Rock").x', 'Refer to an object whose name has spaces.']
  ].map(function (r) { return { fn: r[0], cat: r[1], example: r[2], doc: r[3] }; });

  A.PROPERTIES = ['x', 'y', 'z', 'rotation', 'rx', 'ry', 'rz', 'scale', 'sx', 'sy', 'sz', 'w', 'h',
    'vx', 'vy', 'vz', 'alpha', 'visible', 'color', 'text', 'name', 'image', 'font', 'fontSize', 'bold', 'glow', 'pitch', 'body', 'pickable', 'shirt', 'pants', 'skin', 'hat'];

  A.EVENTS = {
    start:        { label: 'When game starts', icon: '⚑' },
    update:       { label: 'Every frame', icon: '⟳' },
    key_pressed:  { label: 'When key {p} is pressed', icon: '⌨', param: 'key', def: 'space' },
    key_released: { label: 'When key {p} is released', icon: '⌨', param: 'key', def: 'space' },
    clicked:      { label: 'When this is clicked', icon: '🖱' },
    mouse_click:  { label: 'When the mouse is clicked (anywhere)', icon: '🖱' },
    collide:      { label: 'When touching {p}', icon: '💥', param: 'obj', def: 'any' },
    every:        { label: 'Every {p} seconds', icon: '⏲', param: 'num', def: '1' },
    message:      { label: 'When I receive {p}', icon: '📨', param: 'msg', def: 'go' },
    never:        { label: 'Unused (never runs)', icon: '⊘' }
  };

  A.KEYS = ['space', 'left', 'right', 'up', 'down', 'enter', 'shift', 'escape', 'any'].concat(
    'abcdefghijklmnopqrstuvwxyz'.split(''), '0123456789'.split(''));
  A.BUILTIN_SOUNDS = ['jump', 'coin', 'hit', 'explode', 'laser', 'powerup', 'click'];

  A.STRUCTS = {
    if:      { label: 'if … then', cat: 'Control', icon: '◇' },
    repeat:  { label: 'repeat N times', cat: 'Control', icon: '⟲' },
    while:   { label: 'repeat while …', cat: 'Control', icon: '⟲' },
    forever: { label: 'forever', cat: 'Control', icon: '∞' },
    set:     { label: 'set variable', cat: 'Data', icon: '▭' },
    comment: { label: 'note', cat: 'Data', icon: '✎' }
  };

  // ---------------------------------------------------------------- factory
  A.newStmt = function (kind, fn) {
    const id = A.uid();
    switch (kind) {
      case 'call': {
        const a = A.ACTIONS[fn];
        return { id: id, t: 'call', fn: fn, args: a.args.filter(function (x) { return !x.only3d; }).map(function (x) { return x.def; }) };
      }
      case 'set': return { id: id, t: 'set', target: 'score', op: '+=', value: '1' };
      case 'if': return { id: id, t: 'if', cond: 'key_down("space")', then: [], else: [] };
      case 'repeat': return { id: id, t: 'repeat', count: '10', body: [] };
      case 'while': return { id: id, t: 'while', cond: 'y < 100', body: [] };
      case 'forever': return { id: id, t: 'forever', body: [] };
      case 'comment': return { id: id, t: 'comment', text: 'a note to yourself' };
    }
    throw new Error('unknown stmt kind ' + kind);
  };
  A.newScript = function (event, param) {
    const ev = A.EVENTS[event];
    return { id: A.uid(), event: event, param: param != null ? String(param) : (ev && ev.def) || '', x: 40, y: 40, body: [] };
  };

  A.cloneStmt = function (s) {
    const c = JSON.parse(JSON.stringify(s));
    (function reid(n) {
      n.id = A.uid();
      ['then', 'else', 'body'].forEach(function (k) { if (n[k]) n[k].forEach(reid); });
    })(c);
    return c;
  };

  // ---------------------------------------------------------------- tokenizer + expression parser
  function ParseError(msg, pos) { this.message = msg; this.pos = pos; }
  ParseError.prototype = Object.create(Error.prototype);
  A.ParseError = ParseError;

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      const s = i;
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        while (i < src.length && /[0-9.]/.test(src[i])) i++;
        const txt = src.slice(s, i);
        if ((txt.match(/\./g) || []).length > 1) throw new ParseError('bad number "' + txt + '"', s);
        toks.push({ k: 'num', v: parseFloat(txt), s: s, e: i });
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
        toks.push({ k: 'id', v: src.slice(s, i), s: s, e: i });
        continue;
      }
      if (c === '"' || c === "'") {
        i++;
        let out = '';
        while (i < src.length && src[i] !== c) {
          if (src[i] === '\\' && i + 1 < src.length) { const n = src[i + 1]; out += n === 'n' ? '\n' : n; i += 2; continue; }
          out += src[i++];
        }
        if (i >= src.length) throw new ParseError('text is missing its closing quote', s);
        i++;
        toks.push({ k: 'str', v: out, s: s, e: i });
        continue;
      }
      const two = src.substr(i, 2);
      if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '&&', '||'].indexOf(two) >= 0) {
        toks.push({ k: 'op', v: two, s: s, e: i + 2 }); i += 2; continue;
      }
      if ('+-*/%<>=(),.!:'.indexOf(c) >= 0) { toks.push({ k: 'op', v: c, s: s, e: i + 1 }); i++; continue; }
      throw new ParseError('unexpected character "' + c + '"', i);
    }
    toks.push({ k: 'eof', v: '', s: src.length, e: src.length });
    return toks;
  }

  const BIN = { 'or': 1, '||': 1, 'and': 2, '&&': 2, '==': 4, '!=': 4, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

  function parseExprTokens(toks, src) {
    let p = 0;
    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function isOp(v) { const t = toks[p]; return (t.k === 'op' || t.k === 'id') && t.v === v; }
    function expect(v) {
      if (!isOp(v)) throw new ParseError('expected "' + v + '"' + (peek().k === 'eof' ? ' at the end' : ' but found "' + peek().v + '"'), peek().s);
      return next();
    }
    function primary() {
      const t = next();
      let n;
      if (t.k === 'num') n = { k: 'num', v: t.v, s: t.s, e: t.e };
      else if (t.k === 'str') n = { k: 'str', v: t.v, s: t.s, e: t.e };
      else if (t.k === 'id') {
        if (t.v === 'true' || t.v === 'false') n = { k: 'bool', v: t.v === 'true', s: t.s, e: t.e };
        else if (t.v === 'not') { const a = expr(3); return{ k: 'un', op: 'not', a: a, s: t.s, e: a.e }; }
        else n = { k: 'id', name: t.v, s: t.s, e: t.e };
      } else if (t.k === 'op' && t.v === '(') {
        const inner = expr(0);
        const close = expect(')');
        n = inner; n.s = t.s; n.e = close.e; n.paren = true;
      } else if (t.k === 'eof') throw new ParseError('something is missing here', t.s);
      else throw new ParseError('unexpected "' + t.v + '"', t.s);
      // postfix: call / member
      for (;;) {
        if (isOp('(') && n.k === 'id') {
          next();
          const args = [];
          if (!isOp(')')) {
            for (;;) { args.push(expr(0)); if (isOp(',')) { next(); continue; } break; }
          }
          const close = expect(')');
          n = { k: 'call', fn: n.name, args: args, s: n.s, e: close.e };
        } else if (isOp('.')) {
          next();
          const pt = next();
          if (pt.k !== 'id') throw new ParseError('expected a property name after "."', pt.s);
          n = { k: 'mem', obj: n, prop: pt.v, s: n.s, e: pt.e };
        } else break;
      }
      return n;
    }
    function unary(prec) {
      const t = peek();
      if (t.k === 'op' && (t.v === '-' || t.v === '!')) {
        next(); const a = unary(7);
        return { k: 'un', op: t.v === '!' ? 'not' : '-', a: a, s: t.s, e: a.e };
      }
      return primary();
    }
    function expr(minPrec) {
      let left = unary();
      for (;;) {
        const t = peek();
        const prec = (t.k === 'op' || t.k === 'id') && Object.prototype.hasOwnProperty.call(BIN, t.v) ? BIN[t.v] : undefined;
        if (prec === undefined || prec < minPrec) break;
        next();
        const right = expr(prec + 1);
        left = { k: 'bin', op: t.v === '&&' ? 'and' : t.v === '||' ? 'or' : t.v, a: left, b: right, s: left.s, e: right.e };
      }
      return left;
    }
    const n = expr(0);
    if (peek().k !== 'eof') {
      const t = peek();
      if (t.v === '=') throw new ParseError('use "==" to compare (a single "=" is for setting variables)', t.s);
      throw new ParseError('unexpected "' + t.v + '"', t.s);
    }
    return n;
  }

  A.parseExpr = function (src) {
    src = String(src == null ? '' : src);
    if (!src.trim()) throw new ParseError('empty value', 0);
    return parseExprTokens(tokenize(src), src);
  };

  A.checkExpr = function (src) {
    try { A.parseExpr(src); return null; } catch (e) { return e.message; }
  };

  // ---------------------------------------------------------------- expression compiler
  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  function truthy(v) {
    if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
    return !!v;
  }
  function eq(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
    if (a && a.__inst || b && b.__inst) return a === b;
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb) && String(na) === String(a).trim() && String(nb) === String(b).trim()) return na === nb;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }
  A.num = num; A.truthy = truthy; A.eq = eq;

  function compileNode(n) {
    switch (n.k) {
      case 'num': case 'str': case 'bool': { const v = n.v; return function () { return v; }; }
      case 'id': { const nm = n.name; return function (c) { return c.get(nm); }; }
      case 'mem': {
        const p = n.prop;
        if (n.obj.k === 'id') {
          const oname = n.obj.name;
          return function (c) { return c.member(c.ref(oname), p); };
        }
        const o = compileNode(n.obj);
        return function (c) { return c.member(o(c), p); };
      }
      case 'call': {
        const fn = n.fn, as = n.args.map(compileNode);
        return function (c) {
          const vals = new Array(as.length);
          for (let i = 0; i < as.length; i++) vals[i] = as[i](c);
          return c.call(fn, vals);
        };
      }
      case 'un': {
        const a = compileNode(n.a);
        if (n.op === '-') return function (c) { return -num(a(c)); };
        return function (c) { return !truthy(a(c)); };
      }
      case 'bin': {
        const a = compileNode(n.a), b = compileNode(n.b);
        switch (n.op) {
          case '+': return function (c) {
            const x = a(c), y = b(c);
            if (typeof x === 'string' && (x.trim() === '' || isNaN(Number(x))) || typeof y === 'string' && (y.trim() === '' || isNaN(Number(y)))) return String(x) + String(y);
            return num(x) + num(y);
          };
          case '-': return function (c) { return num(a(c)) - num(b(c)); };
          case '*': return function (c) { return num(a(c)) * num(b(c)); };
          case '/': return function (c) { const d = num(b(c)); return d === 0 ? 0 : num(a(c)) / d; };
          case '%': return function (c) { const d = num(b(c)); if (d === 0) return 0; const r = num(a(c)) % d; return r < 0 ? r + Math.abs(d) : r; };
          case '<': return function (c) { return num(a(c)) < num(b(c)); };
          case '>': return function (c) { return num(a(c)) > num(b(c)); };
          case '<=': return function (c) { return num(a(c)) <= num(b(c)); };
          case '>=': return function (c) { return num(a(c)) >= num(b(c)); };
          case '==': return function (c) { return eq(a(c), b(c)); };
          case '!=': return function (c) { return !eq(a(c), b(c)); };
          case 'and': return function (c) { return truthy(a(c)) && truthy(b(c)); };
          case 'or': return function (c) { return truthy(a(c)) || truthy(b(c)); };
        }
      }
    }
    throw new Error('cannot compile ' + n.k);
  }

  const exprCache = new Map();
  A.compileExpr = function (src) {
    src = String(src == null ? '' : src);
    let f = exprCache.get(src);
    if (f) return f;
    try {
      f = compileNode(A.parseExpr(src));
    } catch (e) {
      const msg = e.message;
      f = function () { throw new Error('Problem in "' + src + '": ' + msg); };
    }
    if (exprCache.size > 5000) exprCache.clear();
    exprCache.set(src, f);
    return f;
  };

  // ---------------------------------------------------------------- labels (for Flow / Blocks / help)
  A.fillLabel = function (label, values) {
    return label.replace(/\{(\w+)\}/g, function (_, k) { return values[k] != null ? values[k] : ''; });
  };
  A.prettyArg = function (src) {
    // show plain strings without quotes in labels
    const m = /^\s*"([^"\\]*)"\s*$/.exec(src || '');
    return m ? m[1] : (src || '');
  };
  A.eventLabel = function (sc) {
    const ev = A.EVENTS[sc.event] || { label: sc.event };
    return ev.label.replace('{p}', sc.param || '');
  };
  A.setLabel = function (s) {
    switch (s.op) {
      case '+=': return 'add ' + s.value + ' to ' + s.target;
      case '-=': return 'take ' + s.value + ' from ' + s.target;
      case '*=': return 'multiply ' + s.target + ' by ' + s.value;
      case '/=': return 'divide ' + s.target + ' by ' + s.value;
      default: return 'set ' + s.target + ' to ' + s.value;
    }
  };
  A.stmtLabel = function (s) {
    switch (s.t) {
      case 'call': {
        const a = A.ACTIONS[s.fn];
        if (!a) return s.fn + '(' + s.args.join(', ') + ')';
        const vals = {};
        a.args.forEach(function (d, i) { vals[d.n] = A.prettyArg(s.args[i] != null ? s.args[i] : d.def); });
        let txt = A.fillLabel(a.label, vals);
        // append extra 3D args when present
        a.args.forEach(function (d, i) { if (d.only3d && s.args[i] != null) txt += ', ' + A.prettyArg(s.args[i]); });
        return txt;
      }
      case 'set': return A.setLabel(s);
      case 'if': return s.cond + ' ?';
      case 'repeat': return 'repeat ' + s.count + ' times';
      case 'while': return 'while ' + s.cond;
      case 'forever': return 'forever';
      case 'comment': return s.text;
    }
    return '?';
  };
  A.stmtCategory = function (s) {
    if (s.t === 'call') return (A.ACTIONS[s.fn] || {}).cat || 'Control';
    if (s.t === 'set' || s.t === 'comment') return 'Data';
    return 'Control';
  };

  // ---------------------------------------------------------------- text printer
  function quoteParam(sc) {
    const ev = A.EVENTS[sc.event];
    if (!ev || !ev.param) return '';
    const p = sc.param == null ? '' : String(sc.param);
    if (ev.param === 'num') return ' ' + (p || '1');
    return ' "' + p.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  function printList(list, ind, out) {
    if (!list || !list.length) { out.push(ind + 'pass'); return; }
    list.forEach(function (s) { printStmt(s, ind, out); });
  }
  function printStmt(s, ind, out) {
    const I = '    ';
    switch (s.t) {
      case 'call': out.push(ind + s.fn + '(' + s.args.join(', ') + ')'); break;
      case 'set': out.push(ind + s.target + ' ' + s.op + ' ' + s.value); break;
      case 'comment': out.push(ind + '# ' + s.text); break;
      case 'repeat': out.push(ind + 'repeat ' + s.count + ':'); printList(s.body, ind + I, out); break;
      case 'while': out.push(ind + 'while ' + s.cond + ':'); printList(s.body, ind + I, out); break;
      case 'forever': out.push(ind + 'forever:'); printList(s.body, ind + I, out); break;
      case 'if': {
        let cur = s, first = true;
        for (;;) {
          out.push(ind + (first ? 'if ' : 'elif ') + cur.cond + ':');
          printList(cur.then, ind + I, out);
          first = false;
          const e = cur.else;
          if (e && e.length === 1 && e[0].t === 'if') { cur = e[0]; continue; }
          if (e && e.length) { out.push(ind + 'else:'); printList(e, ind + I, out); }
          break;
        }
        break;
      }
    }
  }
  A.printScripts = function (scripts) {
    const out = [];
    (scripts || []).forEach(function (sc, i) {
      if (i) out.push('');
      out.push('when ' + sc.event + quoteParam(sc) + ':');
      printList(sc.body, '    ', out);
    });
    return out.join('\n') + (out.length ? '\n' : '');
  };

  // ---------------------------------------------------------------- text parser
  function stripComment(line) {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '#') return line.slice(0, i);
    }
    return line;
  }
  function editDistance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  A.suggest = function (name, list) {
    let best = null, bd = 3;
    list.forEach(function (n) { const d = editDistance(name, n); if (d < bd) { bd = d; best = n; } });
    return best;
  };

  A.parseText = function (src, oldScripts) {
    const raw = String(src).replace(/\t/g, '    ').split(/\r?\n/);
    const items = [];
    raw.forEach(function (line, i) {
      const trimmed = line.trim();
      if (!trimmed) return;
      const indent = line.length - line.replace(/^ +/, '').length;
      if (trimmed[0] === '#') { items.push({ indent: indent, text: trimmed, line: i + 1, comment: trimmed.slice(1).trim() }); return; }
      const code = stripComment(line).trim();
      if (code) items.push({ indent: indent, text: code, line: i + 1 });
    });
    let p = 0;
    function fail(it, msg) { const e = new Error(msg); e.line = it ? it.line : raw.length; throw e; }
    function exprCheck(it, src) {
      try { A.parseExpr(src); } catch (e) { fail(it, e.message + ' in "' + src + '"'); }
      return src.trim();
    }
    function header(it, kw) {
      if (it.text[it.text.length - 1] !== ':') fail(it, 'a "' + kw + '" line must end with ":"');
      return it.text.slice(kw.length, -1).trim();
    }
    function block(parentIt, parentIndent) {
      if (p >= items.length || items[p].indent <= parentIndent) fail(items[p] || parentIt, 'expected an indented block after line ' + parentIt.line + ' (use "pass" for empty)');
      const ind = items[p].indent;
      const list = [];
      while (p < items.length && items[p].indent >= ind) {
        if (items[p].indent > ind) fail(items[p], 'unexpected indentation');
        const s = stmt(ind);
        if (s) list.push(s);
      }
      return list;
    }
    function stmt(ind) {
      const it = items[p++];
      const tx = it.text;
      if (it.comment != null) return { id: A.uid(), t: 'comment', text: it.comment };
      const kw = (/^[A-Za-z_]+/.exec(tx) || [''])[0];
      if (kw === 'when') fail(it, '"when" must start at the left edge (not inside another script)');
      if (kw === 'pass' && tx === 'pass') return null;
      if (kw === 'if') {
        const s = { id: A.uid(), t: 'if', cond: exprCheck(it, header(it, 'if')), then: block(it, ind), else: [] };
        let cur = s;
        while (p < items.length && items[p].indent === ind && /^(elif|else)\b/.test(items[p].text)) {
          const e = items[p++];
          if (/^elif\b/.test(e.text)) {
            const n = { id: A.uid(), t: 'if', cond: exprCheck(e, header(e, 'elif')), then: block(e, ind), else: [] };
            cur.else = [n]; cur = n;
          } else {
            if (header(e, 'else') !== '') fail(e, 'write "else:" on its own');
            cur.else = block(e, ind);
            break;
          }
        }
        return s;
      }
      if (kw === 'elif' || kw === 'else') fail(it, '"' + kw + '" without a matching "if" above it');
      if (kw === 'repeat') return { id: A.uid(), t: 'repeat', count: exprCheck(it, header(it, 'repeat')), body: block(it, ind) };
      if (kw === 'while') return { id: A.uid(), t: 'while', cond: exprCheck(it, header(it, 'while')), body: block(it, ind) };
      if (kw === 'forever') { if (header(it, 'forever') !== '') fail(it, 'write "forever:" on its own'); return { id: A.uid(), t: 'forever', body: block(it, ind) }; }
      const asg = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*(\+=|-=|\*=|\/=|=)(?!=)\s*(.*)$/.exec(tx);
      if (asg) {
        if (!asg[3].trim()) fail(it, 'missing a value after "' + asg[2] + '"');
        return { id: A.uid(), t: 'set', target: asg[1], op: asg[2], value: exprCheck(it, asg[3]) };
      }
      let n;
      try { n = A.parseExpr(tx); } catch (e) { fail(it, e.message); }
      if (n.k === 'id') {
        if (A.ACTIONS[n.name]) fail(it, 'add brackets: ' + n.name + '()');
        fail(it, 'I don\'t know what to do with "' + tx + '"');
      }
      if (n.k !== 'call') fail(it, 'this line does not do anything: "' + tx + '"');
      if (!A.ACTIONS[n.fn]) {
        const sug = A.suggest(n.fn, Object.keys(A.ACTIONS));
        fail(it, 'unknown action "' + n.fn + '"' + (sug ? ' — did you mean "' + sug + '"?' : ''));
      }
      const max = A.ACTIONS[n.fn].args.length;
      if (n.args.length > max) fail(it, n.fn + '() takes at most ' + max + ' values');
      return { id: A.uid(), t: 'call', fn: n.fn, args: n.args.map(function (a) { return tx.slice(a.s, a.e).trim(); }) };
    }
    const scripts = [];
    while (p < items.length) {
      const it = items[p++];
      if (it.comment != null) continue;
      if (it.indent !== 0) fail(it, 'unexpected indentation — scripts start with "when" at the left edge');
      const m = /^when\s+([A-Za-z_]+)\s*(.*?)\s*:$/.exec(it.text);
      if (!m) fail(it, 'scripts must start with a line like:  when start:');
      if (!A.EVENTS[m[1]]) {
        const sug = A.suggest(m[1], Object.keys(A.EVENTS));
        fail(it, 'unknown event "' + m[1] + '"' + (sug ? ' — did you mean "' + sug + '"?' : '') + '. Events: ' + Object.keys(A.EVENTS).join(', '));
      }
      let param = m[2];
      const ev = A.EVENTS[m[1]];
      if (param) {
        if (!ev.param) fail(it, '"when ' + m[1] + '" does not take a value');
        const q = /^"(.*)"$|^'(.*)'$/.exec(param);
        if (q) param = q[1] != null ? q[1] : q[2];
        else if (ev.param === 'num' && isNaN(parseFloat(param))) fail(it, '"when every" needs a number of seconds');
      } else param = ev.def || '';
      const sc = { id: A.uid(), event: m[1], param: param, x: 40, y: 40, body: [] };
      if (p < items.length && items[p].indent > 0) sc.body = block(it, 0);
      scripts.push(sc);
    }
    // keep canvas positions of scripts that still exist (matched by order + event)
    if (!oldScripts) scripts.forEach(function (sc, i) { sc.x = 40 + i * 400; sc.y = 40; });
    else {
      scripts.forEach(function (sc, i) {
        const o = oldScripts[i];
        if (o) { sc.x = o.x; sc.y = o.y; if (o.event === sc.event) sc.id = o.id; }
        else { sc.x = 40 + i * 30; sc.y = 40 + i * 30; }
      });
    }
    return scripts;
  };

  // ---------------------------------------------------------------- tree helpers
  A.walk = function (list, fn, parent) {
    (list || []).forEach(function (s, i) {
      fn(s, list, i, parent);
      ['then', 'else', 'body'].forEach(function (k) { if (s[k]) A.walk(s[k], fn, s); });
    });
  };
  A.findStmt = function (scripts, id) {
    let found = null;
    (scripts || []).forEach(function (sc) {
      A.walk(sc.body, function (s, list, i) { if (s.id === id) found = { stmt: s, list: list, index: i, script: sc }; });
    });
    return found;
  };
  A.contains = function (s, id) {
    let r = false;
    A.walk([s], function (n) { if (n.id === id) r = true; });
    return r;
  };
})(typeof window !== 'undefined' ? window : globalThis);
