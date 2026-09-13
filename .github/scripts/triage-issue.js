'use strict';
// Lógica pura del triage de issues (sin dependencias, testeable en Node).
// El workflow .github/workflows/issue-triage.yml la reutiliza vía require.
// Reglas: preservar el texto original tal cual, formatear con plantilla fija,
// etiquetar con triage + bug/enhancement/question por palabras clave ES/EN.

const TRIAGE_MARKER = '<!-- asteroids-triage -->';

const LABEL_TRIAGE = 'triage';
const LABEL_BUG = 'bug';
const LABEL_ENHANCEMENT = 'enhancement';
const LABEL_QUESTION = 'question';

const BUG_PATTERN = /bug|error|fallo|falla|crash|no funciona|rompe|se congela|pantalla en blanco|no dispara|no colisiona/;
const ENHANCEMENT_PATTERN = /mejora|feature|nuevo|nueva|a[nñ]adir|agregar|sugiero|sugerencia|propuesta|skin|power-up|powerup|nivel|sonido|m[uú]sica|idea/;
const QUESTION_PATTERN = /\?|pregunta|duda|c[óo]mo|ayuda|no entiendo|por qu[eé]/;
// Pistas de que un bug trae info suficiente para reproducirlo.
const REPRO_PATTERN = /pasos|reproduc|esperado|actual|navegador|chrome|firefox|edge|safari|versi[oó]n|consola|stack|trace|evidencia|adjunto|screenshot|video/;

function normalize(text) {
  return (text || '').toLowerCase();
}

// Siempre incluye 'triage'; añade bug/enhancement/question según keywords en título+cuerpo.
function classifyLabels(title, body) {
  const text = normalize(title) + '\n' + normalize(body);
  const labels = [LABEL_TRIAGE];
  if (BUG_PATTERN.test(text)) labels.push(LABEL_BUG);
  if (ENHANCEMENT_PATTERN.test(text)) labels.push(LABEL_ENHANCEMENT);
  if (QUESTION_PATTERN.test(text)) labels.push(LABEL_QUESTION);
  return labels;
}

function isTriaged(body) {
  return (body || '').includes(TRIAGE_MARKER);
}

function humanType(labels) {
  if (labels.includes(LABEL_BUG)) return 'Bug';
  if (labels.includes(LABEL_ENHANCEMENT)) return 'Mejora';
  if (labels.includes(LABEL_QUESTION)) return 'Pregunta';
  return 'Por clasificar';
}

// true si es bug y le falta info mínima de reproducción.
function needsMoreInfo(labels, body) {
  if (!labels.includes(LABEL_BUG)) return false;
  const text = normalize(body);
  if (!text.trim()) return true;
  if (text.trim().length < 30) return true;
  return !REPRO_PATTERN.test(text);
}

// Construye el body formateado preservando el original verbatim (sin modificar).
function buildBody({ title, originalBody, author, createdAt, ref, sha }) {
  const safeTitle = title || '(sin título)';
  const hasOriginal = originalBody && originalBody.trim().length > 0;
  const original = hasOriginal ? originalBody : '_(sin descripción)_';
  const type = humanType(classifyLabels(title, originalBody));
  const lines = [
    TRIAGE_MARKER,
    `## ${safeTitle}`,
    '',
    '### Resumen',
    `Tipo detectado: **${type}**.`,
    '',
    '### Contenido original',
    '_Texto original del autor, sin modificar:_',
    '',
    original,
    '',
    '### Contexto',
    `- Autor: @${author || 'desconocido'}`,
    `- Fecha (UTC): ${createdAt || 'desconocida'}`,
    `- Ref: ${ref || ''}`,
    `- Commit: \`${sha || 'desconocido'}\``,
    '- Archivos clave: `game.js`, `index.html`, `tests/`',
    '',
    '### Siguiente paso',
    '- [ ] Revisor: confirmar tipo, quitar `triage` o re-etiquetar.',
    '- [ ] Autor (si es bug sin pasos): añadir pasos para reproducir, comportamiento esperado vs. actual y navegador/OS.',
    '',
  ];
  return lines.join('\n');
}

// Comentario de seguimiento solo cuando falta info (menciona al autor).
// El workflow ya evaluó needsMoreInfo(labels, body) antes de llamarla.
function buildFollowUpComment(labels, author) {
  return (
    `Hola @${author || 'autor'} :wave:, gracias por abrir el issue.\n\n` +
    'Para revisarlo necesitamos un poco más de info:\n' +
    '- Pasos para reproducirlo (1, 2, 3...).\n' +
    '- Comportamiento esperado vs. actual.\n' +
    '- Navegador/OS y, si hay error, texto de consola o captura.\n\n' +
    'El texto original quedó intacto arriba en **Contenido original**.'
  );
}

module.exports = {
  TRIAGE_MARKER,
  LABEL_TRIAGE,
  LABEL_BUG,
  LABEL_ENHANCEMENT,
  LABEL_QUESTION,
  classifyLabels,
  isTriaged,
  humanType,
  needsMoreInfo,
  buildBody,
  buildFollowUpComment,
};
