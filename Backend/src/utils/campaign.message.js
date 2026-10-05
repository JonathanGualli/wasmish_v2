// El mensaje de una campaña: qué variables y botones pide la plantilla, y
// con qué valor se rellena cada uno para cada contacto. Todo puro: lo usan la
// vista previa, la creación de la campaña y el worker que la envía.

import { templateHeaderIssue } from './template.header.js';

// De dónde sale el valor de una variable. `fixed` es el mismo texto para todos;
// el resto son datos del contacto, que pueden faltar y por eso piden reserva.
export const VARIABLE_SOURCES = ['fixed', 'name', 'firstName', 'company', 'phone', 'email'];

// Categorías que se pueden enviar en masivo. Las de autenticación llevan un
// código distinto por persona: mandar el mismo a cientos no tiene sentido.
export const BULK_CATEGORIES = ['MARKETING', 'UTILITY'];

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Las variables del cuerpo, sin repetir y en orden: `['1', '2']` en una
 * plantilla posicional, `['nombre', 'ciudad']` en una con nombres. Mismo
 * criterio que `extractPlaceholders` del frontend.
 */
export const extractTemplateVariables = (bodyText) => {
    if (!bodyText) return [];
    const keys = [...new Set([...bodyText.matchAll(PLACEHOLDER)].map(m => m[1].trim()))];
    return keys.every(k => /^\d+$/.test(k)) ? keys.sort((a, b) => Number(a) - Number(b)) : keys;
};

/**
 * 'POSITIONAL' o 'NAMED'. Lo dice Meta al sincronizar (`parameterFormat`); en
 * una plantilla sincronizada antes de guardarlo se deduce del texto.
 */
export const resolveParameterFormat = (template) => {
    if (template?.parameterFormat) return template.parameterFormat;
    const keys = extractTemplateVariables(template?.bodyText);
    return keys.length > 0 && keys.every(k => /^\d+$/.test(k)) ? 'POSITIONAL' : 'NAMED';
};

/**
 * Índices de los botones que exigen un valor al enviar. Mismo criterio que
 * `buttonsNeedingValue` del frontend y `buildButtonComponents`: el cupón y la
 * URL con una parte variable. (El OTP no: es de autenticación.)
 */
export const buttonsNeedingValue = (buttons = []) =>
    buttons
        .map((button, index) => ({ button, index }))
        .filter(({ button }) => button?.type === 'COPY_CODE' || (button?.type === 'URL' && Boolean(button.url?.includes('{{'))))
        .map(({ index }) => index);

/**
 * Errores de la configuración de una campaña (plantilla + cómo se rellena), como
 * `[{ field, message }]`, el formato de los 400 de la API. Vacío = válida.
 *
 * `config` es `{ variables: [{ key, source, value, fallback }], buttons: [{ index, … }] }`.
 */
export const validateCampaignMessage = (template, config = {}) => {
    const errors = [];

    if (!template) return [{ field: 'templateId', message: 'La plantilla no existe en tu cuenta. Sincroniza las plantillas.' }];
    if (template.status && template.status !== 'APPROVED') {
        errors.push({ field: 'templateId', message: 'La plantilla todavía no está aprobada por WhatsApp.' });
    }
    if (!BULK_CATEGORIES.includes(template.category)) {
        errors.push({ field: 'templateId', message: 'Las plantillas de autenticación no se pueden enviar de forma masiva.' });
    }
    const headerIssue = templateHeaderIssue(template);
    if (headerIssue) errors.push({ field: 'templateId', message: headerIssue });

    const checkEntry = (entry, field, label) => {
        if (!entry) {
            errors.push({ field, message: `Falta indicar de dónde sale ${label}.` });
            return;
        }
        if (!VARIABLE_SOURCES.includes(entry.source)) {
            errors.push({ field, message: `Origen desconocido para ${label}.` });
        } else if (entry.source === 'fixed' && !cleanValue(entry.value)) {
            errors.push({ field, message: `Escribe el texto de ${label}.` });
        } else if (entry.source !== 'fixed' && !cleanValue(entry.fallback)) {
            // Cualquier dato del contacto puede faltar (hasta el teléfono, en
            // quien escribió con su nombre de usuario), y Meta rechaza vacíos.
            errors.push({ field, message: `Escribe un valor de reserva para ${label}, por si el contacto no tiene ese dato.` });
        }
    };

    const variables = config.variables ?? [];
    extractTemplateVariables(template.bodyText).forEach(key => {
        checkEntry(variables.find(v => String(v.key) === key), `variables.${key}`, `la variable {{${key}}}`);
    });

    const buttons = config.buttons ?? [];
    buttonsNeedingValue(template.buttons).forEach(index => {
        const text = template.buttons[index]?.text;
        checkEntry(buttons.find(b => Number(b.index) === index), `buttons.${index}`, `el botón «${text ?? index}»`);
    });

    return errors;
};

/**
 * Meta rechaza un parámetro con saltos de línea, tabuladores o más de cuatro
 * espacios seguidos, y no admite más de 1024 caracteres. Un nombre o una
 * empresa con esas cosas haría fallar a ese contacto: se limpian antes.
 */
export const cleanValue = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1024);
};

const FIELD_READERS = {
    name: (c) => c.name || c.profileName,
    firstName: (c) => cleanValue(c.name || c.profileName).split(' ')[0],
    company: (c) => c.company,
    phone: (c) => (c.phone ? `+${c.phone}` : null),
    email: (c) => c.email,
};

/**
 * El valor de una variable para un contacto: `{ value, usedFallback }`.
 * `usedFallback` sirve para contar en la vista previa a cuántos les tocará la
 * reserva («31 contactos no tienen empresa»).
 */
export const resolveVariableValue = (entry, contact = {}) => {
    if (entry.source === 'fixed') return { value: cleanValue(entry.value), usedFallback: false };

    const own = cleanValue(FIELD_READERS[entry.source]?.(contact));
    if (own) return { value: own, usedFallback: false };
    return { value: cleanValue(entry.fallback), usedFallback: true };
};

/** La clave de un botón en `fallbacks` y en los valores de la vista previa. */
export const buttonKey = (index) => `button.${index}`;

/**
 * Lo que recibe un contacto en cada variable y en cada botón, como
 * `{ [clave]: { value, usedFallback } }` con las claves `'1'`, `'nombre'` o
 * `'button.0'`. La vista previa lo usa para resaltar cada dato en el mensaje.
 */
export const resolveContactValues = (template, config, contact) => {
    const values = {};
    extractTemplateVariables(template.bodyText).forEach(key => {
        const entry = (config.variables ?? []).find(v => String(v.key) === key);
        values[key] = resolveVariableValue(entry, contact);
    });
    buttonsNeedingValue(template.buttons).forEach(index => {
        const entry = (config.buttons ?? []).find(b => Number(b.index) === index);
        values[buttonKey(index)] = resolveVariableValue(entry, contact);
    });
    return values;
};

/**
 * Los parámetros de un contacto en el formato de `processTemplateSending`:
 * posicionales `['Ana', 'Quito']` o nombrados `[{ name, value }]`, y los botones
 * como `[{ index, parameters: [valor] }]`. `fallbacks` lista las claves que
 * cayeron en la reserva (`'1'`, `'nombre'`, `'button.0'`).
 */
export const buildContactParameters = (template, config, contact) => {
    const values = resolveContactValues(template, config, contact);
    const keys = extractTemplateVariables(template.bodyText);

    let parameters;
    if (resolveParameterFormat(template) === 'POSITIONAL') {
        // Meta espera {{1}}..{{n}} seguidos: el array va por posición.
        parameters = keys.map(Number).reduce((list, n) => {
            list[n - 1] = values[String(n)].value;
            return list;
        }, []);
    } else {
        parameters = keys.map(key => ({ name: key, value: values[key].value }));
    }

    const buttons = buttonsNeedingValue(template.buttons)
        .map(index => ({ index, parameters: [values[buttonKey(index)].value] }));

    const fallbacks = Object.keys(values).filter(key => values[key].usedFallback);
    return { parameters, buttons, fallbacks, values };
};
