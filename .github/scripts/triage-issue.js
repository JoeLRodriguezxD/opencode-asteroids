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
const AREA_RULES = [
  ['nave', /nave|ship|dispar|bala|bullet|thrust|rotaci[oó]n|colisi[oó]n|choque|invencib|escudo|respawn/],
  ['asteroides', /asteroide|fragmento|split|grande|mediano|peque[ñn]o|fugaz|estrella/],
  ['power-up', /power-?up|velocidad|triple|orbe|drop/],
  ['skins', /skin|cl[aá]sica|interceptor|caza|orca|tit[aá]n|morada|nave.*color|estela/],
  ['HUD-nivel', /hud|puntaje|score|nivel|level|vidas|game over|overlay|roster/],
  ['tests', /test|npm test|node:test|workflow|ci|agentes/],
];
const SEVERITY_HIGH_PATTERN = /crash|pantalla en blanco|se congela|no inicia|no carga|no abre/;
const SEVERITY_MID_PATTERN = /no funciona|no dispara|no colisiona|rompe|fallo|falla|error/;

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

function collapse(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function truncate(text, max) {
  const t = collapse(text);
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

function firstMeaningfulLine(body) {
  const lines = (body || '').split(/\r?\n/);
  for (const line of lines) {
    const t = collapse(line).replace(/^#+\s*/, '');
    if (t) return t;
  }
  return '';
}

// Resumen breve de lo que se pide (solo lectura del título + cuerpo).
function summarizeRequest(title, body, max = 200) {
  const t = collapse(title);
  const first = firstMeaningfulLine(body);
  if (!t && !first) return '_(sin contenido para resumir)_';
  if (!t) return truncate(first, max);
  if (!first || normalize(first) === normalize(t)) return truncate(t, max);
  return truncate(`${t}. ${first}`, max);
}

// Síntesis autogenerada para ### Descripción (no modifica el original).
function buildDescription(title, body, max = 280) {
  const t = collapse(title);
  const first = firstMeaningfulLine(body);
  if (!t && !first) return '_(sin descripción)_';
  if (!t) return truncate(first, max);
  if (!first) return truncate(t, max);
  if (normalize(first) === normalize(t)) return truncate(t, max);
  return truncate(`${t}. ${first}`, max);
}

function detectArea(title, body) {
  const text = normalize(title) + '\n' + normalize(body);
  for (const [area, re] of AREA_RULES) {
    if (re.test(text)) return area;
  }
  return 'general';
}

function detectSeverity(title, body) {
  const text = normalize(title) + '\n' + normalize(body);
  if (SEVERITY_HIGH_PATTERN.test(text)) return 'alta';
  if (SEVERITY_MID_PATTERN.test(text)) return 'media';
  return 'por revisar';
}

// Riesgos como una línea (puede combinar varios, separados por '; ').
function detectRisks({ labels, area, body }) {
  const risks = [];
  if (/nave|asteroides|power-up/.test(area)) {
    risks.push('toca física/colisiones/wrap: riesgo de romper niveles, respawn y drops');
  }
  if (area === 'skins') {
    risks.push('toca skins: riesgo en HUD/persistencia y doble puntos de TITÁN');
  }
  if (area === 'HUD-nivel') {
    risks.push('toca HUD/niveles: riesgo en textos en español y avance de nivel');
  }
  if (needsMoreInfo(labels, body)) {
    risks.push('falta info de reproducción: riesgo de no reproducible');
  }
  if (risks.length === 0) return 'bajo/desconocido con la info actual';
  return risks.join('; ');
}

function buildRelevantInfo(title, body) {
  const labels = classifyLabels(title, body);
  const type = humanType(labels);
  const area = detectArea(title, body);
  const alcance = type;
  const severidad = detectSeverity(title, body);
  const riesgos = detectRisks({ labels, area, body });
  return { tipo: type, area, alcance, severidad, riesgos };
}

// Construye el body formateado preservando el original verbatim (sin modificar).
// Orden: Resumen / Información relevante / Descripción / Contenido original / Contexto / Siguiente paso.
function buildBody({ title, originalBody, author, createdAt, ref, sha }) {
  const safeTitle = collapse(title) || '(sin título)';
  const hasOriginal = originalBody && originalBody.trim().length > 0;
  const original = hasOriginal ? originalBody : '_(sin descripción)_';
  const labels = classifyLabels(title, originalBody);
  const type = humanType(labels);
  const summary = summarizeRequest(title, originalBody);
  const info = buildRelevantInfo(title, originalBody);
  const description = buildDescription(title, originalBody);
  const lines = [
    TRIAGE_MARKER,
    `## ${safeTitle}`,
    '',
    '### Resumen',
    `Tipo detectado: **${type}**.`,
    `Resumen: ${summary}`,
    '',
    '### Información relevante',
    `- Tipo: ${info.tipo}`,
    `- Área probable: ${info.area}`,
    `- Alcance: ${info.alcance}`,
    `- Severidad aparente: ${info.severidad}`,
    `- Riesgos: ${info.riesgos}`,
    '',
    '### Descripción',
    description,
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
  summarizeRequest,
  buildDescription,
  detectArea,
  detectSeverity,
  detectRisks,
  buildRelevantInfo,
  buildBody,
  buildFollowUpComment,
};
