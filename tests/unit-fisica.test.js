'use strict';
// Unitarias: utils toroidales, Bullet, loop/dt clamp y draw sin errores.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameFresh, resetShipSafe } = require('./helpers');

describe('wrap toroidal', () => {
  it('envuelve por la derecha (W=800)', () => {
    const { game } = loadGameFresh();
    assert.equal(game.wrap(801, 800), 1);
    assert.equal(game.wrap(1600, 800), 0);
  });

  it('envuelve por la izquierda con negativos', () => {
    const { game } = loadGameFresh();
    assert.equal(game.wrap(-1, 800), 799);
    assert.equal(game.wrap(-800, 800), 0);
    assert.equal(game.wrap(-801, 800), 799);
  });

  it('envuelve en vertical (H=600)', () => {
    const { game } = loadGameFresh();
    assert.equal(game.wrap(601, 600), 1);
    assert.equal(game.wrap(-1, 600), 599);
  });

  it('deja valores dentro del rango intactos', () => {
    const { game } = loadGameFresh();
    assert.equal(game.wrap(0, 800), 0);
    assert.equal(game.wrap(400, 800), 400);
    assert.equal(game.wrap(799.5, 800), 799.5);
  });
});

describe('dist', () => {
  it('calcula distancia euclídea', () => {
    const { game } = loadGameFresh();
    assert.equal(game.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });

  it('distancia cero al mismo punto', () => {
    const { game } = loadGameFresh();
    assert.equal(game.dist({ x: 400, y: 300 }, { x: 400, y: 300 }), 0);
  });
});

describe('tablas RADII/SPEEDS/POINTS indexadas por tamaño 3→1', () => {
  it('grande=3, mediano=2, pequeño=1', () => {
    const { game } = loadGameFresh();
    assert.deepEqual([...game.RADII], [0, 16, 30, 50]);
    assert.deepEqual([...game.SPEEDS], [0, 85, 55, 32]);
    assert.deepEqual([...game.POINTS], [0, 100, 50, 20]);
  });
});

describe('Bullet', () => {
  it('velocidad 520 en la dirección del ángulo', () => {
    const { game } = loadGameFresh();
    const b = new game.Bullet(100, 100, 0);
    assert.ok(Math.abs(b.vx - 520) < 1e-9);
    assert.ok(Math.abs(b.vy) < 1e-9);
    const up = new game.Bullet(100, 100, -Math.PI / 2);
    assert.ok(Math.abs(up.vx) < 1e-9);
    assert.ok(Math.abs(up.vy + 520) < 1e-9);
  });

  it('avanza con física escalada por dt', () => {
    const { game } = loadGameFresh();
    const b = new game.Bullet(100, 100, 0);
    b.update(0.5);
    assert.ok(Math.abs(b.x - (100 + 520 * 0.5)) < 1e-9);
    assert.ok(Math.abs(b.ttl - (1.1 - 0.5)) < 1e-9);
    assert.equal(b.dead, false);
  });

  it('muere al agotar ttl 1.1s', () => {
    const { game } = loadGameFresh();
    const b = new game.Bullet(0, 0, 0);
    b.update(1.1);
    assert.equal(b.dead, true);
  });

  it('envuelve bordes (espacio toroidal)', () => {
    const { game } = loadGameFresh();
    const b = new game.Bullet(799, 300, 0); // hacia +x
    b.update(0.1); // 799 + 52 = 851 → 51
    assert.ok(Math.abs(b.x - 51) < 1e-9);
  });
});

describe('loop: clamp de dt a 0.05', () => {
  it('primera llamada usa dt=0 (lastTime null)', () => {
    const { game } = loadGameFresh();
    game.initGame();
    game.__setState({ lastTime: null, asteroids: [], shootingStarTimer: 999 });
    const ship = game.__getState().ship;
    ship.x = 100; ship.y = 100; ship.vx = 200; ship.vy = 0; ship.invincible = 99;
    // Evita nextLevel: necesita al menos 1 asteroide no-fugaz.
    const a = new game.Asteroid(10, 10, 3);
    a.x = 10; a.y = 10; a.vx = 0; a.vy = 0;
    game.__setState({ asteroids: [a] });
    global.requestAnimationFrame = () => {};
    try {
      game.loop(1000);
      assert.equal(game.__getState().lastTime, 1000);
      assert.equal(game.__getState().ship.x, 100); // dt=0 → sin movimiento
    } finally {
      delete global.requestAnimationFrame;
    }
  });

  it('un salto de 5s se recorta a dt=0.05', () => {
    const { game } = loadGameFresh();
    game.initGame();
    resetShipSafe(game, { invincible: 99 });
    const a = new game.Asteroid(10, 10, 3);
    a.x = 10; a.y = 10; a.vx = 0; a.vy = 0;
    const b = new game.Bullet(400, 500, 0);
    b.ttl = 1.1;
    game.__setState({ asteroids: [a], bullets: [b], shootingStarTimer: 999, lastTime: 1000 });
    global.requestAnimationFrame = () => {};
    try {
      game.loop(6000); // gap 5s
      const ttl = game.__getState().bullets[0].ttl;
      assert.ok(Math.abs(ttl - (1.1 - 0.05)) < 1e-9, `ttl=${ttl} debería ser 1.05`);
    } finally {
      delete global.requestAnimationFrame;
    }
  });
});

describe('draw no lanza y pinta HUD en español', () => {
  it('draw() con ctx stub no lanza', () => {
    const { game } = loadGameFresh();
    game.initGame();
    assert.doesNotThrow(() => game.draw());
  });

  it('HUD incluye SCORE y NIVEL', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    ctx.calls.length = 0;
    game.draw();
    const textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('SCORE')), `HUD sin SCORE: ${textos}`);
    assert.ok(textos.some((t) => t.includes('NIVEL')), `HUD sin NIVEL: ${textos}`);
  });

  it('gameover muestra GAME OVER + PUNTAJE + ESPACIO', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    game.__setState({ state: 'gameover', score: 123 });
    ctx.calls.length = 0;
    game.draw();
    const textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('GAME OVER')), `sin GAME OVER: ${textos}`);
    assert.ok(textos.some((t) => t.includes('PUNTAJE')), `sin PUNTAJE: ${textos}`);
    assert.ok(textos.some((t) => t.includes('ESPACIO')), `sin ESPACIO: ${textos}`);
  });
});
