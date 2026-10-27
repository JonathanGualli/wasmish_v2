export type LineStatus = 'active' | 'disconnected';

/** Una línea de WhatsApp de la cuenta (`GET /lines`). Nunca trae el token. */
export interface Line {
    id: string;
    /** Nombre interno que le pone la cuenta («Ventas»); `null` = sin nombre. */
    name: string | null;
    phoneNumberId: string;
    /** El número como lo enseña Meta. `null` en alguna línea antigua. */
    displayPhoneNumber: string | null;
    /** El nombre del negocio que ve el cliente en WhatsApp. */
    verifiedName: string | null;
    status: LineStatus;
    isDefault: boolean;
    waBusinessId: string | null;
    /** El orden de conexión: decide el color de la línea. */
    createdAt: string;
    connectedAt: string | null;
    disconnectedAt: string | null;
    /** Si Wasmish guardó el PIN de dos pasos del número (el PIN se pide aparte, `GET /lines/:id/pin`). */
    hasTwoStepPin: boolean;
    /** El número sigue en la app de WhatsApp Business (coexistencia), según Meta. */
    businessApp: boolean;
    /** Por qué la desconectó Meta, tal cual; `null` si no lo dijo o se desconectó desde Wasmish. */
    disconnectionReason: DisconnectionReason | null;
    /** Los chats y la agenda de la app al conectar; `null` si esta conexión no los pidió. */
    historySync: HistorySync | null;
}

/**
 * Cómo van los chats de la app de WhatsApp Business de una línea, ya resumido
 * por el backend (`historySyncView`): `requested` y `pending`, pedido sin
 * respuesta; `receiving`, llegando; `done` y `partial`, terminado (con piezas
 * perdidas); `declined`, el negocio no los compartió; `none`, pasaron las 24 h
 * sin nada; `failed`, no se pudo pedir.
 */
export interface HistorySync {
    status: 'requested' | 'pending' | 'receiving' | 'done' | 'partial' | 'declined' | 'none' | 'failed';
    /** De 0 a 100, el mayor que mandó Meta; `null` hasta el primer trozo. */
    progress: number | null;
    /** Los chats que no se pudieron traer. */
    failedThreads: number;
    /** Qué pedidos se pueden repetir (`POST /lines/:id/history-sync`). */
    retryable: ('contacts' | 'history')[];
    canRetry: boolean;
    /** Hasta cuándo se puede pedir: 24 h desde la conexión. */
    retryUntil: string;
}

/** Los motivos de Meta al retirar el acceso (`PARTNER_REMOVED`); puede llegar otro. */
export type DisconnectionReason =
    | 'PRIMARY_INACTIVITY' | 'COMPANION_INACTIVITY' | 'ACCOUNT_DISCONNECTED'
    | 'CHANGE_NUMBER' | 'USER_RE_REGISTERED' | 'BUSINESS_DOWNGRADE' | (string & {});

export interface LinesResponse {
    lines: Line[];
    /** Cuántas líneas conectadas permite el plan de la cuenta. */
    maxLines: number;
    /** La que pasaría a ser la por defecto si se desconecta la actual. */
    nextDefaultLineId: string | null;
}

export interface LineUpdate {
    name?: string | null;
    isDefault?: true;
}

/** El `code` de los errores de conectar y de gestionar líneas (backend: `LINE_ERROR_CODES`). */
export const LINE_ERROR = {
    busy: 'line_busy',
    limit: 'line_limit',
    defaultInactive: 'default_line_inactive',
    phoneNumberTaken: 'phone_number_taken',
    phoneNumberNotInWaba: 'phone_number_not_in_waba',
    wabaTaken: 'waba_taken',
    registrationFailed: 'phone_number_registration_failed',
} as const;
