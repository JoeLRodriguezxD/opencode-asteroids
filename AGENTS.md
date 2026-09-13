# AGENTS.md

Zero-dependency static game: HTML5 Canvas + vanilla JS. No bundler, runtime deps, lint, or CI beyond test workflow.

## Run

- `npx serve .` → `http://localhost:3000`, or open `index.html` directly (fixed 800×600 canvas, `game.js` via `<script>` tag).

## Tests

- `npm test` → `node --test "tests/*.test.js"` (Node >= 18, `node:test` + `node:assert`, no deps).
- Suites: `unit-fisica` (`wrap`/`dist`/`Bullet`/clamp `dt`/draw), `unit-entidades` (`Asteroid`/`split`/`Ship`/`Particle`/`PowerUp`), `integration-statemachine` (`initGame`/`nextLevel`/`killShip`/colisiones/estrella fugaz/niveles), `triple-shot` (power-up triple: `kind`/`tryShoot` triple/drop 7.5-7.5/recogida/HUD `TRIPLE x3`).
- `tests/helpers.js` (`loadGameFresh`/`installDom`/`mockRandom`/`mockDateNow`/`resetShipSafe`) installs `document`/`window` stubs before `require('../game.js')`; never set `requestAnimationFrame` before require or `game.js` auto-starts.
- `game.js` ends with guarded `module.exports` + `__getState`/`__setState` for tests; keep browser behavior identical (`initGame()` + `rAF` only when DOM + rAF exist).
- CI: `.github/workflows/test.yml` (push/PR, `setup-node lts/*`, `npm test`).

## Structure

- `index.html` — canvas shell + styles only; all logic in `game.js`.
- `game.js` (`'use strict'`, ~730 lines) — classes `Ship`, `Asteroid`, `Bullet`, `Particle`, `PowerUp` (+ `Asteroid` con `opts.shootingStar` para la Estrella Fugaz; `PowerUp` con `kind: speed|triple`) + state machine `playing | dead | gameover` (`initGame` / `nextLevel` / `spawnAsteroids` / `spawnShootingStar` / `explode` / `killShip` / `update` / `draw` / `loop`).
- Estado: `ship, bullets, asteroids, particles, powerups, score, lives, level, state, deadTimer, shootingStarTimer` (expuesto vía `__getState`/`__setState`; el efecto triple vive en `ship.tripleTime`).

## Gotchas

- Toroidal space: all movement wraps via `wrap(v, max)` — preserve it on new entities.
- `loop` clamps `dt` to `0.05`; use `dt`-scaled physics, never per-frame constants.
- Input uses `e.code` (`ArrowLeft/Right/Up`, `Space`); one-shot fire via `pressed('Space')` + `justPressed` — check `keys[]` for held, `pressed()` for edge.
- `RADII / SPEEDS / POINTS` indexed by size `3→1` (large→small); `Asteroid.split()` spawns 2× `size-1`, nothing at size 1.
- Power-ups Velocidad + Triple (`SPEED_DURATION=5, SPEED_MULT=2, TRIPLE_DURATION=5, TRIPLE_SPREAD=0.15, SPEED_DROP_CHANCE=0.075, TRIPLE_DROP_CHANCE=0.10, POWERUP_TTL=9`): drop solo de asteroides normales con una tirada (`r<0.10` triple 10%, `r<0.175` velocidad 7.5%, total 17.5%), derivan con `wrap`, se recogen aun con `invincible`, reinician `ship.speedTime`/`ship.tripleTime` a 5s; nave cian `#0ff` con velocidad, amarilla `#ffd75e` con triple (prioridad triple) + HUDs `VELOCIDAD x2` / `TRIPLE x3` con barra apilados.
- Estrella Fugaz (`SHOOTING_STAR_SPEED=175, TTL=6, POINTS=200, RADIUS=16, DELAY 7-12s, COLOR #ff8c1a`): spawn por timer (`spawnShootingStar`/`resetShootingStarTimer`, máx 1 activa, `SAFE_DIST=130` de la nave), no hace `split`, no bloquea `nextLevel()`, parpadea últimos 2s.
- Ship collision uses forgiving radius `a.radius * 0.82`; respawn = 3s `invincible` (blink) + 2s `deadTimer`; `nextLevel()` resets ship/bullets/particles/powerups + `resetShootingStarTimer()` and spawns `3+level` asteroids, keeps `score`/`lives` (`initGame` spawns 4).
- Triple Shot power-up (`TRIPLE_DURATION=5, TRIPLE_SPREAD=0.15, TRIPLE_COLOR=#ffd75e`): `PowerUp` amarillo con 3 puntos; `Ship.tryShoot()` devuelve 3 `Bullet` en abanico si `tripleTime>0` (con `cooldown 0.2`), `tryTripleShot()` helper sin `cooldown`; sin `Space` no hay disparo; `ship.reset()` limpia el efecto; HUD `TRIPLE x3` + barra (apilado bajo `VELOCIDAD`).
- Ship tuning: `ROT=3.5, THRUST=260, DRAG=0.987, shootCooldown=0.2`; `Bullet` `SPEED=520, TTL=1.1, radius=2`.
- HUD/overlay text is Spanish (`NIVEL`, `PUNTAJE`); keep it.

## Maintenance

- Al cambiar `game.js`, `index.html`, `tests/` o workflow en el mismo commit/PR, actualizar este `AGENTS.md`: nº de líneas, clases/constantes/funciones nuevas, estado expuesto, gotchas de física/colisión/spawn/HUD y lista de suites.
