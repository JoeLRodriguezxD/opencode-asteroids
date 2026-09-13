'use strict';
// Unitarias: Asteroid, Ship, Particle, PowerUp.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameFresh, resetShipSafe, mockRandom } = require('./helpers');

describe('Asteroid', () => {
  it('radio y velocidad base por tamaño', () => {
    const { game } = loadGameFresh();
    for (const [size, radius, base] of [[3, 50, 32], [2, 30, 55], [1, 16, 85]]) {
      const a = new game.Asteroid(100, 100, size);
      assert.equal(a.radius, radius, `size ${size}`);
      const speed = Math.hypot(a.vx, a.vy);
      assert.ok(speed >= base - 15 && speed <= base + 15, `size ${size} speed=${speed}`);
    }
  });

  it('split() de grande → 2 medianos, mediano → 2 pequeños', () => {
    const { game } = loadGameFresh();
    const big = new game.Asteroid(10, 20, 3);
    const meds = big.split();
    assert.equal(meds.length, 2);
    assert.ok(meds.every((m) => m.size === 2 && m.x === 10 && m.y === 20));

    const smalls = new game.Asteroid(0, 0, 2).split();
    assert.equal(smalls.length, 2);
    assert.ok(smalls.every((s) => s.size === 1));
  });

  it('split() en tamaño 1 no genera nada', () => {
    const { game } = loadGameFresh();
    assert.deepEqual(new game.Asteroid(0, 0, 1).split(), []);
  });

  it('estrella fugaz: radio 16, ttl 6, no se parte', () => {
    const { game } = loadGameFresh();
    const s = new game.Asteroid(50, 50, 1, { shootingStar: true });
    assert.equal(s.isShootingStar, true);
    assert.equal(s.radius, game.SHOOTING_STAR_RADIUS);
    assert.equal(s.ttl, game.SHOOTING_STAR_TTL);
    assert.deepEqual(s.split(), []);
  });

  it('velocidad fugaz ~2x del pequeño (≈175±15)', () => {
    const { game } = loadGameFresh();
    const s = new game.Asteroid(0, 0, 1, { shootingStar: true });
    const speed = Math.hypot(s.vx, s.vy);
    assert.ok(speed >= 160 && speed <= 190, `speed=${speed}`);
  });

  it('fugaz muere al agotar ttl y la normal no tiene ttl', () => {
    const { game } = loadGameFresh();
    const s = new game.Asteroid(0, 0, 1, { shootingStar: true });
    s.update(game.SHOOTING_STAR_TTL);
    assert.equal(s.dead, true);
    const normal = new game.Asteroid(0, 0, 3);
    normal.update(999);
    assert.equal(normal.dead, false);
  });

  it('update envuelve y rota con dt', () => {
    const { game } = loadGameFresh();
    const a = new game.Asteroid(799, 599, 3);
    a.vx = 20; a.vy = 20;
    const rot0 = a.rot;
    a.rotSpeed = 1;
    a.update(0.1);
    assert.ok(a.x < 10 && a.y < 10, `wrap x=${a.x} y=${a.y}`);
    assert.ok(Math.abs(a.rot - (rot0 + 0.1)) < 1e-9);
  });

  it('polígono irregular con 8-13 vértices dentro del radio', () => {
    const { game } = loadGameFresh();
    const a = new game.Asteroid(0, 0, 3);
    assert.ok(a.verts.length >= 8 && a.verts.length <= 13);
    for (const [vx, vy] of a.verts) {
      assert.ok(Math.hypot(vx, vy) <= a.radius + 1e-9);
    }
  });
});

describe('Ship', () => {
  it('reset() al centro con invencibilidad 3s', () => {
    const { game } = loadGameFresh();
    const ship = new game.Ship();
    assert.equal(ship.x, game.W / 2);
    assert.equal(ship.y, game.H / 2);
    assert.equal(ship.angle, -Math.PI / 2);
    assert.equal(ship.vx, 0);
    assert.equal(ship.vy, 0);
    assert.equal(ship.radius, 12);
    assert.equal(ship.invincible, 3);
    assert.equal(ship.shootCooldown, 0);
    assert.equal(ship.dead, false);
  });

  it('rotación con ArrowLeft/Right escalada por dt (3.5 rad/s)', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    const a0 = ship.angle;
    game.keys['ArrowLeft'] = true;
    ship.update(1);
    assert.ok(Math.abs(ship.angle - (a0 - 3.5)) < 1e-9);
    delete game.keys['ArrowLeft'];
    game.keys['ArrowRight'] = true;
    ship.update(0.5);
    assert.ok(Math.abs(ship.angle - (a0 - 3.5 + 3.5 * 0.5)) < 1e-9);
  });

  it('thrust acelera 260 px/s² y aplica DRAG 0.987', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.angle = 0; // +x
    game.keys['ArrowUp'] = true;
    ship.update(1);
    // vx = (0 + 260*1) * 0.987
    assert.ok(Math.abs(ship.vx - 260 * 0.987) < 1e-9, `vx=${ship.vx}`);
    assert.equal(ship.thrusting, true);
  });

  it('sin thrust solo aplica DRAG', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.vx = 100;
    ship.update(1);
    assert.ok(Math.abs(ship.vx - 98.7) < 1e-9);
    assert.equal(ship.thrusting, false);
  });

  it('power-up velocidad duplica el empuje (x2)', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.angle = 0;
    ship.speedTime = game.SPEED_DURATION;
    game.keys['ArrowUp'] = true;
    ship.update(1);
    assert.ok(Math.abs(ship.vx - 520 * 0.987) < 1e-9, `vx=${ship.vx}`);
  });

  it('envuelve bordes', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.x = 799; ship.y = 300; ship.vx = 100; ship.vy = 0;
    ship.update(0.1); // fricción incluida, pero debe envolver igual
    assert.ok(ship.x < 20, `x=${ship.x}`);
  });

  it('invencibilidad y cooldown decrecen con dt; muerta no se mueve', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game, { invincible: 3 });
    ship.shootCooldown = 0.2;
    ship.speedTime = 5;
    ship.update(1);
    assert.ok(Math.abs(ship.invincible - 2) < 1e-9);
    assert.ok(ship.shootCooldown <= 0);
    assert.ok(Math.abs(ship.speedTime - 4) < 1e-9);
    ship.dead = true;
    ship.x = 10;
    ship.update(1);
    assert.equal(ship.x, 10);
  });

  it('tryShoot(): cooldown 0.2, origen en la nariz (21px), bloqueo si muerta', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.angle = 0;
    ship.x = 100; ship.y = 100;
    const [b] = ship.tryShoot();
    assert.ok(b);
    assert.ok(Math.abs(b.x - 121) < 1e-9);
    assert.equal(b.y, 100);
    assert.equal(ship.shootCooldown, 0.2);
    assert.deepEqual(ship.tryShoot(), []); // cooldown activo
    ship.shootCooldown = 0;
    ship.dead = true;
    assert.deepEqual(ship.tryShoot(), []);
  });
});

describe('Particle', () => {
  it('vida aleatoria 0.4-1.1s y muere al expirar', () => {
    const restore = mockRandom([0, 0.9999]);
    try {
      const { game } = loadGameFresh();
      const p0 = new game.Particle(0, 0); // rand≈0 → life≈0.4
      assert.ok(p0.life >= 0.4 && p0.life <= 1.1, `life=${p0.life}`);
      p0.update(p0.life);
      assert.equal(p0.dead, true);
    } finally {
      restore();
    }
  });

  it('se mueve linealmente sin wrap toroidal', () => {
    const { game } = loadGameFresh();
    const p = new game.Particle(10, 10);
    p.vx = 50; p.vy = -20;
    p.ttl = 99; p.life = 99;
    p.update(1);
    assert.equal(p.x, 60);
    assert.equal(p.y, -10); // sin wrap: puede salir del canvas
  });
});

describe('PowerUp velocidad', () => {
  it('constantes: 5s, x2, ttl 9, drop velocidad 15%', () => {
    const { game } = loadGameFresh();
    assert.equal(game.SPEED_DURATION, 5);
    assert.equal(game.SPEED_MULT, 2);
    assert.equal(game.POWERUP_TTL, 9);
    assert.equal(game.SPEED_DROP_CHANCE, 0.15);
  });

  it('deriva lento (15-35 px/s) y envuelve', () => {
    const { game } = loadGameFresh();
    const p = new game.PowerUp(799, 300);
    const speed = Math.hypot(p.vx, p.vy);
    assert.ok(speed >= 15 && speed <= 35, `speed=${speed}`);
    p.vx = 20; p.vy = 0;
    p.update(0.1); // 799+2=801 → 1
    assert.ok(Math.abs(p.x - 1) < 1e-9);
  });

  it('expira a los 9s', () => {
    const { game } = loadGameFresh();
    const p = new game.PowerUp(0, 0);
    p.update(game.POWERUP_TTL);
    assert.equal(p.dead, true);
  });

  it('por defecto es de velocidad (retrocompatible)', () => {
    const { game } = loadGameFresh();
    assert.equal(new game.PowerUp(0, 0).kind, 'speed');
  });
});

describe('PowerUp escudo', () => {
  it('constantes: 8s, radio 20, color azul, drop 10% propio', () => {
    const { game } = loadGameFresh();
    assert.equal(game.SHIELD_DURATION, 8);
    assert.equal(game.SHIELD_RADIUS, 20);
    assert.equal(game.SHIELD_COLOR, '#4da6ff');
    assert.equal(game.SHIELD_DROP_CHANCE, 0.10);
  });

  it('kind shield se conserva y comparte física del power-up', () => {
    const { game } = loadGameFresh();
    const p = new game.PowerUp(799, 300, 'shield');
    assert.equal(p.kind, 'shield');
    const speed = Math.hypot(p.vx, p.vy);
    assert.ok(speed >= 15 && speed <= 35, `speed=${speed}`);
    p.vx = 20; p.vy = 0;
    p.update(0.1);
    assert.ok(Math.abs(p.x - 1) < 1e-9);
    p.update(game.POWERUP_TTL);
    assert.equal(p.dead, true);
  });

  it('kind inválido cae a speed', () => {
    const { game } = loadGameFresh();
    assert.equal(new game.PowerUp(0, 0, 'invalido').kind, 'speed');
  });
});

describe('Ship escudo', () => {
  it('reset() inicia sin escudo', () => {
    const { game } = loadGameFresh();
    assert.equal(new game.Ship().shieldTime, 0);
  });

  it('shieldTime decrece con dt; muerta no decrece', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.shieldTime = 8;
    ship.update(1);
    assert.ok(Math.abs(ship.shieldTime - 7) < 1e-9);
    ship.dead = true;
    ship.update(1);
    assert.ok(Math.abs(ship.shieldTime - 7) < 1e-9);
  });

  it('anillo visible con shieldTime alto (sin parpadeo)', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.shieldTime = 5;
    ctx.calls.length = 0;
    ship.draw();
    assert.ok(ctx.calls.some((c) => c.method === 'arc'), 'el anillo debe dibujarse');
  });

  it('anillo parpadea últimos 2s: OFF en 1.8s, ON en 1.9s', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.shieldTime = 1.8; // floor(14.4)=14 par → OFF
    ctx.calls.length = 0;
    ship.draw();
    assert.ok(!ctx.calls.some((c) => c.method === 'arc'), 'en fase OFF el anillo no se dibuja');
    ship.shieldTime = 1.9; // floor(15.2)=15 impar → ON
    ctx.calls.length = 0;
    ship.draw();
    assert.ok(ctx.calls.some((c) => c.method === 'arc'), 'en fase ON el anillo se dibuja');
  });

  it('sin escudo no hay anillo', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game, { invincible: 0 });
    ship.shieldTime = 0;
    ctx.calls.length = 0;
    ship.draw();
    assert.ok(!ctx.calls.some((c) => c.method === 'arc'), 'sin escudo no hay anillo');
  });
});
