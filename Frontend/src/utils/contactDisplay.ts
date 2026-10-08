import type { Contact, ContactSource } from "../models/contact.model";
import type { PillTone } from "../components/Pill/Pill";
import { formatChatTime } from "./formatChatTime";

/** Mismo formato que valida el backend: solo dígitos, con código de país. */
export const PHONE_RE = /^\d{8,15}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Los topes del backend (`createContactSchema`): nombre y empresa, y notas. */
export const CONTACT_NAME_MAX = 80;
export const CONTACT_NOTES_MAX = 1000;

export const SOURCE_LABEL: Record<NonNullable<ContactSource> | 'legacy', string> = {
    inbound: 'Te escribió primero',
    manual: 'Creado a mano',
    api: 'Por la API',
    ad: 'Desde un anuncio',
    import: 'Importado',
    legacy: 'Anterior',
};

export const sourceLabel = (source: ContactSource) => SOURCE_LABEL[source ?? 'legacy'];

export const referralTypeLabel = (sourceType: string | null) =>
    sourceType === 'post' ? 'Publicación' : 'Anuncio';

export const formatPhone = (phone: string) => `+${phone}`;

/** Teléfono o, si WhatsApp no lo compartió, el usuario. */
export const contactIdentity = (c: Pick<Contact, 'phone' | 'username'>) =>
    c.phone ? formatPhone(c.phone) : c.username ? `@${c.username}` : '';

/** Texto para las iniciales del avatar: solo nombres; un teléfono no tiene iniciales. */
export const avatarName = (c: Pick<Contact, 'name' | 'profileName' | 'username'>) =>
    c.name || c.profileName || c.username || '';

/** El estado que resume la fila: lo que más importa a la hora de escribirle. */
export const contactStatus = (c: Contact): { label: string; tone: PillTone } => {
    if (c.marketingOptOut) return { label: 'Baja publicidad', tone: 'warning' };
    if (!c.conversationId) return { label: 'Sin conversación', tone: 'neutral' };
    if (c.windowExpiresAt && new Date(c.windowExpiresAt).getTime() > Date.now()) {
        return { label: 'Ventana abierta', tone: 'positive' };
    }
    return { label: 'Ventana cerrada', tone: 'outline' };
};

/** Sin nombre ni usuario, lo único que lo identifica es el teléfono. */
const onlyPhone = (c: Contact) => !c.name && !c.profileName && !c.username && Boolean(c.phone);

/** El título del contacto. Si es su teléfono, con el formato de teléfono. */
export const contactTitle = (c: Contact) => (onlyPhone(c) ? formatPhone(c.phone!) : c.displayName);

/**
 * La segunda línea, bajo el título: el teléfono o, si WhatsApp no lo compartió,
 * el usuario. Nunca repite el título.
 */
export const contactSubtitle = (c: Contact) => {
    if (onlyPhone(c)) return 'Sin nombre';
    if (c.phone) return formatPhone(c.phone);
    return c.displayName.startsWith('@') || !c.username ? 'Sin número' : `@${c.username}`;
};

/** La columna «Última», con el formato de la bandeja. */
export const lastInteractionLabel = (c: Contact) => (c.lastInteractionAt ? formatChatTime(c.lastInteractionAt) : '—');
