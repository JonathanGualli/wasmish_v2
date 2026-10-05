import type { TemplateButton } from '../models/template.model';

/**
 * Marcadores del cuerpo, en orden de aparición y sin repetidos:
 * "Hola {{1}}, tu pedido {{2}} sale hoy, {{1}}" → ["1", "2"]
 * "Hola {{nombre}}" → ["nombre"]
 */
export const extractPlaceholders = (bodyText?: string): string[] => {
    if (!bodyText) return [];
    const found = bodyText.match(/\{\{\s*([^}]+?)\s*\}\}/g) ?? [];
    return [...new Set(found.map(m => m.replace(/[{}]/g, '').trim()))];
};

/** Meta distingue los dos formatos, y el backend también: {{1}} es posicional. */
export const isPositional = (placeholders: string[]) =>
    placeholders.length > 0 && placeholders.every(p => /^\d+$/.test(p));

/**
 * Botones que exigen un valor al enviar, con su índice en la plantilla.
 * Mismo criterio que `buildButtonComponents` en el backend: quick reply y URL
 * fija no llevan parámetro — de hecho una URL sin {{ }} hace que Meta
 * responda 132018 y el backend la rechaza con 400 antes de llamarla.
 */
export const buttonsNeedingValue = (buttons?: TemplateButton[]) =>
    (buttons ?? [])
        .map((button, index) => ({ button, index }))
        .filter(({ button }) =>
            button.type === 'OTP'
            || button.type === 'COPY_CODE'
            || (button.type === 'URL' && Boolean(button.url?.includes('{{'))));

/** Etiqueta del campo de un botón: dice qué se está pidiendo y de cuál botón. */
export const buttonFieldLabel = (button: TemplateButton) => {
    const nombre = button.text ? `«${button.text}»` : 'sin texto';
    if (button.type === 'OTP') return `Código del botón ${nombre}`;
    if (button.type === 'COPY_CODE') return `Código a copiar del botón ${nombre}`;
    return `Valor de la URL del botón ${nombre}`;
};

/** Las variables en el orden en que se rellenan: {{1}} antes que {{2}}; las nombradas, como aparecen. */
export const orderedPlaceholders = (bodyText?: string) => {
    const keys = extractPlaceholders(bodyText);
    return isPositional(keys) ? [...keys].sort((a, b) => Number(a) - Number(b)) : keys;
};

const CONTEXT_CHARS = 36;

/**
 * El texto que rodea a la primera aparición de una variable, para saber cuál
 * es cuál: «…20% de descuento en » + {{2}} + «. Te esperamos.».
 */
export const placeholderContext = (bodyText: string, key: string) => {
    const match = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`).exec(bodyText);
    if (!match) return { before: '', after: '' };
    const start = match.index;
    const end = start + match[0].length;
    const before = bodyText.slice(Math.max(0, start - CONTEXT_CHARS), start);
    const after = bodyText.slice(end, end + CONTEXT_CHARS);
    return {
        before: start > CONTEXT_CHARS ? `…${before}` : before,
        after: end + CONTEXT_CHARS < bodyText.length ? `${after}…` : after,
    };
};
