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

/** Vista previa: sustituye lo que ya escribió y deja el marcador si está vacío. */
export const previewTemplate = (bodyText: string, values: Record<string, string>) =>
    bodyText.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key: string) =>
        values[key.trim()]?.trim() || match);

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
