'use strict';
// Triple Shot como power-up temporal (tipo Velocidad): al recoger el orbe
// amarillo, Space dispara 3 balas en abanico durante 5s.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameFresh, resetShipSafe, mockRandom } = require('./helpers');

function freshPlaying() {
  const loaded = loadGameFresh();
  const { game } = loaded;
  game.initGame();
  resetShipSafe(game, { invincible: 0 });
  game.__setState({ bullets: [], particles: [], powerups: [], shootingStarTimer: 999 });
  return loaded;
}

function parkKeeper(game, x = 50, y = 50) {
  const a = new game.Asteroid(x, y, 3);
  a.x = x; a.y = y; a.vx = 0; a.vy = 0;
  game.__setState({ asteroids: [...game.__getState().asteroids, a] });
  return a;
}

function parkPowerup(game, kind, x = 400, y = 300) {
  const p = new game.PowerUp(x, y, kind);
  p.vx = 0; p.vy = 0;
  game.__setState({ powerups: [p] });
  return p;
}

describe('Triple Shot: constantes', () => {
  it('duración 5s, spread 0.15, color amarillo, kinds speed/triple', () => {
    const { game } = loadGameFresh();
    assert.equal(game.TRIPLE_DURATION, 5);
    assert.equal(game.TRIPLE_SPREAD, 0.15);
    assert.equal(game.TRIPLE_COLOR, '#ffd75e');
    assert.equal(game.POWERUP_KIND_SPEED, 'speed');
    assert.equal(game.POWERUP_KIND_TRIPLE, 'triple');
  });

  it('ya no hay temporizador automático global', () => {
    const { game } = loadGameFresh();
    game.initGame();
    assert.equal(game.TRIPLE_INTERVAL, undefined);
    assert.equal(typeof game.resetTripleTimer, 'undefined');
    assert.ok(!('tripleTimer' in game.__getState()));
  });
});

describe('PowerUp con kind', () => {
  it('default es speed; triple explícito; inválido cae a speed', () => {
    const { game } = loadGameFresh();
    assert.equal(new game.PowerUp(0, 0).kind, 'speed');
    assert.equal(new game.PowerUp(0, 0, 'triple').kind, 'triple');
    assert.equal(new game.PowerUp(0, 0, 'speed').kind, 'speed');
    assert.equal(new game.PowerUp(0, 0, 'raro').kind, 'speed');
  });

  it('el triple deriva y expira igual que velocidad (wrap + TTL 9)', () => {
    const { game } = loadGameFresh();
    const p = new game.PowerUp(799, 300, 'triple');
    const speed = Math.hypot(p.vx, p.vy);
    assert.ok(speed >= 15 && speed <= 35, `speed=${speed}`);
    p.vx = 20; p.vy = 0;
    p.update(0.1); // 799+2=801 → 1
    assert.ok(Math.abs(p.x - 1) < 1e-9);
    const q = new game.PowerUp(0, 0, 'triple');
    q.update(game.POWERUP_TTL);
    assert.equal(q.dead, true);
  });

  it('draw() por kind no lanza', () => {
    const { game } = loadGameFresh();
    game.initGame();
    assert.doesNotThrow(() => new game.PowerUp(100, 100, 'speed').draw());
    assert.doesNotThrow(() => new game.PowerUp(100, 100, 'triple').draw());
  });


});

describe('Ship con tripleTime', () => {
  it('reset() arranca con tripleTime 0', () => {
    const { game } = loadGameFresh();
    const ship = new game.Ship();
    assert.equal(ship.tripleTime, 0);
  });

  it('update() decrementa tripleTime con dt', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.tripleTime = 5;
    ship.update(1);
    assert.ok(Math.abs(ship.tripleTime - 4) < 1e-9);
  });

  it('tryShoot() simple sin triple: 1 bala, cooldown 0.2, nariz 21px', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.angle = 0;
    ship.x = 100; ship.y = 100;
    const bullets = ship.tryShoot();
    assert.equal(bullets.length, 1);
    assert.ok(Math.abs(bullets[0].x - 121) < 1e-9);
    assert.equal(ship.shootCooldown, 0.2);
  });

  it('tryShoot() con triple activo: 3 balas en abanico y consume cooldown', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.angle = 0;
    ship.x = 100; ship.y = 100;
    ship.tripleTime = game.TRIPLE_DURATION;
    const bullets = ship.tryShoot();
    assert.equal(bullets.length, 3);
    for (const b of bullets) {
      assert.ok(Math.abs(b.x - 121) < 1e-9, `x=${b.x}`);
      assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 520) < 1e-9);
    }
    const angles = bullets.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
    assert.ok(Math.abs(angles[1] - 0) < 1e-9, `centro=${angles[1]}`);
    assert.ok(Math.abs(angles[0] + game.TRIPLE_SPREAD) < 1e-9, `izq=${angles[0]}`);
    assert.ok(Math.abs(angles[2] - game.TRIPLE_SPREAD) < 1e-9, `der=${angles[2]}`);
    assert.equal(ship.shootCooldown, 0.2);
  });

  it('tryShoot() respeta cooldown también con triple; bloqueado si muerta', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.tripleTime = game.TRIPLE_DURATION;
    ship.shootCooldown = 0.2;
    assert.deepEqual(ship.tryShoot(), []);
    ship.shootCooldown = 0;
    ship.dead = true;
    assert.deepEqual(ship.tryShoot(), []);
    assert.deepEqual(ship.tryTripleShot(), []);
  });

  it('nave amarilla con triple (prioridad sobre cian de velocidad)', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.draw();
    assert.equal(ctx.strokeStyle, game.getSkin('clasica').color);
    ship.speedTime = 5;
    ship.draw();
    assert.equal(ctx.strokeStyle, '#0ff');
    ship.tripleTime = 5;
    ship.draw();
    assert.equal(ctx.strokeStyle, game.TRIPLE_COLOR);
  });
});

describe('Triple en update(): Space se vuelve triple', () => {
  it('sin triple, Space da 1 bala; con triple, 3 balas', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    parkKeeper(game);
    game.__setState({ bullets: [] });
    game.__getState().ship.shootCooldown = 0;
    game.justPressed['Space'] = true;
    game.update(0.016);
    assert.equal(game.__getState().bullets.length, 1);

    game.__setState({ bullets: [] });
    const ship = game.__getState().ship;
    ship.shootCooldown = 0;
    ship.tripleTime = game.TRIPLE_DURATION;
    game.justPressed['Space'] = true;
    game.update(0.016);
    assert.equal(game.__getState().bullets.length, 3);
  });

  it('con triple activo pero sin Space no hay disparo auto', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    parkKeeper(game);
    game.__setState({ bullets: [] });
    game.__getState().ship.tripleTime = game.TRIPLE_DURATION;
    game.update(0.016);
    assert.equal(game.__getState().bullets.length, 0);
  });
});

describe('Recoger orbe triple', () => {
  it('activa tripleTime 5s aunque haya invencibilidad', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    const ship = resetShipSafe(game, { invincible: 3 });
    ship.x = 400; ship.y = 300;
    parkKeeper(game);
    parkPowerup(game, 'triple');
    game.update(0.016);
    assert.equal(game.__getState().ship.tripleTime, game.TRIPLE_DURATION);
    assert.equal(game.__getState().powerups.length, 0);
  });

  it('re-recoger reinicia a 5s y convive con velocidad', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    parkKeeper(game);
    ship.tripleTime = 1.5;
    ship.speedTime = 2;
    parkPowerup(game, 'triple');
    game.update(0.016);
    assert.equal(game.__getState().ship.tripleTime, game.TRIPLE_DURATION);
    // velocidad intacta (solo decremento del frame: 2 - 0.016)
    assert.ok(Math.abs(game.__getState().ship.speedTime - (2 - 0.016)) < 1e-9);
  });

  it('el orbe de velocidad sigue dando speedTime', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [] });
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.x = 400; ship.y = 300;
    parkKeeper(game);
    parkPowerup(game, 'speed');
    game.update(0.016);
    assert.equal(game.__getState().ship.speedTime, game.SPEED_DURATION);
    assert.equal(game.__getState().ship.tripleTime, 0);
  });
});

describe('Drop diferenciado: triple 10%, velocidad 7.5%', () => {
  it('constante de drop triple 10%', () => {
    const { game } = loadGameFresh();
    assert.equal(game.TRIPLE_DROP_CHANCE, 0.10);
  });

  it('mock 0.05/0.09 → triple; mock 0.1/0.12 → velocidad; mock 0.2/0.99 → nada', () => {
    for (const [rnd, expected] of [[0.05, 'triple'], [0.09, 'triple'], [0.1, 'speed'], [0.12, 'speed']]) {
      const { game } = freshPlaying();
      game.__setState({ asteroids: [], shootingStarTimer: 999 });
      const restore = mockRandom(rnd);
      try {
        const keeper = new game.Asteroid(50, 50, 3);
        keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
        const target = new game.Asteroid(200, 200, 3);
        target.x = 200; target.y = 200; target.vx = 0; target.vy = 0;
        const b = new game.Bullet(200, 200, 0);
        b.vx = 0; b.vy = 0;
        game.__setState({ asteroids: [keeper, target], bullets: [b], powerups: [] });
        game.update(0.001);
        const pus = game.__getState().powerups;
        assert.ok(pus.length >= 1, `rnd=${rnd} debería dropear`);
        assert.ok(pus.every((p) => p.kind === expected), `rnd=${rnd} kinds=${pus.map((p) => p.kind)}`);
      } finally {
        restore();
      }
    }
    for (const rnd of [0.2, 0.99]) {
      const { game } = freshPlaying();
      game.__setState({ asteroids: [], shootingStarTimer: 999 });
      const restore = mockRandom(rnd);
      try {
        const keeper = new game.Asteroid(50, 50, 3);
        keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
        const target = new game.Asteroid(200, 200, 3);
        target.x = 200; target.y = 200; target.vx = 0; target.vy = 0;
        const b = new game.Bullet(200, 200, 0);
        b.vx = 0; b.vy = 0;
        game.__setState({ asteroids: [keeper, target], bullets: [b], powerups: [] });
        game.update(0.001);
        assert.equal(game.__getState().powerups.length, 0, `rnd=${rnd} no debería dropear`);
      } finally {
        restore();
      }
    }
  });

  it('la estrella fugaz no dropea aunque el random lo pida', () => {
    const { game } = freshPlaying();
    game.__setState({ asteroids: [], shootingStarTimer: 999 });
    const restore = mockRandom(0);
    try {
      const keeper = new game.Asteroid(50, 50, 3);
      keeper.x = 50; keeper.y = 50; keeper.vx = 0; keeper.vy = 0;
      const s0 = new game.Asteroid(300, 300, 1, { shootingStar: true });
      s0.x = 300; s0.y = 300; s0.vx = 0; s0.vy = 0;
      const b = new game.Bullet(300, 300, 0);
      b.vx = 0; b.vy = 0;
      game.__setState({ asteroids: [keeper, s0], bullets: [b], powerups: [] });
      game.update(0.001);
      assert.equal(game.__getState().powerups.length, 0);
    } finally {
      restore();
    }
  });
});

describe('Reset y HUD Triple', () => {
  it('initGame/nextLevel dejan tripleTime en 0', () => {
    const { game } = loadGameFresh();
    game.initGame();
    assert.equal(game.__getState().ship.tripleTime, 0);
    game.__getState().ship.tripleTime = 3;
    game.__setState({ asteroids: [] });
    game.nextLevel();
    assert.equal(game.__getState().ship.tripleTime, 0);
  });

  it('draw() muestra TRIPLE x3 con cuenta atrás solo con efecto', () => {
    const { game, ctx } = freshPlaying();
    parkKeeper(game);
    game.__getState().ship.tripleTime = 4.2;
    ctx.calls.length = 0;
    game.draw();
    const textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('TRIPLE')), `HUD sin TRIPLE: ${textos}`);
    assert.ok(textos.some((t) => t.includes('4.2')), `HUD sin cuenta atrás: ${textos}`);
  });

  it('con velocidad + triple apila ambos indicadores', () => {
    const { game, ctx } = freshPlaying();
    parkKeeper(game);
    const ship = game.__getState().ship;
    ship.speedTime = 5;
    ship.tripleTime = 4;
    ctx.calls.length = 0;
    game.draw();
    const textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('VELOCIDAD')), `sin VELOCIDAD: ${textos}`);
    assert.ok(textos.some((t) => t.includes('TRIPLE')), `sin TRIPLE: ${textos}`);
  });

  it('sin efecto no muestra TRIPLE; tampoco en gameover', () => {
    const { game, ctx } = freshPlaying();
    parkKeeper(game);
    game.__getState().ship.tripleTime = 0;
    ctx.calls.length = 0;
    game.draw();
    let textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(!textos.some((t) => t.includes('TRIPLE')), `TRIPLE no debería salir: ${textos}`);

    game.__setState({ state: 'gameover' });
    game.__getState().ship.tripleTime = 4.2;
    ctx.calls.length = 0;
    game.draw();
    textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(!textos.some((t) => t.includes('TRIPLE')), `TRIPLE no debería salir en gameover: ${textos}`);
  });
});
