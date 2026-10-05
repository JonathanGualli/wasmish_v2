/** Definición cruda del botón, tal como Meta la devuelve y el backend la guarda. */
export interface TemplateButton {
    /** 'URL' | 'QUICK_REPLY' | 'COPY_CODE' | 'OTP' | 'PHONE_NUMBER' */
    type: string;
    text?: string;
    /** Solo en los de tipo URL. Si trae {{1}} es dinámica y pide un valor. */
    url?: string;
}

/** Lo que se manda al enviar: el valor de un botón, en su índice de la plantilla. */
export interface TemplateButtonParam {
    index: number;
    parameters: string[];
}

/** La cabecera de la plantilla, tal como la aprobó Meta. */
export interface TemplateHeader {
    /** 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'LOCATION' */
    format: string;
    /** Solo en las de texto. */
    text: string | null;
}

/** El archivo que se envía en la cabecera; se ve en `/api/templates/media/<id>`. */
export interface TemplateHeaderMedia {
    id: string;
    mimeType: string;
    filename: string | null;
    size: number;
}

export interface Template {
    templateId: string,
    name: string,
    language: string,
    category: string,
    status: string,
    bodyText: string,
    buttons?: TemplateButton[],
    /** `null` = sin cabecera; `undefined` = sincronizada antes de guardarla. */
    header?: TemplateHeader | null,
    headerMedia?: TemplateHeaderMedia | null,
    /** Última vez que la tocó una sincronización con Meta. */
    updatedAt?: string,
}
