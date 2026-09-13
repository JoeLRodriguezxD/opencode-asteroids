# AGENTS.md

Zero-dependency static game: HTML5 Canvas + vanilla JS. No bundler, runtime deps, lint, or CI beyond test workflow.

## Run

- `npx serve .` → `http://localhost:3000`, or open `index.html` directly (fixed 800×600 canvas, `game.js` via `<script>` tag).

## Tests

- `npm test` → `node --test "tests/*.test.js"` (Node >= 18, `node:test` + `node:assert`, no deps).
- Suites: `unit-fisica` (`wrap`/`dist`/`Bullet`/clamp `dt`/draw), `unit-entidades` (`Asteroid`/`split`/`Ship`+escudo/`Particle`/`PowerUp` velocidad+escudo), `integration-statemachine` (`initGame`/`nextLevel`/`killShip`/colisiones/estrella fugaz/niveles/escudo).
- `tests/helpers.js` (`loadGameFresh`/`installDom`/`mockRandom`/`mockDateNow`/`resetShipSafe` con `shieldTime=0`) installs `document`/`window` stubs before `require('../game.js')`; never set `requestAnimationFrame` before require or `game.js` auto-starts.
- `game.js` ends with guarded `module.exports` + `__getState`/`__setState` for tests; keep browser behavior identical (`initGame()` + `rAF` only when DOM + rAF exist).
- CI: `.github/workflows/test.yml` (push/PR, `setup-node lts/*`, `npm test`).

## Structure

- `index.html` — canvas shell + styles only; all logic in `game.js`.
- `game.js` (`'use strict'`, ~725 líneas) — clases `Ship`, `Asteroid`, `Bullet`, `Particle`, `PowerUp` (`PowerUp` con `kind='speed'|'shield'` + `Asteroid` con `opts.shootingStar` para la Estrella Fugaz) + state machine `playing | dead | gameover` (`initGame` / `nextLevel` / `spawnAsteroids` / `spawnShootingStar` / `explode` / `killShip` / `update` / `draw` / `loop`).
- Estado: `ship, bullets, asteroids, particles, powerups, score, lives, level, state, deadTimer, shootingStarTimer` (expuesto vía `__getState`/`__setState`).

## Gotchas

- Toroidal space: all movement wraps via `wrap(v, max)` — preserve it on new entities.
- `loop` clamps `dt` to `0.05`; use `dt`-scaled physics, never per-frame constants.
- Input uses `e.code` (`ArrowLeft/Right/Up`, `Space`); one-shot fire via `pressed('Space')` + `justPressed` — check `keys[]` for held, `pressed()` for edge.
- `RADII / SPEEDS / POINTS` indexed by size `3→1` (large→small); `Asteroid.split()` spawns 2× `size-1`, nothing at size 1.
- Power-up Velocidad (`SPEED_DURATION=5, SPEED_MULT=2, POWERUP_DROP_CHANCE=0.15, POWERUP_TTL=9`): solo dropea de asteroides normales, deriva con `wrap`, se recoge aun con `invincible`, reinicia `ship.speedTime` a 5s, nave cian `#0ff` + HUD `VELOCIDAD x2` con barra.
- Escudo (`SHIELD_DURATION=8, SHIELD_COLOR=#4da6ff, SHIELD_RADIUS=20, SHIELD_DROP_CHANCE=0.10`): `PowerUp` con `kind='shield'` (defecto `'speed'`), mismo `TTL`/deriva/`wrap`/parpadeo que velocidad; drop con un solo `roll` (`<0.10` escudo, `<0.25` velocidad, total 25% solo de normales, sin drop del kill por escudo ni de fugaz), se recoge aun con `invincible`, reinicia `ship.shieldTime` a 8s, anillo azul + HUD `ESCUDO Xs` simple (segunda línea si velocidad activo). Anillo parpadea últimos 2s (`shieldTime<2 && floor(*8)%2===0`, solo anillo, nave visible). Con `shieldTime>0` la colisión nave vs asteroide/fugaz destruye el asteroide (puntos + `split`, sin nuevo drop) en vez de `killShip()`; temporizado puro (no consume por impacto, protección sigue durante el parpadeo); `reset()`/`nextLevel()` lo ponen a 0.
- Estrella Fugaz (`SHOOTING_STAR_SPEED=175, TTL=6, POINTS=200, RADIUS=16, DELAY 7-12s, COLOR #ff8c1a`): spawn por timer (`spawnShootingStar`/`resetShootingStarTimer`, máx 1 activa, `SAFE_DIST=130` de la nave), no hace `split`, no bloquea `nextLevel()`, parpadea últimos 2s.
- Ship collision uses forgiving radius `a.radius * 0.82`; respawn = 3s `invincible` (blink) + 2s `deadTimer`; `nextLevel()` resets ship/bullets/particles/powerups + `resetShootingStarTimer()` and spawns `3+level` asteroids, keeps `score`/`lives` (`initGame` spawns 4).
- Ship tuning: `ROT=3.5, THRUST=260, DRAG=0.987, shootCooldown=0.2`; `Bullet` `SPEED=520, TTL=1.1, radius=2`.
- HUD/overlay text is Spanish (`NIVEL`, `PUNTAJE`); keep it.

## Maintenance

- Al cambiar `game.js`, `index.html`, `tests/` o workflow en el mismo commit/PR, actualizar este `AGENTS.md`: nº de líneas, clases/constantes/funciones nuevas, estado expuesto, gotchas de física/colisión/spawn/HUD y lista de suites.
