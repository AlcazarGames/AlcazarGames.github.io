/* Starter templates on the home screen. Each one gives you a character you can move right away.
 * group: 'blank' | '2d' | '3d'. Scripts carry # notes so they read well in Flow mode. */
(function (G) {
  'use strict';
  const A = G.Alcazar;
  function obj(props, code) {
    const o = A.makeObject(props);
    if (code) o.scripts = A.parseText(code.replace(/^\n/, ''));
    return o;
  }
  function project(name, scenes, globals, assets) {
    return { format: 'alcazar', version: 1, name: name, width: 960, height: 540, startScene: scenes[0].name, globals: globals || [], assets: assets || {}, scenes: scenes };
  }
  function help(text) {
    return obj({ name: 'Controls', type: 'text', ui: true, x: 0, y: -240, text: text, fontSize: 15, bold: false, color: '#ffffffcc', font: 'Bahnschrift', layer: 9 });
  }

  // the user's own 3D base, kept exactly as it was made
  const BASE_3D = {"format":"alcazar","version":1,"name":"My 3D Game","width":960,"height":540,"startScene":"Main","globals":[],"scenes":[{"name":"Main","mode":"3d","bg":"#8fc6ff","gravity":5,"camera":{"ex":0,"ey":6,"ez":12,"tx":0,"ty":0,"tz":0,"fov":60},"objects":[{"name":"Player","type":"cube","x":124,"y":0.5,"z":-33,"rx":0,"ry":0,"rz":0,"sx":1,"sy":1,"sz":1,"w":48,"h":48,"color":"#9775ea","shape":"rect","image":"","text":"Text","fontSize":28,"font":"Segoe UI","bold":true,"italic":false,"ui":false,"visible":true,"alpha":1,"pickable":true,"body":"dynamic","bounce":0,"gravity":1,"friction":0,"tags":"","template":false,"layer":0,"glow":false,"castShadow":true,"scripts":[{"id":"lbnpp4tpf5","event":"start","param":"","x":40,"y":40,"body":[{"id":"le6txngqp9j","t":"call","fn":"first_person","args":["\"Player\"","0.65"]},{"id":"le6txt7b39k","t":"set","target":"cx","op":"=","value":"x"},{"id":"le6txz2n79l","t":"set","target":"cy","op":"=","value":"y"},{"id":"le6txxa679m","t":"set","target":"cz","op":"=","value":"z"}]},{"id":"lbnpqzoiqa","event":"update","param":"","x":70,"y":70,"body":[{"id":"le6tx5alc9o","t":"call","fn":"mouse_look","args":["0.12"]},{"id":"le6txf8h09p","t":"set","target":"speed","op":"=","value":"8"},{"id":"le6tx992n9q","t":"if","cond":"key_down(\"shift\")","then":[{"id":"le6tx6gk79r","t":"set","target":"speed","op":"=","value":"12"}],"else":[]},{"id":"le6txbj559s","t":"set","target":"forward","op":"=","value":"0"},{"id":"le6txtd409t","t":"set","target":"right","op":"=","value":"0"},{"id":"le6txp0gh9u","t":"if","cond":"key_down(\"w\") or key_down(\"up\")","then":[{"id":"le6txd24v9v","t":"set","target":"forward","op":"=","value":"speed"}],"else":[]},{"id":"le6tx7m0z9w","t":"if","cond":"key_down(\"s\") or key_down(\"down\")","then":[{"id":"le6txil3e9x","t":"set","target":"forward","op":"=","value":"-speed"}],"else":[]},{"id":"le6txdkz29y","t":"if","cond":"key_down(\"d\") or key_down(\"right\")","then":[{"id":"le6txe9449z","t":"set","target":"right","op":"=","value":"speed"}],"else":[]},{"id":"le6txfwu7a0","t":"if","cond":"key_down(\"a\") or key_down(\"left\")","then":[{"id":"le6txjzxna1","t":"set","target":"right","op":"=","value":"-speed"}],"else":[]},{"id":"le6tx3cnca2","t":"if","cond":"running == 2","then":[{"id":"le6txo3oma3","t":"set","target":"forward","op":"=","value":"0"},{"id":"le6txa0uea4","t":"set","target":"right","op":"=","value":"0"}],"else":[]},{"id":"le6txf7eua5","t":"call","fn":"walk","args":["forward","right"]},{"id":"le6txmcjla6","t":"if","cond":"on_ground() and key_pressed(\"space\")","then":[{"id":"le6tx9piba7","t":"call","fn":"jump","args":["9"]}],"else":[]},{"id":"le6txufhea8","t":"if","cond":"y \u003c -8","then":[{"id":"le6txui8sa9","t":"set","target":"falls","op":"+=","value":"1"},{"id":"le6txmgwbaa","t":"call","fn":"go_to","args":["cx","cy","cz"]},{"id":"le6txweulab","t":"call","fn":"set_velocity","args":["0","0","0"]}],"else":[]}]},{"id":"lbnpsymqo11","event":"key_pressed","param":"r","x":100,"y":100,"body":[{"id":"le6txbt41ad","t":"call","fn":"restart_scene","args":[]}]}],"id":"lbizcejvv2"},{"name":"Island","type":"terrain","x":178,"y":0,"z":121.5,"rx":0,"ry":0,"rz":0,"sx":500,"sy":70,"sz":500,"w":48,"h":48,"color":"#ffffff","shape":"rect","image":"","text":"Text","fontSize":28,"font":"Segoe UI","bold":true,"italic":false,"ui":false,"visible":true,"alpha":1,"pickable":true,"body":"none","bounce":0,"gravity":1,"friction":0,"tags":"","template":false,"layer":0,"glow":false,"castShadow":true,"scripts":[],"tseed":314,"tres":200,"id":"leqcqdjolae"}],"sky":true,"timeOfDay":2,"clouds":0.45,"fogDensity":0,"shadowSize":60}],"assets":{}};

  const S = A.SAMPLES = {};

  // ------------------------------------------------------------------ blank
  S.blank2d = {
    group: 'blank', title: 'Empty 2D game', desc: 'A blank 2D scene with one object to start from.', mode: '2d',
    make: function () {
      return project('My 2D Game', [{
        name: 'Main', mode: '2d', bg: '#1f2a3d', gravity: 1400, camera: { x: 0, y: 0, zoom: 1 },
        objects: [obj({ name: 'Player', w: 64, h: 64, color: '#9775ea', shape: 'rounded', eyes: true }, `
when key_pressed "space":
    say("Hello, world!", 2)
    play_sound("coin")
`)]
      }]);
    }
  };
  S.blank3d = {
    group: 'blank', title: 'Empty 3D game', desc: 'A 3D world with a floor, a cube and sunlight.', mode: '3d',
    make: function () {
      return project('My 3D Game', [{
        name: 'Main', mode: '3d', bg: '#8fc6ff', gravity: 25, camera: { ex: 0, ey: 6, ez: 12, tx: 0, ty: 0, tz: 0, fov: 60 },
        objects: [
          obj({ name: 'Floor', type: 'plane', sx: 30, sz: 30, color: '#6cbf6a', body: 'solid' }),
          obj({ name: 'Cube', type: 'cube', y: 0.5, color: '#9775ea' }, `
when update:
    turn(1)
`)
        ]
      }]);
    }
  };

  // ------------------------------------------------------------------ 2D starters
  S.platformer2d = {
    group: '2d', title: 'Platformer', desc: 'Run and jump across platforms. Collect the coins.', controls: 'Arrows / A D to run, Space to jump', mode: '2d',
    make: function () {
      const o = [];
      o.push(obj({ name: 'Ground', y: -250, w: 2400, h: 60, color: '#3b8f4a', body: 'solid' }));
      [[220, -110, 180], [480, 0, 160], [-280, -60, 180], [760, 90, 160]].forEach(function (p, i) {
        o.push(obj({ name: 'Platform ' + (i + 1), x: p[0], y: p[1], w: p[2], h: 24, color: '#56606e', shape: 'rounded', body: 'solid' }));
      });
      [[220, -60], [480, 50], [-280, -10], [760, 140]].forEach(function (p) {
        o.push(obj({ name: 'Coin', tags: 'coin', x: p[0], y: p[1], w: 28, h: 28, color: '#ffd84d', shape: 'star' }, `
when update:
    turn(3)

when collide "Player":
    score += 1
    play_sound("coin")
    burst(10, "#ffd84d")
    destroy()
`));
      });
      o.push(obj({ name: 'Player', y: -150, w: 44, h: 56, color: '#9775ea', shape: 'rounded', eyes: true, body: 'dynamic', layer: 2 }, `
when start:
    # the camera chases the player around the level
    camera_follow("Player")

when update:
    # run left and right
    vx = 0
    if key_down("left") or key_down("a"):
        vx = -300
    if key_down("right") or key_down("d"):
        vx = 300
    # jump, but only when standing on something
    if on_ground() and (key_pressed("space") or key_pressed("up") or key_pressed("w")):
        jump(780)
        play_sound("jump")
    # fell off the world? try again
    if y < -700:
        restart_scene()
`));
      o.push(obj({ name: 'Score', type: 'text', ui: true, x: -380, y: 235, text: 'Coins: {score}', color: '#ffffff', fontSize: 24 }));
      o.push(help('Arrows or A / D to run  ·  Space to jump'));
      return project('My Platformer', [{ name: 'Level 1', mode: '2d', bg: '#2a3550', gravity: 1500, camera: { x: 0, y: 0, zoom: 1 }, objects: o }], [{ name: 'score', value: 0 }]);
    }
  };

  S.topdown2d = {
    group: '2d', title: 'Top-down adventure', desc: 'Walk around a room in any direction, like a classic RPG.', controls: 'Arrows / WASD to walk', mode: '2d',
    make: function () {
      const o = [];
      o.push(obj({ name: 'Floor', w: 1100, h: 700, color: '#2e3b2f', layer: -2 }));
      [[0, 360, 1140, 40], [0, -360, 1140, 40], [-560, 0, 40, 760], [560, 0, 40, 760], [-150, 120, 40, 280], [200, -140, 360, 40]].forEach(function (w, i) {
        o.push(obj({ name: 'Wall ' + (i + 1), x: w[0], y: w[1], w: w[2], h: w[3], color: '#6b5d4d', body: 'solid' }));
      });
      [[-380, 220], [380, 240], [-420, -230], [420, -40]].forEach(function (p) {
        o.push(obj({ name: 'Bush', x: p[0], y: p[1], w: 70, h: 70, color: '#3f8f4a', shape: 'circle', body: 'solid' }));
      });
      o.push(obj({ name: 'Gem', tags: 'gem', x: 380, y: -230, w: 32, h: 32, color: '#4de1ff', shape: 'star' }, `
when collide "Player":
    play_sound("powerup")
    burst(20, "#4de1ff")
    say("You found the gem!", 2)
    hide()
`));
      o.push(obj({ name: 'Villager', x: 60, y: 200, w: 46, h: 46, color: '#ffb347', shape: 'rounded', eyes: true, body: 'solid' }, `
when collide "Player":
    say("Hi! There's a gem in the bottom-right corner.", 3)
`));
      o.push(obj({ name: 'Player', x: -300, y: 0, w: 42, h: 42, color: '#9775ea', shape: 'rounded', eyes: true, body: 'dynamic', gravity: 0, layer: 2 }, `
when start:
    camera_follow("Player")

when update:
    # move in any direction; gravity is 0 so nothing falls
    vx = 0
    vy = 0
    if key_down("left") or key_down("a"):
        vx = -240
    if key_down("right") or key_down("d"):
        vx = 240
    if key_down("up") or key_down("w"):
        vy = 240
    if key_down("down") or key_down("s"):
        vy = -240
`));
      o.push(help('Arrows or WASD to walk  ·  Bump into the villager to talk'));
      return project('My Adventure', [{ name: 'Room', mode: '2d', bg: '#1a221b', gravity: 0, camera: { x: 0, y: 0, zoom: 1 }, objects: o }]);
    }
  };

  S.shooter2d = {
    group: '2d', title: 'Space shooter', desc: 'Fly a ship, shoot falling asteroids, keep score.', controls: 'Arrows / WASD to fly, Space to fire', mode: '2d',
    make: function () {
      const o = [];
      for (let i = 0; i < 40; i++) o.push(obj({ name: 'Star', x: Math.round(Math.random() * 940 - 470), y: Math.round(Math.random() * 520 - 260), w: 3, h: 3, color: '#ffffff', alpha: 0.4 + Math.random() * 0.5, shape: 'circle', layer: -3 }));
      o.push(obj({ name: 'Laser', template: true, w: 6, h: 26, color: '#7fd1ff', shape: 'rounded' }, `
when start:
    vy = 900
    wait(1)
    destroy()
`));
      o.push(obj({ name: 'Asteroid', tags: 'asteroid', template: true, w: 54, h: 54, color: '#8b857c', shape: 'circle' }, `
when start:
    vy = -random(120, 260)
    vx = random(-40, 40)
    wait(6)
    destroy()

when update:
    turn(2)

when collide "Laser":
    score += 10
    burst(16, "#ffb347")
    play_sound("hit")
    remove(other)
    destroy()

when collide "Ship":
    lives -= 1
    camera_shake(10, 0.3)
    play_sound("explode")
    destroy()
`));
      o.push(obj({ name: 'Ship', y: -200, w: 50, h: 56, color: '#9775ea', shape: 'triangle', layer: 2 }, `
when update:
    # fly in every direction and stay on screen
    if key_down("left") or key_down("a"):
        x -= 380 * dt
    if key_down("right") or key_down("d"):
        x += 380 * dt
    if key_down("up") or key_down("w"):
        y += 300 * dt
    if key_down("down") or key_down("s"):
        y -= 300 * dt
    keep_on_screen()
    if lives <= 0:
        say("Game over! Press R", 0)
        hide()

when key_pressed "space":
    if lives > 0:
        spawn("Laser", x, y + 34)
        play_sound("laser")

when key_pressed "r":
    lives = 3
    score = 0
    restart_scene()
`));
      o.push(obj({ name: 'Spawner', type: 'text', ui: true, text: '', visible: false }, `
when start:
    lives = 3

when every 0.9:
    if lives > 0:
        spawn("Asteroid", random(-440, 440), 320)
`));
      o.push(obj({ name: 'HUD', type: 'text', ui: true, x: -340, y: 240, text: 'Score {score}     Lives {lives}', color: '#ffffff', fontSize: 22 }));
      o.push(help('Arrows or WASD to fly  ·  Space to fire'));
      return project('My Space Shooter', [{ name: 'Space', mode: '2d', bg: '#0b0e1a', gravity: 0, camera: { x: 0, y: 0, zoom: 1 }, objects: o }], [{ name: 'score', value: 0 }, { name: 'lives', value: 3 }]);
    }
  };

  // ------------------------------------------------------------------ 3D starters
  S.firstperson3d = {
    group: '3d', title: 'First-person explorer', desc: 'Your 3d_base: explore an island in first person.', controls: 'Click, then WASD + mouse, Shift sprint, Space jump', mode: '3d',
    make: function () { return JSON.parse(JSON.stringify(BASE_3D)); }
  };

  S.thirdperson3d = {
    group: '3d', title: 'Third-person', desc: 'A wobbly ragdoll hero with an over-the-shoulder camera.', controls: 'Click, then WASD + mouse, Shift run, Space jump', mode: '3d',
    make: function () {
      const o = [];
      o.push(obj({ name: 'Ground', type: 'plane', sx: 120, sz: 120, color: '#6cbf6a', body: 'solid' }));
      o.push(obj({ name: 'Trees', type: 'scatter', smesh: 'tree', sx: 110, sy: 1, sz: 110, scount: 60, ssize: 6, shmin: -1, color: '#ffffff', body: 'solid', pickable: false, sclear: [[0, 0, 14]] }));
      o.push(obj({ name: 'Rocks', type: 'scatter', smesh: 'rock', sx: 110, sy: 1, sz: 110, scount: 40, ssize: 1.8, svar: 0.6, shmin: -1, sseed: 4, color: '#ffffff', body: 'solid', pickable: false, sclear: [[0, 0, 10]] }));
      [[6, 1, -6, 2, 2, 2], [9, 2, -8, 2, 4, 2], [-7, 0.5, 4, 4, 1, 4]].forEach(function (b, i) {
        o.push(obj({ name: 'Block ' + (i + 1), type: 'cube', x: b[0], y: b[1], z: b[2], sx: b[3], sy: b[4], sz: b[5], color: '#b9acdf', body: 'solid' }));
      });
      o.push(obj({ name: 'Player', type: 'ragdoll', y: 1, z: 4, body: 'dynamic', color: '#ffffff', shirt: '#9775ea', pants: '#2f3f6b', skin: '#f1c27d', stumble: false }, `
when start:
    # camera behind the shoulder; click the game to use the mouse
    third_person("Player", 6, 1.6, 0.7)

when update:
    mouse_look(0.12)
    speed = 6
    if key_down("shift"):
        speed = 11
    forward = 0
    right = 0
    if key_down("w") or key_down("up"):
        forward = speed
    if key_down("s") or key_down("down"):
        forward = -speed
    if key_down("d") or key_down("right"):
        right = speed
    if key_down("a") or key_down("left"):
        right = -speed
    walk(forward, right)
    if on_ground() and key_pressed("space"):
        jump(9)
        play_sound("jump")

when key_pressed "q":
    # just for fun: fall over
    flop(1.5)
`));
      o.push(help('Click to use the mouse  ·  WASD move  ·  Shift run  ·  Space jump  ·  Q flop'));
      return project('My Third-Person Game', [{ name: 'Main', mode: '3d', bg: '#8fc6ff', gravity: 25, sky: true, timeOfDay: 15.5, clouds: 0.4, fogDensity: 0.006, shadowSize: 40,
        camera: { ex: 0, ey: 4, ez: 12, tx: 0, ty: 1, tz: 0, fov: 65 }, objects: o }]);
    }
  };

  S.topdown3d = {
    group: '3d', title: 'Top-down 3D', desc: 'Fixed camera from above. Push crates around and kick a ball.', controls: 'WASD to walk, Shift run, E grab/drop, F throw', mode: '3d',
    make: function () {
      const o = [];
      o.push(obj({ name: 'Floor', type: 'cube', y: -0.25, sx: 30, sy: 0.5, sz: 22, color: '#d8cfbe', body: 'solid' }));
      [[0, -11.2, 30.4, 0.4], [0, 11.2, 30.4, 0.4], [-15.2, 0, 0.4, 22], [15.2, 0, 0.4, 22]].forEach(function (w, i) {
        o.push(obj({ name: 'Wall ' + (i + 1), type: 'cube', x: w[0], y: 0.75, z: w[1], sx: w[2], sy: 1.5, sz: w[3], color: '#9775ea', body: 'solid' }));
      });
      [[-5, -3], [-3.6, -3], [-4.3, -1.6], [6, 4]].forEach(function (p, i) {
        o.push(obj({ name: 'Crate ' + (i + 1), tags: 'item', type: 'cube', x: p[0], y: 0.5, z: p[1], color: '#c8a27a', body: 'dynamic' }));
      });
      o.push(obj({ name: 'Ball', tags: 'item', type: 'sphere', x: 4, y: 1, z: -3, sx: 0.9, sy: 0.9, sz: 0.9, color: '#ff4d6d', body: 'dynamic', bounce: 0.6 }));
      o.push(obj({ name: 'Goal', type: 'cube', x: 0, y: 0.03, z: -9, sx: 4, sy: 0.06, sz: 2, color: '#3ccf7a', glow: true, alpha: 0.7 }, `
when collide "Ball":
    say("GOAL!", 2)
    play_sound("powerup")
    burst(40, "#3ccf7a")
`));
      o.push(obj({ name: 'Player', type: 'ragdoll', y: 1, z: 5, body: 'dynamic', color: '#ffffff', shirt: '#3a86ff', pants: '#2b2b33', skin: '#f1c27d', hat: '#ffd23f' }, `
when start:
    # the camera keeps the same angle and follows you
    camera_follow("Player")

when update:
    # WASD moves you up/down/left/right on screen
    dx = 0
    dz = 0
    if key_down("w") or key_down("up"):
        dz = -1
    if key_down("s") or key_down("down"):
        dz = 1
    if key_down("a") or key_down("left"):
        dx = -1
    if key_down("d") or key_down("right"):
        dx = 1
    speed = 5.5
    if key_down("shift"):
        speed = 9
    if dx != 0 or dz != 0:
        rotation = atan2(-dx, -dz)
        walk(speed, 0)
    else:
        walk(0, 0)

when key_pressed "e":
    if held() == 0:
        grab("item", 1.8)
    else:
        drop()

when key_pressed "f":
    throw_held(10)
`));
      o.push(help('WASD walk  ·  Shift run  ·  E grab / drop  ·  F throw  ·  Get the ball into the green goal'));
      return project('My Top-down 3D Game', [{ name: 'Main', mode: '3d', bg: '#f2e8d5', gravity: 25, ambient: 0.55,
        camera: { ex: 0, ey: 11, ez: 9, tx: 0, ty: 0, tz: 0, fov: 55 }, objects: o }]);
    }
  };

  S.driving3d = {
    group: '3d', title: 'Driving', desc: 'Drive a little car around an island with a chase camera.', controls: 'W / S accelerate and brake, A / D steer, Shift boost', mode: '3d',
    make: function () {
      const car = A.boxModel([
        { color: '#e04a3a', boxes: [[0, 0.45, 0, 1.8, 0.5, 3.6], [0, 0.95, 0.2, 1.5, 0.5, 1.8]] },
        { color: '#9fd3ff', boxes: [[0, 0.98, -0.72, 1.4, 0.38, 0.04], [0, 0.98, 1.12, 1.4, 0.36, 0.04]] },
        { color: '#222222', boxes: [[-0.95, 0.35, -1.15, 0.3, 0.7, 0.7], [0.95, 0.35, -1.15, 0.3, 0.7, 0.7], [-0.95, 0.35, 1.15, 0.3, 0.7, 0.7], [0.95, 0.35, 1.15, 0.3, 0.7, 0.7]] },
        { color: '#ffe9a8', glow: true, boxes: [[-0.6, 0.5, -1.81, 0.36, 0.18, 0.03], [0.6, 0.5, -1.81, 0.36, 0.18, 0.03]] }
      ]);
      const o = [];
      o.push(obj({ name: 'Island', type: 'terrain', sx: 420, sy: 26, sz: 420, tseed: 21, tres: 180, tfeature: 1.6, color: '#ffffff' }));
      o.push(obj({ name: 'Sea', type: 'plane', sx: 3000, sz: 3000, color: '#0f4c66', water: true, castShadow: false, pickable: false }));
      o.push(obj({ name: 'Trees', type: 'scatter', smesh: 'pine', sx: 420, sy: 1, sz: 420, scount: 500, ssize: 8, sclump: 0.55, shmin: 1.5, sslope: 0.4, color: '#ffffff', body: 'solid', pickable: false, sclear: [[0, 0, 40]] }));
      o.push(obj({ name: 'Car', type: 'model', model: 'car', y: 12, sx: 3.6, sy: 3.6, sz: 3.6, color: '#ffffff', body: 'dynamic', stumble: false }, `
when start:
    # chase camera: third person without mouse look, tilted down a little
    third_person("Car", 9, 2.6, 0)
    pitch = -12
    speed = 0

when update:
    top = 22
    if key_down("shift"):
        top = 34
    if key_down("w") or key_down("up"):
        speed = min(speed + 16 * dt, top)
    elif key_down("s") or key_down("down"):
        speed = max(speed - 28 * dt, -8)
    else:
        speed = speed * (1 - 1.2 * dt)
    # steering works better the faster you go, and flips when reversing
    steer = 100 * min(1, abs(speed) / 6) * dt
    if speed < 0:
        steer = -steer
    if key_down("a") or key_down("left"):
        turn(steer)
    if key_down("d") or key_down("right"):
        turn(-steer)
    walk(speed, 0)
    if y < -1:
        speed = speed * 0.9

when key_pressed "r":
    restart_scene()
`));
      o.push(help('W / S drive and brake  ·  A / D steer  ·  Shift boost  ·  R reset'));
      const p = project('My Driving Game', [{ name: 'Main', mode: '3d', bg: '#8fc6ff', gravity: 25, sky: true, timeOfDay: 16.8, clouds: 0.4, fogDensity: 0.003, shadowSize: 60,
        camera: { ex: 0, ey: 8, ez: 14, tx: 0, ty: 0, tz: 0, fov: 65 }, objects: o }]);
      p.assets.car = { type: 'model', data: car };
      return p;
    }
  };
})(window);
