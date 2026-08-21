import type { Template } from "../models/template.model";

const LEGACY_PREFIX = 'Plantilla: ';

/**
 * Shim TEMPORAL para el historial.
 *
 * Los mensajes de plantilla enviados antes de que el backend guardara el texto
 * renderizado quedaron como: "Plantilla: nombre | Datos: [a, b, c]".
 * Esta función los reconstruye al vuelo para que el historial no se vea roto.
 *
 * Los mensajes nuevos ya llegan renderizados y salen por el primer return sin
 * tocarse. Cuando no queden mensajes con el formato viejo, esto se puede borrar.
 *
 * Si el parseo es dudoso (por ejemplo, un parámetro que contenía una coma),
 * devuelve el texto original en lugar de arriesgarse a mostrar algo incorrecto.
 */
export const renderLegacyTemplateText = (text: string, templates: Template[]): string => {
    if (!text?.startsWith(LEGACY_PREFIX)) return text;

    const [name, datos] = text.slice(LEGACY_PREFIX.length).split(' | Datos: ');

    const template = templates.find(t => t.name === name?.trim());
    if (!template?.bodyText) return text;

    // Sin parámetros: el body tal cual
    if (!datos) return template.bodyText;

    const params = datos.replace(/^\[/, '').replace(/\]$/, '').split(', ');

    // Solo posicionales: el formato nombrado ("clave: valor") no es reparseable
    // con seguridad, así que ahí preferimos no tocar nada.
    const placeholders = template.bodyText.match(/\{\{\s*\d+\s*\}\}/g) ?? [];
    const distintos = new Set(placeholders).size;

    // Si el número de datos no cuadra con el de huecos, el split por comas se
    // comió algo → mostramos el original antes que un mensaje equivocado.
    if (distintos === 0 || distintos !== params.length) return text;

    return template.bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => {
        const value = params[Number(index) - 1];
        return value === undefined ? match : value;
    });
}
