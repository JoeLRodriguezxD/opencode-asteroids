# Asteroids

Clon del clásico arcade **Asteroids** implementado en canvas HTML5 puro, sin dependencias ni bundler.

## Descripción

Nave espacial en un campo de asteroides con envolvimiento de bordes (el espacio es toroidal). Destruye asteroides para sumar puntos: los grandes se parten en medianos, los medianos en pequeños. Incluye power-ups especiales y tipos de asteroides únicos como la estrella fugaz.

## Tecnologías

- **HTML5 Canvas** — renderizado 2D
- **JavaScript (ES6+)** — lógica del juego en un solo archivo `game.js`
- Sin frameworks, sin bundler, sin dependencias

## Cómo correr

Abre `index.html` directamente en el navegador (doble clic), o usa un servidor local:

```bash
npx serve .
```

Luego visita `http://localhost:3000`.

## Controles

| Tecla     | Acción     |
| --------- | ---------- |
| `←` `→`   | Rotar nave |
| `↑`       | Propulsar  |
| `Espacio` | Disparar   |

## Puntuación

| Asteroide | Puntos |
| --------- | ------ |
| Grande    | 20     |
| Mediano   | 50     |
| Pequeño   | 100    |

## Características

- 3 vidas con invencibilidad temporal al reaparecer (parpadeo)
- Asteroides se parten en fragmentos más pequeños al ser destruidos
- Partículas de explosión al destruir asteroides

## Tests

Sin dependencias: usa el runner built-in de Node (`node:test` + `node:assert`).

```bash
npm test
# equivale a: node --test "tests/*.test.js"
```

- `tests/unit-fisica.test.js` — `wrap`, `dist`, `Bullet`, clamp `dt<=0.05` en `loop`, `draw`/HUD en español.
- `tests/unit-entidades.test.js` — `Asteroid`/`split`, `Ship`, `Particle`, `PowerUp`.
- `tests/integration-statemachine.test.js` — `initGame`/`nextLevel`, `killShip`, disparo, colisiones, estrella fugaz, niveles.
- Requiere Node >= 18.
