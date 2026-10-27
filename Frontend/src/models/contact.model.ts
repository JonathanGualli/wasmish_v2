import type { ConversationPerson } from "./conversation.mode";
/** Cómo llegó el contacto. `null` = anterior a que existieran los contactos. */
export type ContactSource = 'inbound' | 'manual' | 'api' | 'ad' | 'import' | 'businessApp' | null;

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
    /** El que se enseña: nombre → nombre de la agenda → nombre de WhatsApp → @usuario → teléfono. */
    displayName: string;
    /** El que pone quien usa Wasmish. */
    name: string | null;
    /** El que el negocio le puso en la agenda de su celular (app de WhatsApp Business). No se edita. */
    agendaName: string | null;
    /** El que la persona tiene en su WhatsApp. No se edita. */
    profileName: string | null;
    /** `null` si escribió con su nombre de usuario y WhatsApp no compartió su número. */
    phone: string | null;
    username: string | null;
    email: string | null;
    company: string | null;
    source: ContactSource;
    referral: ContactReferral | null;
    marketingOptOut: boolean;
    marketingOptOutAt: string | null;
    /**
     * `null` = nunca hubo conversación: se puede borrar y cambiar el teléfono.
     * Con varias líneas, la más reciente (como `lastInteractionAt` y `windowExpiresAt`).
     */
    conversationId: string | null;
    lastInteractionAt: string | null;
    /** ISO de cuándo cierra (o cerró) la ventana de 24 h. `null` = nunca escribió. */
    windowExpiresAt: string | null;
    /** Una por línea, la más reciente primero. La UI las usa desde la Fase 2c. */
    conversations: ContactConversation[];
    /** Sus etiquetas; los nombres salen de `GET /tags`. */
    tagIds: string[];
    createdAt: string;
}

export interface ContactConversation {
    conversationId: string;
    lineId: string | null;
    lastInteractionAt: string | null;
    /** La ventana de esta conversación: es de su línea, no del contacto. */
    windowExpiresAt: string | null;
    /** Quién la atiende (Fase 4). */
    assignedTo?: ConversationPerson | null;
    /** La atiende un compañero de quien mira (agente): se sabe que existe y quién la atiende, nada más. */
    restricted?: boolean;
}

export interface ContactActivity {
    firstMessageAt: string | null;
    sent: number;
    received: number;
    failed: number;
}

/** De dónde salió una nota: escrita en Wasmish, de un archivo importado o la de antes (sin autor). */
export type ContactNoteSource = 'manual' | 'import' | 'legacy';

/** Una nota del contacto, con quién la escribió y cuándo (`GET /contacts/:id` → `noteList`). */
export interface ContactNote {
    /** `legacy` en la nota de antes leída al vuelo, mientras no se migra. */
    id: string;
    text: string;
    /** `null` en la nota de antes. `active: false`: ya no está en la cuenta. */
    author: { id: string; name: string; active: boolean } | null;
    source: ContactNoteSource;
    createdAt: string;
    editedAt: string | null;
    /** Quién la cambió por última vez (owner y admin editan las de otros). */
    editedBy: { id: string; name: string } | null;
    /** Lo decide el backend: la suya, o cualquiera si es owner o admin. */
    canEdit: boolean;
}

export interface ContactDetail extends Contact {
    activity: ContactActivity;
    /** De la más nueva a la más vieja. */
    noteList: ContactNote[];
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
    /** Solo al crear: la primera nota, a nombre de quien lo crea. */
    notes?: string;
    tagIds?: string[];
}

/**
 * Lo que se pide al abrir Contactos (va en el estado del router). Campañas:
 * elegir a quién mandar una campaña nueva (`new`) o cambiar los de un
 * borrador (`edit`). Importar: ver los importados, filtrados por las
 * etiquetas que se les pusieron (`tagIds`). Chats: abrir la ficha de un
 * contacto (`contactId`).
 */
export interface ContactsNavigationState {
    campaignPick?: 'new' | 'edit';
    tagIds?: string[];
    contactId?: string;
}
