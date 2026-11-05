// ---------------------------------------------------------------------------
// Las opciones de las respuestas automáticas (bot con menús): el id que va a
// Meta en cada botón o fila, y el `interactive` que se envía. Todo puro. El
// id dice adónde lleva la opción, así un toque se resuelve sin buscar el
// mensaje del menú. Spec: docs/superpowers/specs/2026-11-05-bot-menus-design.md.
// ---------------------------------------------------------------------------

export const OPTIONS_MAX = 10;
// El de los botones de respuesta; la lista admite 24, pero el formato se
// decide al enviar y la opción tiene que caber en los dos.
export const OPTION_TITLE_MAX = 20;
export const BUTTONS_MAX = 3;
// El cuerpo de los botones; el de la lista llega a 4096.
export const BUTTON_BODY_MAX = 1024;
export const LIST_BUTTON_TEXT = 'Ver opciones';
export const DEFAULT_HANDOFF_TEXT = 'Enseguida te atiende alguien del equipo';

const PREFIX = 'wasmish:';
const RULE_PREFIX = `${PREFIX}r:`;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** El id que va a Meta: `wasmish:r:<ruleId>`, `wasmish:start` o `wasmish:person`. */
export const optionId = ({ target, ruleId }) =>
    (target === 'rule' ? `${RULE_PREFIX}${ruleId}` : `${PREFIX}${target}`);

/**
 * Adónde lleva el id de un toque, o null si no es una opción de Wasmish (un
 * toque viejo, o de otra integración): ese se trata como un texto escrito.
 */
export const parseOptionId = (id) => {
    if (typeof id !== 'string') return null;
    if (id === `${PREFIX}start`) return { target: 'start' };
    if (id === `${PREFIX}person`) return { target: 'person' };
    if (id.startsWith(RULE_PREFIX)) {
        const ruleId = id.slice(RULE_PREFIX.length);
        if (OBJECT_ID.test(ruleId)) return { target: 'rule', ruleId };
    }
    return null;
};

/**
 * El `interactive` de Meta para un texto con opciones (`{ id, title }`, ya con
 * su id). Hasta 3 opciones y el cuerpo en 1024: botones de respuesta. Si no,
 * una lista con «Ver opciones» (decisión A del spec: un solo mensaje, aunque
 * el texto no quepa en botones).
 */
export const buildInteractivePayload = ({ text, options }) => {
    if (options.length <= BUTTONS_MAX && text.length <= BUTTON_BODY_MAX) {
        return {
            format: 'buttons',
            interactive: {
                type: 'button',
                body: { text },
                action: { buttons: options.map(({ id, title }) => ({ type: 'reply', reply: { id, title } })) },
            },
        };
    }
    return {
        format: 'list',
        interactive: {
            type: 'list',
            body: { text },
            action: {
                button: LIST_BUTTON_TEXT,
                sections: [{ rows: options.map(({ id, title }) => ({ id, title })) }],
            },
        },
    };
};
