# AGENTS.md

Zero-dependency static game: HTML5 Canvas + vanilla JS. No bundler, runtime deps, lint, or CI beyond test workflow.

## Run

- `npx serve .` → `http://localhost:3000`, or open `index.html` directly (fixed 800×600 canvas, `game.js` via `<script>` tag).

## Tests

- `npm test` → `node --test "tests/*.test.js"` (Node >= 18, `node:test` + `node:assert`, no deps).
- `tests/helpers.js` installs `document`/`window` stubs before `require('../game.js')`; never set `requestAnimationFrame` before require or `game.js` auto-starts.
- `game.js` ends with guarded `module.exports` + `__getState`/`__setState` for tests; keep browser behavior identical (`initGame()` + `rAF` only when DOM + rAF exist).

## Structure

- `index.html` — canvas shell + styles only; all logic in `game.js`.
- `game.js` (`'use strict'`, ~420 lines) — classes `Ship`, `Asteroid`, `Bullet`, `Particle` + state machine `playing | dead | gameover` (`initGame` / `nextLevel` / `update` / `draw` / `loop`).

## Gotchas

- Toroidal space: all movement wraps via `wrap(v, max)` — preserve it on new entities.
- `loop` clamps `dt` to `0.05`; use `dt`-scaled physics, never per-frame constants.
- Input uses `e.code` (`ArrowLeft/Right/Up`, `Space`); one-shot fire via `pressed('Space')` + `justPressed` — check `keys[]` for held, `pressed()` for edge.
- `RADII / SPEEDS / POINTS` indexed by size `3→1` (large→small); `Asteroid.split()` spawns 2× `size-1`, nothing at size 1.
- Ship collision uses forgiving radius `a.radius * 0.82`; respawn = 3s `invincible` (blink) + 2s `deadTimer`; `nextLevel()` resets ship/bullets/particles but keeps `score`/`lives`.
- HUD/overlay text is Spanish (`NIVEL`, `PUNTAJE`); keep it.
