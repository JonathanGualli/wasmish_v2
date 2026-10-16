// ---------------------------------------------------------------------------
// Respuestas automáticas: qué responder a un mensaje entrante. Todo puro, sin
// BD ni Meta: el worker (`workers/auto.reply.worker.js`) carga los datos, llama
// a `decideAutoReply` y envía. El porqué de cada regla está en
// docs/superpowers/specs/2026-10-15-respuestas-automaticas-design.md.
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Cada texto cabe con holgura: bienvenida + 3 palabras clave + fuera de
// horario, unidos, no pasan de los 4096 caracteres de WhatsApp.
export const AUTO_REPLY_TEXT_MAX = 800;
export const KEYWORD_RULES_MAX = 30;
export const KEYWORDS_PER_RULE_MAX = 20;
export const KEYWORD_MAX = 60;
// Cuántas reglas de palabras clave entran en una misma respuesta.
export const KEYWORD_REPLIES_MAX = 3;
// La misma regla no se repite en una conversación antes de esto.
export const KEYWORD_COOLDOWN_MS = DAY_MS;
// El freno anti-bucle: como mucho BURST_MAX respuestas en BURST_WINDOW_MS por
// conversación, por si al otro lado hay otro bot.
export const BURST_MAX = 3;
export const BURST_WINDOW_MS = 10 * MINUTE_MS;
// Un entrante más viejo que esto ya no se responde (tras una caída, o un
// webhook que Meta entregó tarde).
export const AUTO_REPLY_EXPIRY_MS = 10 * MINUTE_MS;
export const HANDOFF_HOURS = [1, 4, 12, 24];
export const RETURN_AFTER_DAYS = [7, 30, 90, null];
export const DEFAULT_TIMEZONE = 'America/Guayaquil';

/**
 * El texto listo para comparar: sin tildes ni mayúsculas, la puntuación como
 * espacio y los espacios repetidos como uno. «¿Cuánto CUESTA?» → «cuanto cuesta».
 */
export const normalizeForMatch = (text) => String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Si `keyword` aparece en `normalizedText` (ya pasado por `normalizeForMatch`)
 * como palabras completas: «precio» encuentra «el precio?» pero no «preciosa».
 */
export const matchesKeyword = (normalizedText, keyword) => {
    const normalizedKeyword = normalizeForMatch(keyword);
    if (!normalizedKeyword) return false;
    return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
};

/**
 * Lo que escribió el contacto, para buscar palabras clave: el cuerpo de un
 * texto o lo escrito junto a un archivo. Nunca la etiqueta automática
 * («Imagen»): esa no la escribió nadie.
 */
export const inboundMatchText = ({ type, text, caption }) => {
    if (type === 'text') return text ?? null;
    return caption ?? null;
};
