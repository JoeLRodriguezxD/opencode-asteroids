'use strict';
// Unitarias: sistema de skins de nave (Digit1-4, persistencia, dibujo).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameFresh, resetShipSafe } = require('./helpers');

// Mock de localStorage en memoria. Devuelve { store, restore }.
function mockLocalStorage(initial = {}) {
  const store = { ...initial };
  const original = global.localStorage;
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  return { store, restore: () => {
    if (typeof original === 'undefined') delete global.localStorage;
    else global.localStorage = original;
  } };
}

function freshPlaying() {
  const loaded = loadGameFresh();
  const { game } = loaded;
  game.initGame();
  resetShipSafe(game, { invincible: 0 });
  game.__setState({ bullets: [], particles: [], powerups: [], shootingStarTimer: 999 });
  return loaded;
}

function parkKeeper(game) {
  const a = new game.Asteroid(50, 50, 3);
  a.x = 50; a.y = 50; a.vx = 0; a.vy = 0;
  game.__setState({ asteroids: [a] });
}

describe('SHIP_SKINS', () => {
  it('4 skins con id/nombre/color/estela únicos', () => {
    const { game } = loadGameFresh();
    assert.equal(game.SHIP_SKINS.length, 4);
    const ids = game.SHIP_SKINS.map((s) => s.id);
    assert.deepEqual(ids, ['clasica', 'interceptor', 'caza', 'orca']);
    assert.equal(new Set(ids).size, 4);
    for (const s of game.SHIP_SKINS) {
      assert.ok(s.name && s.color && s.flame, `skin ${s.id} incompleta`);
    }
    assert.equal(game.DEFAULT_SKIN, 'clasica');
  });

  it('getSkin() resuelve por id y cae a la clásica si es desconocido', () => {
    const { game } = loadGameFresh();
    assert.equal(game.getSkin('caza').color, '#ffa500');
    assert.equal(game.getSkin('inexistente').id, 'clasica');
  });
});

describe('skin por defecto y setShipSkin()', () => {
  it('nave nueva usa la clásica y getShipSkin() la refleja', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const s = game.__getState();
    assert.equal(s.ship.skin, 'clasica');
    assert.equal(s.currentSkin, 'clasica');
    assert.equal(game.getShipSkin(), 'clasica');
  });

  it('setShipSkin válido cambia global + nave y persiste; inválido no hace nada', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const { store, restore } = mockLocalStorage();
    try {
      assert.equal(game.setShipSkin('orca'), true);
      assert.equal(game.getShipSkin(), 'orca');
      assert.equal(game.__getState().ship.skin, 'orca');
      assert.equal(store[game.SKIN_STORAGE_KEY], 'orca');
      assert.equal(game.setShipSkin('inexistente'), false);
      assert.equal(game.getShipSkin(), 'orca');
    } finally {
      restore();
    }
  });
});

describe('selección con teclas Digit1-4', () => {
  it('Digit2 en playing cambia a interceptor sin disparar', () => {
    const { game } = freshPlaying();
    parkKeeper(game);
    game.justPressed['Digit2'] = true;
    game.update(0.016);
    assert.equal(game.getShipSkin(), 'interceptor');
    assert.equal(game.__getState().ship.skin, 'interceptor');
    assert.equal(game.__getState().bullets.length, 0);
  });

  it('Digit4 en gameover cambia la skin', () => {
    const { game } = freshPlaying();
    game.__setState({ lives: 1 });
    game.killShip();
    assert.equal(game.__getState().state, 'gameover');
    game.justPressed['Digit4'] = true;
    game.update(0.016);
    assert.equal(game.getShipSkin(), 'orca');
    assert.equal(game.__getState().state, 'gameover');
  });
});

describe('conservación y persistencia', () => {
  it('nextLevel() conserva la skin', () => {
    const { game } = freshPlaying();
    game.setShipSkin('caza');
    game.__setState({ asteroids: [] });
    game.nextLevel();
    const s = game.__getState();
    assert.equal(s.currentSkin, 'caza');
    assert.equal(s.ship.skin, 'caza');
  });

  it('respawn tras killShip conserva la skin', () => {
    const { game } = freshPlaying();
    game.setShipSkin('interceptor');
    game.__setState({ lives: 3 });
    game.killShip();
    game.update(2);
    const s = game.__getState();
    assert.equal(s.state, 'playing');
    assert.equal(s.ship.skin, 'interceptor');
  });

  it('initGame() recarga la skin persistida', () => {
    const { restore } = mockLocalStorage({ 'asteroids-ship-skin': 'orca' });
    try {
      const { game } = loadGameFresh();
      game.initGame();
      assert.equal(game.getShipSkin(), 'orca');
      assert.equal(game.__getState().ship.skin, 'orca');
    } finally {
      restore();
    }
  });

  it('valor persistido corrupto → clásica', () => {
    const { restore } = mockLocalStorage({ 'asteroids-ship-skin': 'nave-espacial-3000' });
    try {
      const { game } = loadGameFresh();
      game.initGame();
      assert.equal(game.getShipSkin(), 'clasica');
    } finally {
      restore();
    }
  });

  it('sin localStorage (Node) no lanza al cargar ni al guardar', () => {
    const { game } = loadGameFresh();
    assert.doesNotThrow(() => game.loadSkin());
    assert.doesNotThrow(() => game.setShipSkin('caza'));
  });
});

describe('siluetas diferenciadas', () => {
  function pathOf(game, ctx, variant) {
    ctx.calls.length = 0;
    game.shipPath(variant);
    return ctx.calls
      .filter((c) => c.method === 'moveTo' || c.method === 'lineTo')
      .map((c) => `${c.method}(${c.args.join(',')})`)
      .join(' ');
  }

  it('la clásica conserva sus coordenadas exactas (anti-regresión)', () => {
    const { game, ctx } = loadGameFresh();
    assert.equal(
      pathOf(game, ctx, 'clasica'),
      'moveTo(20,0) lineTo(-12,-9) lineTo(-7,0) lineTo(-12,9)'
    );
  });

  it('las 4 siluetas difieren entre sí', () => {
    const { game, ctx } = loadGameFresh();
    const paths = game.SHIP_SKINS.map((s) => pathOf(game, ctx, s.id));
    assert.equal(new Set(paths).size, 4, `siluetas duplicadas: ${paths}`);
  });
});

describe('balas del color de la nave', () => {
  it('por defecto la bala es blanca (compatibilidad)', () => {
    const { game } = loadGameFresh();
    assert.equal(new game.Bullet(0, 0, 0).color, '#fff');
  });

  it('Bullet dibuja con su propio color', () => {
    const { game, ctx } = loadGameFresh();
    new game.Bullet(10, 10, 0, '#ffa500').draw();
    assert.equal(ctx.fillStyle, '#ffa500');
    new game.Bullet(10, 10, 0).draw();
    assert.equal(ctx.fillStyle, '#fff');
  });

  it('tryShoot() genera balas del color de la skin', () => {
    const { game } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game);
    ship.skin = 'caza';
    const [b] = ship.tryShoot();
    assert.equal(b.color, '#ffa500');
  });

  it('la bala congela su color aunque se cambie de skin en vuelo', () => {
    const { game } = freshPlaying();
    parkKeeper(game);
    game.setShipSkin('caza');
    game.justPressed['Space'] = true;
    game.update(0.016);
    const [b] = game.__getState().bullets;
    assert.ok(b, 'debería haber una bala');
    assert.equal(b.color, '#ffa500');
    game.setShipSkin('orca');
    game.update(0.016);
    assert.equal(game.__getState().bullets[0].color, '#ffa500');
  });
});

describe('dibujo por skin', () => {
  it('ship.draw() no lanza con ninguna skin y usa su color', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game, { invincible: 0 });
    for (const skin of game.SHIP_SKINS) {
      game.__setState({ currentSkin: skin.id });
      ship.skin = skin.id;
      ship.speedTime = 0;
      assert.doesNotThrow(() => ship.draw(), `draw ${skin.id}`);
      assert.equal(ctx.strokeStyle, skin.color, `color ${skin.id}`);
    }
  });

  it('con velocidad x2 el trazo es cian en todas las skins', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    const ship = resetShipSafe(game, { invincible: 0 });
    for (const skin of game.SHIP_SKINS) {
      ship.skin = skin.id;
      ship.speedTime = game.SPEED_DURATION;
      ship.draw();
      assert.equal(ctx.strokeStyle, '#0ff', `boost ${skin.id}`);
    }
  });

  it('drawLifeIcon() usa el color de la skin indicada', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    game.drawLifeIcon(100, 20, 'caza');
    assert.equal(ctx.strokeStyle, '#ffa500');
    game.drawLifeIcon(100, 20); // por defecto, la actual (clásica)
    assert.equal(ctx.strokeStyle, '#ffffff');
  });

  it('draw() general no lanza con skin no clásica', () => {
    const { game } = freshPlaying();
    parkKeeper(game);
    game.__setState({ currentSkin: 'orca' });
    game.__getState().ship.skin = 'orca';
    assert.doesNotThrow(() => game.draw());
  });
});

describe('HUD de skins', () => {
  it('roster: las 4 naves con número y nombre', () => {
    const { game, ctx } = freshPlaying();
    parkKeeper(game);
    ctx.calls.length = 0;
    game.draw();
    const textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    for (const [n, name] of [[1, 'CLÁSICA'], [2, 'INTERCEPTOR'], [3, 'CAZA'], [4, 'ORCA']]) {
      assert.ok(textos.some((t) => t.includes(String(n)) && t.includes(name)), `roster sin ${n} ${name}: ${textos}`);
    }
  });

  it('roster: marcador ► en la skin actual y se mueve al cambiar', () => {
    const { game, ctx } = freshPlaying();
    parkKeeper(game);
    ctx.calls.length = 0;
    game.draw();
    let textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('►') && t.includes('CLÁSICA')), `sin ► en CLÁSICA: ${textos}`);
    game.setShipSkin('caza');
    ctx.calls.length = 0;
    game.draw();
    textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('►') && t.includes('CAZA')), `sin ► en CAZA: ${textos}`);
    assert.ok(!textos.some((t) => t.includes('►') && t.includes('CLÁSICA')), `► duplicado: ${textos}`);
  });

  it('gameover sugiere 1-4 para cambiar de nave', () => {
    const { game, ctx } = loadGameFresh();
    game.initGame();
    game.__setState({ state: 'gameover', score: 10 });
    ctx.calls.length = 0;
    game.draw();
    const textos = ctx.calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    assert.ok(textos.some((t) => t.includes('1-4')), `gameover sin 1-4: ${textos}`);
  });
});
