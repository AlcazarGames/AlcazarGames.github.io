/* Line icons for the IDE (24x24, stroke-based, after the Lucide style). Use Alcazar.icon(name). */
(function (G) {
  'use strict';
  const A = G.Alcazar = G.Alcazar || {};
  const P = function (d) { return '<path d="' + d + '"/>'; };
  const I = {
    plus: P('M12 5v14M5 12h14'),
    minus: P('M5 12h14'),
    x: P('M18 6 6 18M6 6l12 12'),
    open: P('M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'),
    save: P('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8'),
    file: P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6'),
    undo: P('M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'),
    redo: P('M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'),
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
    export: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12'),
    help: '<circle cx="12" cy="12" r="10"/>' + P('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01'),
    scene: P('M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16'),
    code: P('M16 18l6-6-6-6M8 6l-6 6 6 6'),
    game: '<rect x="2" y="6" width="20" height="12" rx="3"/>' + P('M6 12h4M8 10v4M15 13h.01M18 11h.01'),
    flow: '<rect x="3" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="15" width="8" height="6" rx="1.5"/>' + P('M7 9v3a3 3 0 0 0 3 3h3'),
    blocks: '<rect x="3" y="3" width="13" height="5" rx="1"/><rect x="7" y="10" width="14" height="5" rx="1"/><rect x="3" y="17" width="10" height="4" rx="1"/>',
    text: P('M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1'),
    trash: P('M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/>' + P('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'),
    edit: P('M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'),
    flag: P('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7'),
    eye: P('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z') + '<circle cx="12" cy="12" r="3"/>',
    eyeOff: P('M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20'),
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>' + P('M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21'),
    music: P('M9 18V5l12-2v13') + '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    type: P('M4 7V4h16v3M9 20h6M12 4v16'),
    focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>' + P('M12 1v4M12 19v4M1 12h4M19 12h4'),
    camera: '<rect x="1" y="6" width="15" height="12" rx="2"/>' + P('M23 7l-7 5 7 5z'),
    fit: P('M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3'),
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    triangle: P('M12 3 22 20H2z'),
    star: P('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z'),
    cube: P('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12l8.73-5.04M12 22V12'),
    cylinder: '<ellipse cx="12" cy="5" rx="8" ry="3"/>' + P('M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5'),
    plane: P('M2 15l10-5 10 5-10 5z'),
    platform: '<rect x="3" y="10" width="18" height="5" rx="1.5"/>',
    person: '<circle cx="12" cy="7" r="4"/>' + P('M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2'),
    window: '<rect x="2" y="3" width="20" height="18" rx="2"/>' + P('M2 8h20'),
    globe: '<circle cx="12" cy="12" r="10"/>' + P('M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'),
    folder: P('M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z'),
    restore: P('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5'),
    chevron: P('M6 9l6 6 6-6'),
    mountain: P('M8 3l4 8 5-5 5 15H2z'),
    tree: P('M17 14l3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17zM12 22v-3')
  };
  A.ICONS = I;
  A.icon = function (name, size) {
    const inner = I[name];
    if (!inner) return '';
    size = size || 16;
    return '<svg class="ic" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  };
  // replace <i data-ic="name"></i> placeholders
  A.applyIcons = function (root) {
    (root || document).querySelectorAll('[data-ic]').forEach(function (el) { el.outerHTML = A.icon(el.getAttribute('data-ic'), +el.getAttribute('data-size') || 16); });
  };
})(window);
