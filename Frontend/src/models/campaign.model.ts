import type { ContactFilter } from "./contact.model";

/** queued → sending → completed, más paused / cancelled. */
export type CampaignStatus = 'queued' | 'sending' | 'paused' | 'completed' | 'cancelled';

/** De dónde sale el valor de una variable o de un botón. */
export type VariableSource = 'fixed' | 'name' | 'firstName' | 'company' | 'phone' | 'email';

export interface CampaignFill {
    source: VariableSource;
    /** Solo con `fixed`: el texto para todos. */
    value?: string | null;
    /** Con un campo del contacto: lo que se pone si el contacto no lo tiene. Obligatorio. */
    fallback?: string | null;
}

/** `key` es '1' en una plantilla posicional, 'nombre' en una con nombres. */
export interface CampaignVariable extends CampaignFill { key: string }
export interface CampaignButton extends CampaignFill { index: number }

/**
 * A quién: los marcados uno a uno, o «todos los que coinciden» con una
 * búsqueda y un filtro de Contactos, menos los desmarcados.
 */
export type CampaignRecipientsInput =
    | { mode: 'ids'; contactIds: string[] }
    | { mode: 'query'; search?: string; filter?: ContactFilter; excludeIds?: string[] };

/** Lo que pide la vista previa. Sin `templateId` solo cuenta destinatarios. */
export interface CampaignDraftInput {
    templateId?: string | null;
    variables: CampaignVariable[];
    buttons: CampaignButton[];
    excludeOptedOut: boolean;
    recipients: CampaignRecipientsInput;
}

export interface CreateCampaignInput extends CampaignDraftInput {
    templateId: string;
    name: string;
}

export interface CampaignStats {
    total: number;
    /** En cola o enviándose. */
    pending: number;
    /** Aceptados por Meta (incluye entregados y leídos). */
    sent: number;
    /** Entregados (incluye leídos). */
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
    cancelled: number;
    interrupted: number;
}

export interface Campaign {
    id: string;
    name: string;
    status: CampaignStatus;
    /** Por qué se pausó sola. `null` si la pausó el usuario o no está pausada. */
    pauseReason: { code: string | null; message: string } | null;
    template: {
        templateId: string | null;
        name: string | null;
        language: string | null;
        category: string | null;
        bodyText: string;
    };
    variables: CampaignVariable[];
    buttons: CampaignButton[];
    excludeOptedOut: boolean;
    totalRecipients: number;
    stats: CampaignStats;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
}

export interface CampaignsPage {
    campaigns: Campaign[];
    totalCount: number;
    page: number;
    limit: number;
}

export interface CampaignFieldError { field: string; message: string }

export interface CampaignPreview {
    template: {
        templateId: string;
        name: string;
        language: string;
        category: string;
        bodyText: string;
        /** Las variables del cuerpo, en orden. */
        variables: string[];
        buttonsNeedingValue: { index: number; type: string; text: string | null }[];
    } | null;
    recipients: {
        selected: number;
        /** Los que recibirán el mensaje (sin omitidos). */
        toSend: number;
        optedOut: number;
        excludedOptedOut: number;
        withoutPhone: number;
        duplicates: number;
        notFound: number;
    };
    /** Cuántos usarán la reserva, por clave: '1', 'nombre', 'button.0'. */
    fallbacks: Record<string, number>;
    /** El mensaje ya relleno para los primeros contactos. */
    samples: { contactId: string; displayName: string; text: string; fallbacks: string[] }[];
    errors: CampaignFieldError[];
}

/** Estado de un destinatario tal como lo ve el usuario. */
export type RecipientState = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped' | 'cancelled' | 'interrupted';

export interface CampaignRecipient {
    id: string;
    contactId: string;
    displayName: string;
    phone: string | null;
    username: string | null;
    state: RecipientState;
    /** Solo en omitidos: 'opted_out' | 'contact_deleted' | 'no_identity'. */
    skipReason: string | null;
    errorCode: string | null;
    errorDetail: string | null;
    conversationId: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    readAt: string | null;
    failedAt: string | null;
    processedAt: string | null;
}

export interface CampaignRecipientsPage {
    recipients: CampaignRecipient[];
    totalCount: number;
    page: number;
    limit: number;
}
