'use strict';

let canvas = null;
let ctx = null;
if (typeof document !== 'undefined') {
  canvas = document.getElementById('canvas');
  if (canvas && typeof canvas.getContext === 'function') {
    ctx = canvas.getContext('2d');
  }
}
if (!ctx) {
  // Stub mínimo para Node/tests (sin canvas real). En navegador nunca se usa.
  const noop = () => {};
  ctx = new Proxy({}, { get: () => noop, set: () => true });
}
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
}

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, color = '#fff') {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.color = color; // color de la nave al disparar (congelado)
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = this.color || '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// ── Estrella Fugaz ────────────────────────────────────────────────────────────
const SHOOTING_STAR_SPEED   = 175;      // ~2x del asteroide pequeño (85)
const SHOOTING_STAR_TTL     = 6;        // segundos antes de desaparecer
const SHOOTING_STAR_POINTS  = 200;      // bonus por destruirla
const SHOOTING_STAR_COLOR   = '#ff8c1a';// naranja meteoro
const SHOOTING_STAR_RADIUS  = 16;       // equivalente a tamaño 1
const SHOOTING_STAR_MIN_DELAY = 7;      // intervalo mínimo de aparición
const SHOOTING_STAR_MAX_DELAY = 12;     // intervalo máximo de aparición

class Asteroid {
  constructor(x, y, size = 3, opts = {}) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.dead = false;
    this.isShootingStar = !!opts.shootingStar;

    if (this.isShootingStar) {
      this.radius = SHOOTING_STAR_RADIUS;
      this.ttl  = SHOOTING_STAR_TTL;
      this.life = SHOOTING_STAR_TTL;
    } else {
      this.radius = RADII[size];
    }

    const angle = rand(0, Math.PI * 2);
    const baseSpeed = this.isShootingStar ? SHOOTING_STAR_SPEED : SPEEDS[size];
    const speed = baseSpeed + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
    if (this.isShootingStar) {
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }
  }

  split() {
    if (this.isShootingStar) return [];
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    // Parpadeo últimos 2s antes de desaparecer
    if (this.isShootingStar && this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;

    // Estela meteorito: 3 líneas con degradado fuego
    if (this.isShootingStar) {
      const speed = Math.hypot(this.vx, this.vy) || 1;
      const dx = this.vx / speed, dy = this.vy / speed; // dirección
      const px = -dy, py = dx;                          // perpendicular
      const trails = [
        { off: 0,  len: 0.22, color: 'rgba(255,220,150,0.9)', w: 2.5 }, // central fuego claro
        { off: 5,  len: 0.14, color: 'rgba(255,140,26,0.55)', w: 1.5 }, // lateral naranja
        { off: -5, len: 0.14, color: 'rgba(255,140,26,0.55)', w: 1.5 },
      ];
      ctx.save();
      ctx.shadowColor = SHOOTING_STAR_COLOR;
      ctx.shadowBlur  = 12;
      ctx.lineCap = 'round';
      for (const t of trails) {
        ctx.strokeStyle = t.color;
        ctx.lineWidth   = t.w;
        ctx.beginPath();
        ctx.moveTo(this.x + px * t.off, this.y + py * t.off);
        ctx.lineTo(this.x + px * t.off - dx * speed * t.len,
                   this.y + py * t.off - dy * speed * t.len);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = this.isShootingStar ? SHOOTING_STAR_COLOR : '#fff';
    if (this.isShootingStar) {
      ctx.shadowColor = SHOOTING_STAR_COLOR;
      ctx.shadowBlur  = 12;
    }
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Skins de nave ─────────────────────────────────────────────────────────────
// Cada skin define color + estela + variante de silueta (teclas Digit1-4).
// La física (radius=12, NOSE=21) es idéntica para todas.
const SHIP_SKINS = [
  { id: 'clasica',     name: 'CLÁSICA',     color: '#ffffff', flame: 'rgba(255, 130, 0, 0.85)' },
  { id: 'interceptor', name: 'INTERCEPTOR', color: '#4dd2ff', flame: 'rgba(77, 210, 255, 0.9)' },
  { id: 'caza',        name: 'CAZA',        color: '#ffa500', flame: 'rgba(255, 165, 0, 0.9)' },
  { id: 'orca',        name: 'ORCA',        color: '#7cfc00', flame: 'rgba(124, 252, 0, 0.9)' },
];
const DEFAULT_SKIN = 'clasica';
const SKIN_STORAGE_KEY = 'asteroids-ship-skin';
let currentSkin = DEFAULT_SKIN;

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.speedTime     = 0;
    this.tripleTime    = 0;
    this.shieldTime    = 0;
    this.dead          = false;
    this.skin          = currentSkin;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.speedTime     > 0) this.speedTime     -= dt;
    if (this.tripleTime    > 0) this.tripleTime    -= dt;
    if (this.shieldTime    > 0) this.shieldTime    -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;
    const mult = this.speedTime > 0 ? SPEED_MULT : 1;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * mult * dt;
      this.vy += Math.sin(this.angle) * THRUST * mult * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    if (this.tripleTime > 0) return this.tryTripleShot();
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    return [new Bullet(ox, oy, this.angle, getSkin(this.skin).color)];
  }

  tryTripleShot() {
    if (this.dead) return [];
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    const color = getSkin(this.skin).color;
    return [
      new Bullet(ox, oy, this.angle - TRIPLE_SPREAD, color),
      new Bullet(ox, oy, this.angle, color),
      new Bullet(ox, oy, this.angle + TRIPLE_SPREAD, color),
    ];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    const skin = getSkin(this.skin);
    const boosted = this.speedTime > 0;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = this.tripleTime > 0 ? TRIPLE_COLOR : boosted ? '#0ff' : skin.color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta según la skin (misma física para todas: radius 12, NOSE 21)
    shipPath(skin.id);
    ctx.stroke();

    // Llama del propulsor (color propio de cada skin, cian con velocidad x2)
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, boosted ? 28 : 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = boosted ? 'rgba(0, 255, 255, 0.9)' : skin.flame;
      ctx.stroke();
    }

    ctx.restore();

    // Anillo del escudo (sin rotar, centrado en la nave).
    // Parpadea últimos 2s como aviso de expiración (solo el anillo, la nave sigue visible).
    if (this.shieldTime > 0 && !(this.shieldTime < 2 && Math.floor(this.shieldTime * 8) % 2 === 0)) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = SHIELD_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, SHIELD_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Power-ups (Velocidad, Triple Shot y Escudo) ─────────────────────────────────
const SPEED_DURATION = 5;    // segundos de efecto
const SPEED_MULT     = 2;    // multiplicador de empuje
const SPEED_DROP_CHANCE  = 0.15;  // 15%: probabilidad de orbe de velocidad
const TRIPLE_DROP_CHANCE = 0.10;  // 10%: probabilidad de orbe triple
const SHIELD_DROP_CHANCE = 0.10;  // 10%: probabilidad de orbe escudo
const POWERUP_TTL = 9;       // segundos antes de desaparecer si no se recoge

// ── Triple Shot (power-up temporal) ───────────────────────────────────────────
const TRIPLE_DURATION = 5;       // segundos de efecto tras recoger el orbe
const TRIPLE_SPREAD   = 0.15;    // desvío lateral en radianes (abanico clásico)
const TRIPLE_COLOR    = '#ffd75e'; // amarillo, distinto del cian de velocidad
const POWERUP_KIND_SPEED  = 'speed';
const POWERUP_KIND_TRIPLE = 'triple';
const POWERUP_KIND_SHIELD = 'shield';

// ── Escudo ──────────────────────────────────────────────────────────────────
const SHIELD_DURATION = 8;      // segundos de protección
const SHIELD_COLOR    = '#4da6ff'; // azul, distinto de cian #0ff y naranja #ff8c1a
const SHIELD_RADIUS   = 20;     // radio del anillo alrededor de la nave

class PowerUp {
  constructor(x, y, kind = POWERUP_KIND_SPEED) {
    this.x = x;
    this.y = y;
    this.kind = kind === POWERUP_KIND_TRIPLE ? POWERUP_KIND_TRIPLE
      : kind === POWERUP_KIND_SHIELD ? POWERUP_KIND_SHIELD
      : POWERUP_KIND_SPEED;
    this.radius = 12;
    this.ttl  = POWERUP_TTL;
    this.life = POWERUP_TTL;
    this.dead = false;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(15, 35);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo últimos 2s para avisar que expira
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;

    const pulse = 1 + Math.sin(Date.now() / 200) * 0.08;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pulse, pulse);

    // Círculo exterior según tipo
    const color = this.kind === POWERUP_KIND_TRIPLE ? TRIPLE_COLOR
      : this.kind === POWERUP_KIND_SHIELD ? SHIELD_COLOR
      : '#0ff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    if (this.kind === POWERUP_KIND_TRIPLE) {
      // Tres puntos amarillos (símbolo de triple disparo)
      ctx.fillStyle = color;
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.arc(dx, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.kind === POWERUP_KIND_SHIELD) {
      // Escudo central (silueta de escudo)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, -5);
      ctx.lineTo(6, 1);
      ctx.lineTo(0, 8);
      ctx.lineTo(-6, 1);
      ctx.lineTo(-6, -5);
      ctx.closePath();
      ctx.fill();
    } else {
      // Rayo central (símbolo de velocidad)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(-4, 1);
      ctx.lineTo(-1, 1);
      ctx.lineTo(-2, 8);
      ctx.lineTo(4, -1);
      ctx.lineTo(1, -1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let shootingStarTimer;

// ── Skins: helpers ────────────────────────────────────────────────────────────
function getSkin(id) {
  return SHIP_SKINS.find(s => s.id === id) || SHIP_SKINS[0];
}

function getShipSkin() {
  return currentSkin;
}

// Lee la skin persistida (no-op seguro en Node/tests sin localStorage).
function loadSkin() {
  try {
    if (typeof localStorage === 'undefined') return currentSkin;
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved && SHIP_SKINS.some(s => s.id === saved)) currentSkin = saved;
  } catch (_) { /* almacenamiento no disponible: se queda la actual */ }
  return currentSkin;
}

function saveSkin() {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(SKIN_STORAGE_KEY, currentSkin);
  } catch (_) { /* modo privado / sin almacenamiento: se ignora */ }
}

// Cambia la skin actual (+ nave viva) y la persiste. Retorna false si id inválido.
function setShipSkin(id) {
  if (!SHIP_SKINS.some(s => s.id === id)) return false;
  currentSkin = id;
  if (typeof ship !== 'undefined' && ship) ship.skin = id;
  saveSkin();
  return true;
}

// Teclas Digit1-4 → selección directa de skin. Se consume vía pressed() (one-shot).
function checkSkinInput() {
  for (let i = 0; i < SHIP_SKINS.length; i++) {
    if (pressed('Digit' + (i + 1))) setShipSkin(SHIP_SKINS[i].id);
  }
}

// Traza la silueta de la nave según la variante (solo moveTo/lineTo/closePath).
// El ctx ya debe estar trasladado y rotado; no hace stroke ni restore.
function shipPath(variant) {
  ctx.beginPath();
  switch (variant) {
    case 'interceptor': // cometa/diamante: la única con cola en punta (sin muesca)
      ctx.moveTo( 22,  0);   // nariz larga
      ctx.lineTo(  0, -6);   // flanco superior
      ctx.lineTo(-12,  0);   // cola en punta
      ctx.lineTo(  0,  6);   // flanco inferior
      break;
    case 'caza': // doble ala en X: la única con puntas barridas
      ctx.moveTo( 19,   0);  // nariz
      ctx.lineTo(-13, -12);  // punta ala superior
      ctx.lineTo( -7,  -3);  // quilla superior
      ctx.lineTo( -7,   3);  // quilla inferior
      ctx.lineTo(-13,  12);  // punta ala inferior
      break;
    case 'orca': // casco voluminoso de 8 puntos: la única "gorda"
      ctx.moveTo( 18,   0);  // nariz
      ctx.lineTo(  6,  -9);  // hombro superior
      ctx.lineTo( -6, -10);  // lomo superior
      ctx.lineTo(-12,  -4);  // aleta superior
      ctx.lineTo( -9,   0);  // muesca trasera
      ctx.lineTo(-12,   4);  // aleta inferior
      ctx.lineTo( -6,  10);  // lomo inferior
      ctx.lineTo(  6,   9);  // hombro inferior
      break;
    default: // 'clasica': triángulo con muesca trasera
      ctx.moveTo( 20,  0);   // nariz
      ctx.lineTo(-12, -9);   // ala izquierda
      ctx.lineTo( -7,  0);   // muesca trasera
      ctx.lineTo(-12,  9);   // ala derecha
  }
  ctx.closePath();
}

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function resetShootingStarTimer() {
  shootingStarTimer = rand(SHOOTING_STAR_MIN_DELAY, SHOOTING_STAR_MAX_DELAY);
}

function spawnShootingStar() {
  if (asteroids.some(a => a.isShootingStar && !a.dead)) return; // máx 1 activa
  const SAFE_DIST = 130;
  let x, y;
  do {
    x = rand(0, W);
    y = rand(0, H);
  } while (Math.hypot(x - ship.x, y - ship.y) < SAFE_DIST);
  asteroids.push(new Asteroid(x, y, 1, { shootingStar: true }));
}

function initGame() {
  loadSkin();
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerups  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
  resetShootingStarTimer();
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerups  = [];
  ship.reset();
  spawnAsteroids(3 + level);
  resetShootingStarTimer();
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'gameover') {
    checkSkinInput();
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    asteroids = asteroids.filter(a => !a.dead);
    powerups.forEach(p => p.update(dt));
    powerups = powerups.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar (si el triple está activo, tryShoot() devuelve 3 balas)
  checkSkinInput();
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  powerups.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  asteroids = asteroids.filter(a => !a.dead);
  particles = particles.filter(p => !p.dead);
  powerups  = powerups.filter(p => !p.dead);

  // Aparición por tiempo de la Estrella Fugaz
  shootingStarTimer -= dt;
  if (shootingStarTimer <= 0) {
    spawnShootingStar();
    resetShootingStarTimer();
  }

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += a.isShootingStar ? SHOOTING_STAR_POINTS : POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        if (!a.isShootingStar) {
          // Una sola tirada con 3 kinds (total 35%):
          // r<0.10 escudo (10%), 0.10<=r<0.20 triple (10%), 0.20<=r<0.35 velocidad (15%)
          const r = Math.random();
          if (r < SHIELD_DROP_CHANCE) powerups.push(new PowerUp(a.x, a.y, POWERUP_KIND_SHIELD));
          else if (r < SHIELD_DROP_CHANCE + TRIPLE_DROP_CHANCE) powerups.push(new PowerUp(a.x, a.y, POWERUP_KIND_TRIPLE));
          else if (r < SHIELD_DROP_CHANCE + TRIPLE_DROP_CHANCE + SPEED_DROP_CHANCE) powerups.push(new PowerUp(a.x, a.y, POWERUP_KIND_SPEED));
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide (el escudo destruye el asteroide sin matar la nave)
  if (ship.invincible <= 0 && !ship.dead) {
    const shielded = ship.shieldTime > 0;
    const shieldKills = [];
    for (const a of asteroids) {
      if (!a.dead && dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (shielded) {
          a.dead = true;
          score += a.isShootingStar ? SHOOTING_STAR_POINTS : POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          shieldKills.push(...a.split());
          // Sin drop de power-up aquí para evitar cadenas.
        } else {
          killShip();
          break;
        }
      }
    }
    if (shieldKills.length > 0)
      asteroids = asteroids.filter(a => !a.dead).concat(shieldKills);
  }

  // Nave vs power-up (se permite recoger aun con invencibilidad)
  if (!ship.dead) {
    for (const p of powerups) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        if (p.kind === POWERUP_KIND_SHIELD) ship.shieldTime = SHIELD_DURATION; // reinicia a 8s
        else if (p.kind === POWERUP_KIND_TRIPLE) ship.tripleTime = TRIPLE_DURATION; // reinicia a 5s
        else ship.speedTime = SPEED_DURATION; // reinicia a 5s si ya estaba activo
        explode(p.x, p.y, 6);
      }
    }
    powerups = powerups.filter(p => !p.dead);
  }

  // Nivel completado (la Estrella Fugaz no bloquea el avance)
  if (asteroids.filter(a => !a.isShootingStar).length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y, skinId) {
  const skin = getSkin(typeof skinId !== 'undefined' ? skinId : currentSkin);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(0.5, 0.5); // mini-versión de la silueta real
  ctx.strokeStyle = skin.color;
  ctx.lineWidth   = 2.4; // ≈1.2 efectivo tras la escala
  ctx.lineJoin    = 'round';
  shipPath(skin.id);
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Roster de naves abajo a la izquierda: número + nombre, cada una en su color
  ctx.textAlign = 'left';
  ctx.font = '13px monospace';
  SHIP_SKINS.forEach((s, i) => {
    const y = H - 14 - (SHIP_SKINS.length - 1 - i) * 16;
    ctx.fillStyle = s.color;
    ctx.fillText(`${currentSkin === s.id ? '►' : ' '} ${i + 1} ${s.name}`, 14, y);
  });

  // Indicador de power-up Velocidad: texto numérico + barra
  if (state === 'playing' && ship && ship.speedTime > 0) {
    const remaining = Math.max(0, ship.speedTime);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0ff';
    ctx.font = '15px monospace';
    ctx.fillText(`VELOCIDAD x2  ${remaining.toFixed(1)}s`, 14, 48);

    const bw = 120, bh = 8, bx = 14, by = 56;
    ctx.fillStyle = 'rgba(0,255,255,0.2)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#0ff';
    ctx.fillRect(bx, by, bw * Math.min(1, remaining / SPEED_DURATION), bh);
    ctx.strokeStyle = 'rgba(0,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }

  // Indicador Triple Shot: duración restante del efecto + barra (apilado bajo VELOCIDAD)
  if (state === 'playing' && ship && ship.tripleTime > 0) {
    const remaining = Math.max(0, ship.tripleTime);
    const hasSpeed = ship.speedTime > 0;
    const ty = hasSpeed ? 78 : 48;
    const by = hasSpeed ? 86 : 56;
    const progress = Math.min(1, remaining / TRIPLE_DURATION);
    ctx.textAlign = 'left';
    ctx.fillStyle = TRIPLE_COLOR;
    ctx.font = '15px monospace';
    ctx.fillText(`TRIPLE x3  ${remaining.toFixed(1)}s`, 14, ty);

    const bw = 120, bh = 8, bx = 14;
    ctx.fillStyle = 'rgba(255,215,94,0.2)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = TRIPLE_COLOR;
    ctx.fillRect(bx, by, bw * progress, bh);
    ctx.strokeStyle = 'rgba(255,215,94,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }

  // Indicador de escudo: texto + barra, apilado bajo velocidad+triple
  if (state === 'playing' && ship && ship.shieldTime > 0) {
    const remaining = Math.max(0, ship.shieldTime);
    const hasSpeed = ship.speedTime > 0;
    const hasTriple = ship.tripleTime > 0;
    const y = (hasSpeed && hasTriple) ? 108 : (hasSpeed || hasTriple) ? 78 : 48;
    const by = y + 8;
    const progress = Math.min(1, remaining / SHIELD_DURATION);
    ctx.textAlign = 'left';
    ctx.fillStyle = SHIELD_COLOR;
    ctx.font = '15px monospace';
    ctx.fillText(`ESCUDO  ${remaining.toFixed(1)}s`, 14, y);

    const bw = 120, bh = 8, bx = 14;
    ctx.fillStyle = 'rgba(77,166,255,0.2)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = SHIELD_COLOR;
    ctx.fillRect(bx, by, bw * progress, bh);
    ctx.strokeStyle = 'rgba(77,166,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  powerups.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR   —   1-4 CAMBIAR NAVE`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// Solo auto-arranque en navegador (con canvas real + rAF). En Node/tests no.
if (typeof requestAnimationFrame !== 'undefined' && typeof document !== 'undefined' && document.getElementById('canvas')) {
initGame();
requestAnimationFrame(loop);
}

// ── Exports para testing (Node) ───────────────────────────────────────────────
// En navegador `module` no existe y este bloque no hace nada.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    W, H,
    RADII, SPEEDS, POINTS,
    SHOOTING_STAR_SPEED, SHOOTING_STAR_TTL, SHOOTING_STAR_POINTS,
    SHOOTING_STAR_COLOR, SHOOTING_STAR_RADIUS,
    SHOOTING_STAR_MIN_DELAY, SHOOTING_STAR_MAX_DELAY,
    SPEED_DURATION, SPEED_MULT, SPEED_DROP_CHANCE, TRIPLE_DROP_CHANCE, SHIELD_DROP_CHANCE, POWERUP_TTL,
    POWERUP_KIND_SPEED, POWERUP_KIND_TRIPLE, POWERUP_KIND_SHIELD,
    TRIPLE_DURATION, TRIPLE_SPREAD, TRIPLE_COLOR,
    SHIELD_DURATION, SHIELD_COLOR, SHIELD_RADIUS,
    SHIP_SKINS, DEFAULT_SKIN, SKIN_STORAGE_KEY,
    getSkin, getShipSkin, setShipSkin, loadSkin, saveSkin,
    checkSkinInput, shipPath,
    wrap, dist, rand, randInt,
    Bullet, Asteroid, Ship, Particle, PowerUp,
    keys, justPressed, pressed,
    spawnAsteroids, resetShootingStarTimer, spawnShootingStar,
    initGame, nextLevel, explode, killShip, update, draw, drawHUD, drawOverlay, drawLifeIcon, loop,
    get canvas() { return canvas; },
    get ctx() { return ctx; },
    get currentSkin() { return currentSkin; },
    __getState() {
      return { ship, bullets, asteroids, particles, powerups, score, lives, level, state, deadTimer, shootingStarTimer, lastTime, currentSkin };
    },
    __setState(patch = {}) {
      const hasShipPatch = 'ship' in patch;
      if (hasShipPatch) ship = patch.ship;
      if ('bullets' in patch) bullets = patch.bullets;
      if ('asteroids' in patch) asteroids = patch.asteroids;
      if ('particles' in patch) particles = patch.particles;
      if ('powerups' in patch) powerups = patch.powerups;
      if ('score' in patch) score = patch.score;
      if ('lives' in patch) lives = patch.lives;
      if ('level' in patch) level = patch.level;
      if ('state' in patch) state = patch.state;
      if ('deadTimer' in patch) deadTimer = patch.deadTimer;
      if ('shootingStarTimer' in patch) shootingStarTimer = patch.shootingStarTimer;
      if ('lastTime' in patch) lastTime = patch.lastTime;
      if ('currentSkin' in patch) {
        currentSkin = patch.currentSkin;
        // Sincroniza la nave viva salvo que el parche traiga su propia nave.
        if (!hasShipPatch && typeof ship !== 'undefined' && ship) ship.skin = currentSkin;
      }
    },
  };
}
