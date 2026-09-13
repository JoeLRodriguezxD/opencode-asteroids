'use strict';
// Integración: init/nextLevel, killShip, update (disparo, colisiones, timers, niveles).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameFresh, resetShipSafe, mockRandom } = require('./helpers');

function freshPlaying() {
  const loaded = loadGameFresh();
  const { game } = loaded;
  game.initGame();
  resetShipSafe(game, { invincible: 0 });
  // Estado determinista: sin fugaces pendientes salvo que el test lo pida.
  game.__setState({ bullets: [], particles: [], powerups: [], shootingStarTimer: 999 });
  return loaded;
}

function parkAsteroid(game, { x = 50, y = 50, size = 3 } = {}) {
  const a = new game.Asteroid(x, y, size);
  a.x = x; a.y = y; a.vx = 0; a.vy = 0;
  const st = game.__getState();
  game.__setState({ asteroids: [...st.asteroids, a] });
  return a;
}

describe('initGame / nextLevel', () => {
  it('initGame: score 0, 3 vidas, nivel 1, 4 asteroides a ≥130px del centro', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const s = game.__getState();
    assert.equal(s.score, 0);
    assert.equal(s.lives, 3);
    assert.equal(s.level, 1);
    assert.equal(s.state, 'playing');
    assert.equal(s.asteroids.length, 4);
    for (const a of s.asteroids) {
      assert.ok(Math.hypot(a.x - 400, a.y - 300) >= 130, `asteroide demasiado cerca (${a.x},${a.y})`);
      assert.equal(a.size, 3);
    }
  });

  it('nextLevel: sube nivel, 3+nivel asteroides, resetea nave pero conserva score/lives', () => {
    const { game } = loadGameFresh();
    game.initGame();
    game.__setState({ score: 999, lives: 2 });
    game.__getState().ship.x = 10;
    // nextLevel() se llama con el nivel vacío en el juego real (no limpia
    // asteroides, solo añade). Simulamos esa precondición vaciando antes.
    game.__setState({ asteroids: [], bullets: [new game.Bullet(0, 0, 0)], particles: [new game.Particle(0, 0)] });
    game.nextLevel();
    const s = game.__getState();
    assert.equal(s.level, 2);
    assert.equal(s.asteroids.length, 5); // 3 + 2
    assert.equal(s.score, 999);
    assert.equal(s.lives, 2);
    assert.equal(s.bullets.length, 0);
    assert.equal(s.particles.length, 0);
    assert.equal(s.ship.x, 400);
  });

  it('resetShootingStarTimer queda en [7,12]', () => {
    const { game } = loadGameFresh();
    game.initGame();
    for (let i = 0; i < 20; i++) {
      game.resetShootingStarTimer();
      const t = game.__getState().shootingStarTimer;
      assert.ok(t >= 7 && t <= 12, `timer=${t}`);
    }
  });
});

describe('killShip / respawn / gameover', () => {
  it('con vidas restantes pasa a dead con deadTimer=2 y marca la nave', () => {
    const { game } = loadGameFresh();
    game.initGame();
    resetShipSafe(game);
    game.__setState({ lives: 3 });
    game.killShip();
    const s = game.__getState();
    assert.equal(s.lives, 2);
    assert.equal(s.state, 'dead');
    assert.equal(s.deadTimer, 2);
    assert.equal(s.ship.dead, true);
    assert.ok(s.particles.length >= 14);
  });

  it('sin vidas pasa a gameover', () => {
    const { game } = loadGameFresh();
    game.initGame();
    game.__setState({ lives: 1 });
    game.killShip();
    const s = game.__getState();
    assert.equal(s.lives, 0);
    assert.equal(s.state, 'gameover');
  });

  it('estado dead: tras 2s vuelve a playing con nave reseteada', () => {
    const { game } = loadGameFresh();
    game.initGame();
    game.__setState({ lives: 2 });
    game.killShip();
    game.update(2);
    const s = game.__getState();
    assert.equal(s.state, 'playing');
    assert.equal(s.ship.dead, false);
    assert.equal(s.ship.x, 400);
  });

  it('gameover: Space reinicia, sin Space solo actualiza partículas', () => {
    const { game } = loadGameFresh();
    game.initGame();
    game.__setState({ lives: 1, score: 500 });
    game.killShip();
    assert.equal(game.__getState().state, 'gameover');
    game.update(0.5);
    assert.equal(game.__getState().state, 'gameover');
    game.justPressed['Space'] = true;
    game.update(0.016);
    const s = game.__getState();
    assert.equal(s.state, 'playing');
    assert.equal(s.score, 0);
    assert.equal(s.lives, 3);
  });
});

describe('disparo (Space one-shot)', () => {
  it('Space dispara una bala desde la nave', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    // Evita nextLevel inmediato: deja 1 asteroide lejos.
    parkAsteroid(game, { x: 50, y: 50, size: 3 });
    game.justPressed['Space'] = true;
    const n0 = game.__getState().bullets.length;
    game.update(0.016);
    assert.equal(game.__getState().bullets.length, n0 + 1);
  });

  it('sin Space no dispara; respeta cooldown 0.2s', () => {
    const { game } = freshPlaying();
    parkAsteroid(game, { x: 50, y: 50, size: 3 });
    game.update(0.016);
    assert.equal(game.__getState().bullets.length, 0);
    game.justPressed['Space'] = true;
    game.update(0.016);
    assert.equal(game.__getState().bullets.length, 1);
    game.justPressed['Space'] = true;
    game.update(0.016); // cooldown aún activo
    assert.equal(game.__getState().bullets.length, 1);
  });
});

describe('bala vs asteroide', () => {
  it('suma 20/50/100 según tamaño y parte grandes y medianos', () => {
    for (const [size, points, children] of [[3, 20, 2], [2, 50, 2], [1, 100, 0]]) {
      const { game } = freshPlaying();
      game.__setState({ asteroids: [], shootingStarTimer: 999 });
      const restore = mockRandom(0.99); // evita drop de powerup (<0.15 no sale)
      try {
        // Keeper lejos para que update() no dispare nextLevel() al vaciar.
        const keeper = new game.Asteroid(50, 50, 3);
        keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
        const a = new game.Asteroid(200, 200, size);
        a.x = 200; a.y = 200; a.vx = 0; a.vy = 0;
        const b = new game.Bullet(200, 200, 0);
        b.vx = 0; b.vy = 0;
        game.__setState({ asteroids: [keeper, a], bullets: [b] });
        game.update(0.001);
        const s = game.__getState();
        assert.equal(s.score, points, `size ${size}`);
        assert.equal(s.asteroids.length, 1 + children, `size ${size} hijos + keeper`);
        assert.equal(s.bullets.length, 0);
      } finally {
        restore();
      }
    }
  });

  it('estrella fugaz vale 200, no se parte y no dropea powerup', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], shootingStarTimer: 999 });
    const restore = mockRandom(0); // forzaría drop si no estuviera excluida
    try {
      const keeper = new game.Asteroid(50, 50, 3);
      keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
      const s0 = new game.Asteroid(300, 300, 1, { shootingStar: true });
      s0.x = 300; s0.y = 300; s0.vx = 0; s0.vy = 0;
      const b = new game.Bullet(300, 300, 0);
      b.vx = 0; b.vy = 0;
      game.__setState({ asteroids: [keeper, s0], bullets: [b], powerups: [] });
      game.update(0.001);
      const s = game.__getState();
      assert.equal(s.score, 200);
      assert.equal(s.powerups.length, 0);
      assert.ok(s.asteroids.length >= 1, 'keeper debe seguir');
      assert.ok(!s.asteroids.some((x) => x.isShootingStar && !x.dead), 'fugaz destruida');
    } finally {
      restore();
    }
  });

  it('destruir asteroide puede dropear powerup (mock Math.random<0.15)', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], shootingStarTimer: 999 });
    // Secuencia: primero los rand del split/powerup; forzamos drop con 0.
    const restore = mockRandom(0);
    try {
      const keeper = new game.Asteroid(50, 50, 3);
      keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
      const target = new game.Asteroid(200, 200, 3);
      target.x = 200; target.y = 200; target.vx = 0; target.vy = 0;
      const b = new game.Bullet(200, 200, 0);
      b.vx = 0; b.vy = 0;
      game.__setState({ asteroids: [keeper, target], bullets: [b], powerups: [] });
      game.update(0.001);
      assert.ok(game.__getState().powerups.length >= 1, 'debería dropear powerup');
    } finally {
      restore();
    }
  });
});

describe('nave vs asteroide (radio perdonador 0.82)', () => {
  it('colisión mata con factor 0.82', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], lives: 3 });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    // Grande r=50 → umbral 12 + 41 = 53. Colocamos a 50 (<53).
    const a = new game.Asteroid(450, 300, 3);
    a.x = 450; a.y = 300; a.vx = 0; a.vy = 0;
    const keeper = new game.Asteroid(50, 50, 3);
    keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
    game.__setState({ asteroids: [keeper, a] });
    game.update(0.016);
    assert.equal(game.__getState().state, 'dead');
  });

  it('fuera del umbral 0.82 no mata (pero mataría con radio completo)', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], lives: 3 });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    // Umbral perdonador 53, radio completo 62. Distancia 58 → sobrevive aquí.
    const a = new game.Asteroid(458, 300, 3);
    a.x = 458; a.y = 300; a.vx = 0; a.vy = 0;
    const keeper = new game.Asteroid(50, 50, 3);
    keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
    game.__setState({ asteroids: [keeper, a] });
    game.update(0.016);
    assert.equal(game.__getState().state, 'playing');
  });

  it('con invencibilidad no muere aunque se solape', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], lives: 3 });
    const ship = resetShipSafe(game, { invincible: 3 });
    ship.x = 400; ship.y = 300;
    const a = new game.Asteroid(400, 300, 3);
    a.x = 400; a.y = 300; a.vx = 0; a.vy = 0;
    game.__setState({ asteroids: [a] });
    game.update(0.016);
    assert.equal(game.__getState().state, 'playing');
  });
});

describe('power-up velocidad', () => {
  it('recogerlo activa 5s aunque haya invencibilidad', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    const ship = resetShipSafe(game, { invincible: 3 });
    ship.x = 400; ship.y = 300;
    parkAsteroid(game, { x: 50, y: 50, size: 3 });
    const p = new game.PowerUp(400, 300);
    p.vx = 0; p.vy = 0;
    game.__setState({ powerups: [p] });
    game.update(0.016);
    assert.equal(game.__getState().ship.speedTime, game.SPEED_DURATION);
    assert.equal(game.__getState().powerups.length, 0);
  });
});

describe('power-up escudo', () => {
  it('recogerlo activa 8s aunque haya invencibilidad y no toca velocidad', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    const ship = resetShipSafe(game, { invincible: 3 });
    ship.x = 400; ship.y = 300;
    parkAsteroid(game, { x: 50, y: 50, size: 3 });
    const p = new game.PowerUp(400, 300, 'shield');
    p.vx = 0; p.vy = 0;
    game.__setState({ powerups: [p] });
    game.update(0.016);
    const s = game.__getState();
    assert.equal(s.ship.shieldTime, game.SHIELD_DURATION);
    assert.equal(s.ship.speedTime, 0);
    assert.equal(s.powerups.length, 0);
  });

  it('con escudo la colisión destruye el asteroide sin matar (suma puntos y parte)', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], lives: 3, score: 0 });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    ship.shieldTime = game.SHIELD_DURATION;
    const a = new game.Asteroid(450, 300, 3);
    a.x = 450; a.y = 300; a.vx = 0; a.vy = 0;
    const keeper = new game.Asteroid(50, 50, 3);
    keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
    game.__setState({ asteroids: [keeper, a] });
    const restore = mockRandom(0.99); // evita drops en el split del escudo
    try {
      game.update(0.016);
    } finally {
      restore();
    }
    const s = game.__getState();
    assert.equal(s.state, 'playing');
    assert.equal(s.lives, 3);
    assert.equal(s.score, 20);
    // keeper + 2 fragmentos del grande destruido por el escudo
    assert.equal(s.asteroids.length, 3);
  });

  it('con escudo la estrella fugaz se destruye y da 200 sin matar', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], lives: 3, score: 0, shootingStarTimer: 999 });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    ship.shieldTime = game.SHIELD_DURATION;
    const keeper = new game.Asteroid(50, 50, 3);
    keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
    const f = new game.Asteroid(400, 300, 1, { shootingStar: true });
    f.x = 400; f.y = 300; f.vx = 0; f.vy = 0;
    game.__setState({ asteroids: [keeper, f] });
    game.update(0.016);
    const s = game.__getState();
    assert.equal(s.state, 'playing');
    assert.equal(s.score, 200);
    assert.ok(!s.asteroids.some((x) => x.isShootingStar && !x.dead));
  });

  it('sin escudo (expirado) la colisión vuelve a matar', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], lives: 3 });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    ship.shieldTime = 0.01;
    const a = new game.Asteroid(450, 300, 3);
    a.x = 450; a.y = 300; a.vx = 0; a.vy = 0;
    const keeper = new game.Asteroid(50, 50, 3);
    keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
    game.__setState({ asteroids: [keeper, a] });
    game.update(0.02); // expira el escudo antes de la colisión
    assert.equal(game.__getState().state, 'dead');
  });

  it('el drop reparte escudo 10% y velocidad 15% (un solo roll, total 25%)', () => {
    // Roll único: <0.10 escudo, <0.25 velocidad, si no sin drop.
    for (const [mock, kind] of [[0, 'shield'], [0.099, 'shield'], [0.10, 'speed'], [0.15, 'speed'], [0.24, 'speed']]) {
      const { game } = freshPlaying();
      game.__setState({ asteroids: [], shootingStarTimer: 999 });
      const restore = mockRandom(mock);
      try {
        const keeper = new game.Asteroid(50, 50, 3);
        keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
        const target = new game.Asteroid(200, 200, 3);
        target.x = 200; target.y = 200; target.vx = 0; target.vy = 0;
        const b = new game.Bullet(200, 200, 0);
        b.vx = 0; b.vy = 0;
        game.__setState({ asteroids: [keeper, target], bullets: [b], powerups: [] });
        game.update(0.001);
        assert.equal(game.__getState().powerups[0].kind, kind, `mock=${mock}`);
      } finally {
        restore();
      }
    }
    // Fuera del total 25% no hay drop.
    for (const mock of [0.25, 0.5]) {
      const { game } = freshPlaying();
      game.__setState({ asteroids: [], shootingStarTimer: 999 });
      const restore = mockRandom(mock);
      try {
        const keeper = new game.Asteroid(50, 50, 3);
        keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
        const target = new game.Asteroid(200, 200, 3);
        target.x = 200; target.y = 200; target.vx = 0; target.vy = 0;
        const b = new game.Bullet(200, 200, 0);
        b.vx = 0; b.vy = 0;
        game.__setState({ asteroids: [keeper, target], bullets: [b], powerups: [] });
        game.update(0.001);
        assert.equal(game.__getState().powerups.length, 0, `mock=${mock} sin drop`);
      } finally {
        restore();
      }
    }
  });

  it('nextLevel resetea el escudo', () => {
    const { game } = loadGameFresh();
    game.initGame();
    game.__getState().ship.shieldTime = game.SHIELD_DURATION;
    game.__setState({ asteroids: [] });
    game.nextLevel();
    assert.equal(game.__getState().ship.shieldTime, 0);
  });
});

describe('estrella fugaz por timer', () => {
  it('al expirar el timer aparece (máx 1) y el timer se reinicia a [7,12]', () => {
    const { game } = freshPlaying();
    parkAsteroid(game, { x: 50, y: 50, size: 3 });
    game.__setState({ shootingStarTimer: 0.001 });
    game.update(0.01);
    const s = game.__getState();
    assert.ok(s.asteroids.some((a) => a.isShootingStar), 'debería spawnear fugaz');
    assert.ok(s.shootingStarTimer >= 7 && s.shootingStarTimer <= 12);
  });

  it('no duplica si ya hay una activa', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    parkAsteroid(game, { x: 50, y: 50, size: 3 });
    const f = new game.Asteroid(200, 200, 1, { shootingStar: true });
    f.x = 200; f.y = 200; f.vx = 0; f.vy = 0;
    game.__setState({ asteroids: [...game.__getState().asteroids, f], shootingStarTimer: 0.001 });
    game.update(0.01);
    const n = game.__getState().asteroids.filter((a) => a.isShootingStar).length;
    assert.equal(n, 1);
  });

  it('la fugaz no bloquea el avance de nivel', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], level: 1 });
    const f = new game.Asteroid(200, 200, 1, { shootingStar: true });
    f.x = 200; f.y = 200; f.vx = 0; f.vy = 0;
    game.__setState({ asteroids: [f], shootingStarTimer: 999 });
    const ship = resetShipSafe(game, { invincible: 99 });
    ship.x = 400; ship.y = 300;
    game.update(0.016);
    // Al no haber normales, nextLevel() corre aunque quede la fugaz.
    assert.equal(game.__getState().level, 2);
  });
});

describe('nivel completado', () => {
  it('sin asteroides normales avanza de nivel', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], level: 1, shootingStarTimer: 999 });
    resetShipSafe(game, { invincible: 99 });
    game.update(0.016);
    const s = game.__getState();
    assert.equal(s.level, 2);
    assert.equal(s.asteroids.length, 5);
  });
});

describe('explode', () => {
  it('genera N partículas (defecto 8)', () => {
    const { game } = freshPlaying();
    game.__setState({ particles: [] });
    game.explode(10, 10);
    assert.equal(game.__getState().particles.length, 8);
    game.explode(10, 10, 3);
    assert.equal(game.__getState().particles.length, 11);
  });
});
