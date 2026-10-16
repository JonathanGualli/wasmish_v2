// Por qué Meta desconectó un número (`Line.disconnectionReason`, el motivo de
// `PARTNER_REMOVED` tal cual), en palabras: la tabla 2d del diseño «Wasmish
// Líneas - Junto con la app». Un motivo que no se conoce, como «desconocido».

interface DisconnectionText {
    /** Por qué (segunda línea del aviso). */
    why: string;
    /** Qué hacer (tercera línea del aviso). */
    whatToDo: string;
}

const UNKNOWN: DisconnectionText = {
    why: 'Meta no dijo por qué.',
    whatToDo: 'Vuelve a conectar el número. Si se repite, escríbenos.',
};

const TEXTS: Record<string, DisconnectionText> = {
    PRIMARY_INACTIVITY: {
        why: 'El celular pasó unas dos semanas sin abrir la app de WhatsApp Business.',
        whatToDo: 'Abre la app en el celular y vuelve a conectar el número desde aquí.',
    },
    COMPANION_INACTIVITY: {
        why: 'Un dispositivo vinculado a la app estuvo un mes sin usarse.',
        whatToDo: 'Vuelve a conectar el número, con la app abierta en el celular.',
    },
    ACCOUNT_DISCONNECTED: {
        why: 'Alguien lo desconectó desde la app de WhatsApp Business, en Ajustes → Cuenta → Plataforma empresarial.',
        whatToDo: 'Si fue sin querer, vuelve a conectar el número.',
    },
    CHANGE_NUMBER: {
        why: 'El número cambió o se volvió a registrar en otro celular.',
        whatToDo: 'Vuelve a conectarlo con el celular donde está ahora la app.',
    },
    BUSINESS_DOWNGRADE: {
        why: 'El número dejó de ser una cuenta de empresa en WhatsApp.',
        whatToDo: 'Vuelve a ponerlo en la app de WhatsApp Business y conéctalo de nuevo.',
    },
};
TEXTS.USER_RE_REGISTERED = TEXTS.CHANGE_NUMBER;

export const disconnectionText = (reason: string | null): DisconnectionText => (reason && TEXTS[reason]) || UNKNOWN;

/** Lo que vale para cualquier motivo: las conversaciones se siguen leyendo. */
export const DISCONNECTED_CONVERSATIONS_NOTE = 'Sus conversaciones se siguen leyendo en Chats; para escribir, vuelve a conectarla.';
