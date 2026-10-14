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
}

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
