'use strict';
// Triage de issues: clasificación por keywords, preservación del original,
// plantilla con marker de idempotencia y detección de falta de info.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const triage = require('../.github/scripts/triage-issue.js');

describe('triage: classifyLabels', () => {
  it('siempre incluye triage', () => {
    assert.deepEqual(triage.classifyLabels('hola', 'mundo'), ['triage']);
  });

  it('detecta bug en ES/EN', () => {
    assert.ok(triage.classifyLabels('El juego hace crash', '').includes('bug'));
    assert.ok(triage.classifyLabels('', 'no funciona el disparo').includes('bug'));
    assert.ok(triage.classifyLabels('error en game.js', '').includes('bug'));
  });

  it('detecta mejora/feature', () => {
    assert.ok(triage.classifyLabels('Nueva skin de nave', '').includes('enhancement'));
    assert.ok(triage.classifyLabels('', 'sugiero un power-up nuevo').includes('enhancement'));
  });

  it('detecta pregunta', () => {
    assert.ok(triage.classifyLabels('¿Cómo corro el juego?', '').includes('question'));
    assert.ok(triage.classifyLabels('', 'tengo una duda con los niveles').includes('question'));
  });

  it('puede poner varias a la vez + triage primero', () => {
    const labels = triage.classifyLabels('Bug con la nueva feature?', 'error grave, ¿cómo lo arreglo?');
    assert.equal(labels[0], 'triage');
    assert.ok(labels.includes('bug'));
    assert.ok(labels.includes('question'));
  });
});

describe('triage: idempotencia', () => {
  it('isTriaged detecta el marker', () => {
    assert.equal(triage.isTriaged('hola'), false);
    assert.equal(triage.isTriaged(`${triage.TRIAGE_MARKER}\n## x`), true);
  });

  it('buildBody incluye el marker para no reformatear dos veces', () => {
    const body = triage.buildBody({ title: 't', originalBody: 'x' });
    assert.ok(body.includes(triage.TRIAGE_MARKER));
  });
});

describe('triage: preservación del original', () => {
  it('mantiene el texto tal cual (verbatim)', () => {
    const original = 'Mi reporte   con  espacios\nY *markdown* raro <>&"';
    const body = triage.buildBody({
      title: 'Fallo raro',
      originalBody: original,
      author: 'alguien',
      createdAt: '2026-01-01T00:00:00Z',
      ref: 'owner/repo#1',
      sha: 'main@abc1234',
    });
    assert.ok(body.includes(original));
    assert.ok(body.includes('### Contenido original'));
  });

  it('marca (sin descripción) si viene vacío', () => {
    const body = triage.buildBody({ title: 'Vacío', originalBody: '   ' });
    assert.ok(body.includes('_(sin descripción)_'));
  });
});

describe('triage: plantilla y contexto', () => {
  it('incluye Resumen/Contexto/Siguiente paso + metadata', () => {
    const body = triage.buildBody({
      title: 'Mi bug',
      originalBody: 'no funciona nada, error grave en game.js',
      author: 'ana',
      createdAt: '2026-09-13T00:00:00Z',
      ref: 'acme/asteroids#42',
      sha: 'main@deadbee',
    });
    for (const section of ['### Resumen', '### Contenido original', '### Contexto', '### Siguiente paso']) {
      assert.ok(body.includes(section), `falta ${section}`);
    }
    assert.ok(body.includes('@ana'));
    assert.ok(body.includes('acme/asteroids#42'));
    assert.ok(body.includes('main@deadbee'));
    assert.ok(body.includes('game.js'));
    assert.ok(body.includes('Tipo detectado: **Bug**'));
  });
});

describe('triage: needsMoreInfo', () => {
  it('bug corto o vacío pide más info; bug detallado no', () => {
    assert.equal(triage.needsMoreInfo(['triage', 'bug'], ''), true);
    assert.equal(triage.needsMoreInfo(['triage', 'bug'], 'se rompe'), true);
    assert.equal(
      triage.needsMoreInfo(
        ['triage', 'bug'],
        'Pasos: 1 abrir index.html 2 disparar. Esperado: parte el asteroide. Actual: se congela en Chrome, ver consola.'
      ),
      false
    );
  });

  it('no-bug nunca pide más info', () => {
    assert.equal(triage.needsMoreInfo(['triage', 'enhancement'], ''), false);
    assert.equal(triage.needsMoreInfo(['triage'], ''), false);
  });
});
