'use strict';
// Helpers compartidos para los tests (solo Node, sin dependencias).
// Instala mocks mínimos de DOM antes de cargar ../game.js.

function createCtxStub() {
  const calls = [];
  const target = {
    calls,
    fillStyle: '#000',
    strokeStyle: '#fff',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    font: '',
    textAlign: '',
    shadowColor: '',
    shadowBlur: 0,
  };
  const methods = new Set([
    'fillRect', 'clearRect', 'strokeRect',
    'fillText', 'strokeText',
    'beginPath', 'closePath', 'moveTo', 'lineTo',
    'arc', 'fill', 'stroke',
    'save', 'restore', 'translate', 'rotate', 'scale',
  ]);
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (methods.has(p)) {
        return (...args) => { calls.push({ method: p, args }); };
      }
      // Cualquier otra propiedad de canvas ctx → no-op seguro.
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function installDom({ ctxStub } = {}) {
  const ctx = ctxStub || createCtxStub();
  const canvasStub = {
    width: 800,
    height: 600,
    getContext: () => ctx,
  };
  // No definimos requestAnimationFrame: así game.js NO se auto-arranca al cargarlo.
  delete global.requestAnimationFrame;
  global.document = { getElementById: (id) => (id === 'canvas' ? canvasStub : null) };
  global.window = { addEventListener: () => {} };
  return { ctx, canvasStub };
}

// Carga game.js aislado por test: limpia caché y reinstala DOM con ctx fresco.
function loadGameFresh() {
  const gamePath = require.resolve('../game.js');
  delete require.cache[gamePath];
  const { ctx, canvasStub } = installDom();
  const game = require('../game.js');
  clearInput(game);
  return { game, ctx, canvasStub };
}

function clearInput(game) {
  for (const k of Object.keys(game.keys)) delete game.keys[k];
  for (const k of Object.keys(game.justPressed)) delete game.justPressed[k];
}

// Mockea Math.random con una secuencia determinista. Devuelve restore().
function mockRandom(sequence) {
  const original = Math.random;
  const seq = Array.isArray(sequence) ? sequence.slice() : [sequence];
  let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = original; };
}

// Mockea Date.now con un valor fijo. Devuelve restore().
function mockDateNow(value) {
  const original = Date.now;
  Date.now = () => value;
  return () => { Date.now = original; };
}

// Coloca la nave en un estado conocido y seguro (centro, sin thrust, skin clásica).
function resetShipSafe(game, { x = 400, y = 300, invincible = 0 } = {}) {
  const s = game.__getState().ship;
  s.x = x;
  s.y = y;
  s.vx = 0;
  s.vy = 0;
  s.angle = -Math.PI / 2;
  s.dead = false;
  s.invincible = invincible;
  s.shootCooldown = 0;
  s.speedTime = 0;
  s.tripleTime = 0;
  s.shieldTime = 0;
  s.thrusting = false;
  // Skin determinista: los tests de skins fijan la suya explícitamente.
  game.__setState({ currentSkin: 'clasica' });
  s.skin = 'clasica';
  return s;
}

module.exports = {
  createCtxStub,
  installDom,
  loadGameFresh,
  clearInput,
  mockRandom,
  mockDateNow,
  resetShipSafe,
};
