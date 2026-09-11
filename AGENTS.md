# AGENTS.md

Zero-dependency static game: HTML5 Canvas + vanilla JS. No bundler, runtime deps, lint, or CI beyond test workflow.

## Run

- `npx serve .` → `http://localhost:3000`, or open `index.html` directly (fixed 800×600 canvas, `game.js` via `<script>` tag).

## Tests

- `npm test` → `node --test "tests/*.test.js"` (Node >= 18, `node:test` + `node:assert`, no deps).
- Suites: `unit-fisica` (`wrap`/`dist`/`Bullet`/clamp `dt`/draw), `unit-entidades` (`Asteroid`/`split`/`Ship`/`Particle`/`PowerUp`), `integration-statemachine` (`initGame`/`nextLevel`/`killShip`/colisiones/estrella fugaz/niveles).
- `tests/helpers.js` (`loadGameFresh`/`installDom`/`mockRandom`/`mockDateNow`/`resetShipSafe`) installs `document`/`window` stubs before `require('../game.js')`; never set `requestAnimationFrame` before require or `game.js` auto-starts.
- `game.js` ends with guarded `module.exports` + `__getState`/`__setState` for tests; keep browser behavior identical (`initGame()` + `rAF` only when DOM + rAF exist).
- CI: `.github/workflows/test.yml` (push/PR, `setup-node lts/*`, `npm test`).

## Structure

- `index.html` — canvas shell + styles only; all logic in `game.js`.
- `game.js` (`'use strict'`, ~660 lines) — classes `Ship`, `Asteroid`, `Bullet`, `Particle`, `PowerUp` (+ `Asteroid` con `opts.shootingStar` para la Estrella Fugaz) + state machine `playing | dead | gameover` (`initGame` / `nextLevel` / `spawnAsteroids` / `spawnShootingStar` / `explode` / `killShip` / `update` / `draw` / `loop`).
- Estado: `ship, bullets, asteroids, particles, powerups, score, lives, level, state, deadTimer, shootingStarTimer` (expuesto vía `__getState`/`__setState`).

## Gotchas

- Toroidal space: all movement wraps via `wrap(v, max)` — preserve it on new entities.
- `loop` clamps `dt` to `0.05`; use `dt`-scaled physics, never per-frame constants.
- Input uses `e.code` (`ArrowLeft/Right/Up`, `Space`); one-shot fire via `pressed('Space')` + `justPressed` — check `keys[]` for held, `pressed()` for edge.
- `RADII / SPEEDS / POINTS` indexed by size `3→1` (large→small); `Asteroid.split()` spawns 2× `size-1`, nothing at size 1.
- Power-up Velocidad (`SPEED_DURATION=5, SPEED_MULT=2, POWERUP_DROP_CHANCE=0.15, POWERUP_TTL=9`): solo dropea de asteroides normales, deriva con `wrap`, se recoge aun con `invincible`, reinicia `ship.speedTime` a 5s, nave cian `#0ff` + HUD `VELOCIDAD x2` con barra.
- Estrella Fugaz (`SHOOTING_STAR_SPEED=175, TTL=6, POINTS=200, RADIUS=16, DELAY 7-12s, COLOR #ff8c1a`): spawn por timer (`spawnShootingStar`/`resetShootingStarTimer`, máx 1 activa, `SAFE_DIST=130` de la nave), no hace `split`, no bloquea `nextLevel()`, parpadea últimos 2s.
- Ship collision uses forgiving radius `a.radius * 0.82`; respawn = 3s `invincible` (blink) + 2s `deadTimer`; `nextLevel()` resets ship/bullets/particles/powerups + `resetShootingStarTimer()` and spawns `3+level` asteroids, keeps `score`/`lives` (`initGame` spawns 4).
- Ship tuning: `ROT=3.5, THRUST=260, DRAG=0.987, shootCooldown=0.2`; `Bullet` `SPEED=520, TTL=1.1, radius=2`.
- HUD/overlay text is Spanish (`NIVEL`, `PUNTAJE`); keep it.

## Maintenance

- Al cambiar `game.js`, `index.html`, `tests/` o workflow en el mismo commit/PR, actualizar este `AGENTS.md`: nº de líneas, clases/constantes/funciones nuevas, estado expuesto, gotchas de física/colisión/spawn/HUD y lista de suites.
