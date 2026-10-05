/** Cómo llegó el contacto. `null` = anterior a que existieran los contactos. */
export type ContactSource = 'inbound' | 'manual' | 'api' | 'ad' | null;

export type ContactFilter = 'all' | 'with_conversation' | 'without_conversation' | 'opted_out';

/** El anuncio de Facebook/Instagram («Click to WhatsApp») que trajo al contacto. */
export interface ContactReferral {
    sourceType: string | null;   // 'ad' | 'post'
    sourceId: string | null;
    sourceUrl: string | null;
    headline: string | null;
    body: string | null;
    mediaType: string | null;
    ctwaClid: string | null;
}

export interface Contact {
    id: string;
    /** El que se enseña: nombre → nombre de WhatsApp → @usuario → teléfono. */
    displayName: string;
    /** El que pone quien usa Wasmish. */
    name: string | null;
    /** El que la persona tiene en su WhatsApp. No se edita. */
    profileName: string | null;
    /** `null` si escribió con su nombre de usuario y WhatsApp no compartió su número. */
    phone: string | null;
    username: string | null;
    email: string | null;
    company: string | null;
    notes: string | null;
    source: ContactSource;
    referral: ContactReferral | null;
    marketingOptOut: boolean;
    marketingOptOutAt: string | null;
    /** `null` = nunca hubo conversación: se puede borrar y cambiar el teléfono. */
    conversationId: string | null;
    lastInteractionAt: string | null;
    /** ISO de cuándo cierra la ventana de 24 h. `null` = cerrada o nunca escribió. */
    windowExpiresAt: string | null;
    createdAt: string;
}

export interface ContactActivity {
    firstMessageAt: string | null;
    sent: number;
    received: number;
    failed: number;
}

export interface ContactDetail extends Contact {
    activity: ContactActivity;
}

export interface ContactsPage {
    contacts: Contact[];
    totalCount: number;
    page: number;
    limit: number;
}

/** Lo que se edita a mano. El texto vacío borra el campo. */
export interface ContactInput {
    phone?: string;
    name?: string;
    email?: string;
    company?: string;
    notes?: string;
}

/**
 * Lo que pide Envíos al abrir Contactos (va en el estado del router): elegir
 * a quién mandar un envío nuevo (`new`) o cambiar los de un borrador (`edit`).
 */
export interface ContactsNavigationState {
    campaignPick?: 'new' | 'edit';
}
