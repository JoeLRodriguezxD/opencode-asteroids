# AGENTS.md

Zero-dependency static game: HTML5 Canvas + vanilla JS. No bundler, runtime deps, lint, or CI beyond test workflow.

## Run

- `npx serve .` → `http://localhost:3000`, or open `index.html` directly (fixed 800×600 canvas, `game.js` via `<script>` tag).

## Tests

- `npm test` → `node --test "tests/*.test.js"` (Node >= 18, `node:test` + `node:assert`, no deps).
- Suites: `unit-fisica` (`wrap`/`dist`/`Bullet`/clamp `dt`/draw), `unit-entidades` (`Asteroid`/`split`/`Ship`+escudo+triple/`Particle`/`PowerUp` 3 kinds), `unit-skins` (skins: `Digit1-4`/persistencia/dibujo/HUD), `integration-statemachine` (`initGame`/`nextLevel`/`killShip`/colisiones/estrella fugaz/niveles/escudo), `triple-shot` (power-up triple: `kind`/`tryShoot` triple/drop 15-10-10/recogida/HUD `TRIPLE x3`).
- `tests/helpers.js` (`loadGameFresh`/`installDom`/`mockRandom`/`mockDateNow`/`resetShipSafe` con `tripleTime=0`+`shieldTime=0` y `skin='clasica'`) installs `document`/`window` stubs before `require('../game.js')`; never set `requestAnimationFrame` before require or `game.js` auto-starts.
- `game.js` ends with guarded `module.exports` + `__getState`/`__setState` for tests; keep browser behavior identical (`initGame()` + `rAF` only when DOM + rAF exist).
- CI: `.github/workflows/test.yml` (push/PR, `setup-node lts/*`, `npm test`).

## Structure

- `index.html` — canvas shell + styles only; all logic in `game.js`.
- `game.js` (`'use strict'`, ~807 lines) — classes `Ship`, `Asteroid`, `Bullet`, `Particle`, `PowerUp` (`PowerUp` con `kind: speed|triple|shield` + `Asteroid` con `opts.shootingStar` para la Estrella Fugaz) + state machine `playing | dead | gameover` (`initGame` / `nextLevel` / `spawnAsteroids` / `spawnShootingStar` / `explode` / `killShip` / `update` / `draw` / `loop`) + skins de nave (`SHIP_SKINS` / `getSkin` / `setShipSkin` / `loadSkin` / `saveSkin` / `checkSkinInput` / `shipPath`).
- Estado: `ship, bullets, asteroids, particles, powerups, score, lives, level, state, deadTimer, shootingStarTimer, currentSkin` (expuesto vía `__getState`/`__setState`; efectos temporales en `ship.speedTime`/`ship.tripleTime`/`ship.shieldTime`).

## Gotchas

- Toroidal space: all movement wraps via `wrap(v, max)` — preserve it on new entities.
- `loop` clamps `dt` to `0.05`; use `dt`-scaled physics, never per-frame constants.
- Input uses `e.code` (`ArrowLeft/Right/Up`, `Space`); one-shot fire via `pressed('Space')` + `justPressed` — check `keys[]` for held, `pressed()` for edge.
- `RADII / SPEEDS / POINTS` indexed by size `3→1` (large→small); `Asteroid.split()` spawns 2× `size-1`, nothing at size 1.
- Power-ups Velocidad + Triple + Escudo (`SPEED_DURATION=5, SPEED_MULT=2, TRIPLE_DURATION=5, TRIPLE_SPREAD=0.15, SHIELD_DURATION=8, SPEED_DROP_CHANCE=0.15, TRIPLE_DROP_CHANCE=0.10, SHIELD_DROP_CHANCE=0.10, POWERUP_TTL=9`): drop solo de asteroides normales con una tirada (`r<0.10` escudo 10%, `r<0.20` triple 10%, `r<0.35` velocidad 15%, total 35%), derivan con `wrap`, se recogen aun con `invincible`, reinician `ship.speedTime`/`ship.tripleTime`/`ship.shieldTime`; nave amarilla `#ffd75e` con triple (prioridad triple), cian `#0ff` con velocidad, si no color de la skin + HUDs `VELOCIDAD x2` / `TRIPLE x3` con barra / `ESCUDO Xs` apilados (velocidad→triple→escudo).
- Escudo (`SHIELD_DURATION=8, SHIELD_COLOR=#4da6ff, SHIELD_RADIUS=20, SHIELD_DROP_CHANCE=0.10`): `PowerUp` con `kind='shield'` (defecto `'speed'`, `POWERUP_KIND_*` para los 3), mismo `TTL`/deriva/`wrap`/parpadeo que velocidad; drop con un solo `roll` (escudo→triple→velocidad, total 35% solo de normales, sin drop del kill por escudo ni de fugaz), se recoge aun con `invincible`, reinicia `ship.shieldTime` a 8s, anillo azul + HUD `ESCUDO Xs` simple (apilado bajo velocidad/triple). Anillo parpadea últimos 2s (`shieldTime<2 && floor(*8)%2===0`, solo anillo, nave visible). Con `shieldTime>0` la colisión nave vs asteroide/fugaz destruye el asteroide (puntos + `split`, sin nuevo drop) en vez de `killShip()`; temporizado puro (no consume por impacto, protección sigue durante el parpadeo); `reset()`/`nextLevel()` lo ponen a 0.
- Estrella Fugaz (`SHOOTING_STAR_SPEED=175, TTL=6, POINTS=200, RADIUS=16, DELAY 7-12s, COLOR #ff8c1a`): spawn por timer (`spawnShootingStar`/`resetShootingStarTimer`, máx 1 activa, `SAFE_DIST=130` de la nave), no hace `split`, no bloquea `nextLevel()`, parpadea últimos 2s.
- Ship collision uses forgiving radius `a.radius * 0.82`; respawn = 3s `invincible` (blink) + 2s `deadTimer`; `nextLevel()` resets ship/bullets/particles/powerups + `resetShootingStarTimer()` and spawns `3+level` asteroids, keeps `score`/`lives` (`initGame` spawns 4).
- Triple Shot power-up (`TRIPLE_DURATION=5, TRIPLE_SPREAD=0.15, TRIPLE_COLOR=#ffd75e`): `PowerUp` amarillo con 3 puntos; `Ship.tryShoot()` devuelve 3 `Bullet` en abanico si `tripleTime>0` (con `cooldown 0.2`), `tryTripleShot()` helper sin `cooldown`; sin `Space` no hay disparo; `ship.reset()` limpia el efecto; HUD `TRIPLE x3` + barra (apilado bajo `VELOCIDAD`).
- Ship tuning: `ROT=3.5, THRUST=260, DRAG=0.987, shootCooldown=0.2`; `Bullet` `SPEED=520, TTL=1.1, radius=2`.
- Skins de nave (`SHIP_SKINS`: `clasica`/`interceptor`/`caza`/`orca`, `DEFAULT_SKIN='clasica'`, `SKIN_STORAGE_KEY='asteroids-ship-skin'`): selección directa con `Digit1-4` vía `checkSkinInput()` (one-shot `pressed()`, en `playing` y `gameover`), solo color + forma + estela — física intacta (`radius=12`, `NOSE=21`, colisión `0.82`). Siluetas estructuralmente distintas vía `shipPath()`: `clasica` triángulo con muesca, `interceptor` cometa/diamante con cola en punta, `caza` doble ala en X, `orca` casco de 8 puntos. `Ship.reset()` fija `ship.skin=currentSkin`; `nextLevel()` y respawn la conservan; solo `initGame()` recarga con `loadSkin()`. Persistencia en `localStorage` con `try/catch` (no-op en Node/tests). `Bullet(x, y, angle, color='#fff')` congela el color de la skin al disparar (`tryShoot()` pasa `getSkin(this.skin).color`); con velocidad x2 la nave es cian pero sus balas mantienen el color de la skin. `drawLifeIcon(x, y, skinId)` dibuja mini-silueta (`scale 0.5`) con el color de la skin; con velocidad x2 el trazo sigue cian `#0ff`. HUD muestra el roster abajo a la izquierda (`► N NOMBRE` por skin, cada línea en su color); gameover sugiere `1-4 CAMBIAR NAVE`.
- HUD/overlay text is Spanish (`NIVEL`, `PUNTAJE`); keep it.

## Maintenance

- Al cambiar `game.js`, `index.html`, `tests/` o workflow en el mismo commit/PR, actualizar este `AGENTS.md`: nº de líneas, clases/constantes/funciones nuevas, estado expuesto, gotchas de física/colisión/spawn/HUD y lista de suites.
