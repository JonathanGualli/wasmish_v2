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

export interface Template {
    templateId: string,
    name: string,
    language: string,
    category: string,
    status: string,
    bodyText: string,
    buttons?: TemplateButton[],
}
