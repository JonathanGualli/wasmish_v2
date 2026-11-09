import type { CampaignStatus } from "./campaign.model";

/** Definición cruda del botón, tal como Meta la devuelve y el backend la guarda. */
export interface TemplateButton {
    /** 'URL' | 'QUICK_REPLY' | 'COPY_CODE' | 'OTP' | 'PHONE_NUMBER' */
    type: string;
    text?: string;
    /** Solo en los de tipo URL. Si trae {{1}} es dinámica y pide un valor. */
    url?: string;
    /** Solo en los de tipo PHONE_NUMBER: el número al que llama. */
    phone_number?: string;
    /** El ejemplo que se mandó a Meta: la URL entera (con la parte variable) o el código a copiar. */
    example?: string | string[];
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

/** Un ejemplo de variable, tal como se mandó a Meta para aprobar la plantilla. */
export interface TemplateExample {
    key: string;
    example: string;
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
    /** Su cuenta de WhatsApp Business: solo se envía por una línea de esa cuenta. `null` = sincronizada antes de guardarla. */
    waBusinessId: string | null,
    /** Última vez que la tocó una sincronización con Meta. */
    updatedAt?: string,
    /** El pie, en gris bajo el cuerpo. `null` = sin pie; `undefined` = sincronizada antes de guardarlo. */
    footerText?: string | null,
    /** Los ejemplos de las variables que se mandaron a Meta: `key` es '1', '2'… o el nombre. */
    bodyExamples?: TemplateExample[],
    /** El ejemplo de la variable de la cabecera de texto. */
    headerExample?: string | null,
    /** 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' */
    qualityScore?: string | null,
    /** El motivo de Meta si la rechazó (por ejemplo 'INVALID_FORMAT'). */
    rejectedReason?: string | null,
    previousCategory?: string | null,
    subCategory?: string | null,
    /** Última modificación en Meta. */
    metaUpdatedAt?: string | null,
    /** Cuándo dejó de llegar al sincronizar: se borró en Meta y ya no se envía. */
    deletedInMetaAt?: string | null,
    /** El último sync completo de su WABA, o `null` si nunca terminó uno. */
    syncedAt?: string | null,
}

/** El uso de una plantilla en lo que la persona puede ver. `delivered` incluye los leídos. */
export interface TemplateUsage {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    lastSentAt: string | null;
}

/** Una campaña que usó la plantilla. */
export interface TemplateCampaign {
    id: string;
    name: string;
    status: CampaignStatus;
    createdAt: string;
}

/** `GET /templates/:templateId`. Sin `campaigns` si la persona no gestiona campañas. */
export interface TemplateDetail {
    template: Template;
    usage: TemplateUsage;
    campaigns?: TemplateCampaign[];
}
