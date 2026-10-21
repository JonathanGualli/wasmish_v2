export type Sender = "me" | "them";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";

/**
 * Tipo tal como lo llama Meta. No es un enum cerrado a propósito: Meta añade
 * tipos nuevos sin avisar y el backend los guarda igual, así que la UI tiene
 * que saber pintar uno que no conoce.
 */
export type MessageType =
  | "text" | "image" | "video" | "audio" | "document" | "sticker"
  | "location" | "contacts" | "reaction" | "button" | "interactive" | "order"
  | (string & {});

/**
 * Solo en el navegador: el archivo de un mensaje que se está enviando (UI
 * optimista). Se ve desde `localUrl` hasta que el mensaje vuelve del servidor.
 */
export interface PendingUpload {
  localUrl: string;
  loadedBytes: number;
  totalBytes: number;
  /** No llegó al servidor (se cortó la conexión): el archivo sigue aquí y se puede reintentar. */
  retryable?: boolean;
}

/** Lo que decía un mensaje antes de una edición, y desde cuándo (ISO). */
export interface MessageVersion {
  text: string;
  caption: string | null;
  editedAt: string;
}

/**
 * El mensaje que cita otro (responder citando), leído al servir: una edición o
 * un borrado posterior del original se ve. `{ id: null }` si Wasmish no lo tiene
 * (es de antes de conectar el número): «Mensaje no disponible».
 */
export interface QuotedMessage {
  id: string;
  sender: Sender;
  type: MessageType;
  /** Recortado a 200 caracteres. */
  text: string;
  hasMedia: boolean;
  deleted: boolean;
  /** De un saliente: quién lo envió desde el chat y de dónde salió, para nombrar al autor. */
  sentBy: { id: string; name: string | null } | null;
  origin: 'chat' | 'api' | 'bot' | 'businessApp' | 'campaign' | null;
}
export type MessageQuote = QuotedMessage | { id: null };

/** La reacción del contacto. */
export interface ContactReaction {
  emoji: string;
  at: string;
}

/** La nuestra (una por mensaje: para el contacto, el negocio es uno solo). */
export interface OwnReaction {
  /** `null` solo si falló al quitarla: el contacto sigue viendo `previousEmoji`. */
  emoji: string | null;
  previousEmoji: string | null;
  at: string;
  /** Meta avisa del fallo por el webhook, un rato después. */
  status: 'sent' | 'failed';
  errorCode: string | null;
  errorDetail: string | null;
  sentBy: { id: string; name: string | null } | null;
  origin: 'chat' | 'businessApp' | null;
  /** Solo en el navegador: enviándose (UI optimista). */
  pending?: boolean;
}

export interface MessageReactions {
  them: ContactReaction | null;
  me: OwnReaction | null;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: Sender;
  /** Ausente en los mensajes anteriores al campo: tratar como "text". */
  type?: MessageType;
  text: string;
  /** Hay archivo descargado y se puede pedir en `/api/media/<id>`. */
  hasMedia?: boolean;
  /** Lo que escribió el contacto junto al adjunto. `null` si no escribió nada. */
  caption?: string | null;
  /** Nombre original, solo en documentos. */
  mediaFilename?: string | null;
  mediaSize?: number | null;
  timestamp: string; // ISO
  status: MessageStatus;
  deliveredAt?: string; // ISO
  readAt?: string; // ISO
  failedAt?: string; // ISO
  waMessageId?: string;
  errorCode?: string;
  errorDetail?: string;
  temporalId?: string; // en caso de mensajes optimistas
  /** Solo en los enviados como plantilla: con él se pintan su nombre y sus botones. */
  templateName?: string | null;
  /** Un archivo que se está enviando desde este navegador. */
  pending?: PendingUpload;
  /** Quién lo envió desde el chat (Fase 3); el nombre es el de ese momento. */
  sentBy?: { id: string; name: string | null } | null;
  /**
   * De dónde salió un saliente: el chat, una campaña, la API, el bot o la app de
   * WhatsApp Business (`businessApp`, coexistencia). `null` en los antiguos.
   */
  origin?: { kind: 'chat' | 'api' | 'bot' | 'businessApp' } | { kind: 'campaign'; campaignName: string | null } | null;
  /** Borrado por el contacto o por el negocio desde la app (coexistencia): se conserva lo que decía. */
  deletedAt?: string | null;
  /** La hora de la última edición; `text` y `caption` ya son lo nuevo. */
  editedAt?: string | null;
  /** Lo que decía antes de cada edición, en orden de llegada. */
  previousVersions?: MessageVersion[];
  /** Sube con cada borrado, edición o reacción: un `message_updated` que no lo supere es viejo. */
  changeVersion?: number;
  /** A qué mensaje responde (la cita de WhatsApp). */
  replyTo?: MessageQuote | null;
  /** Un reenvío; `many`, una cadena. */
  forwarded?: 'once' | 'many' | null;
  reactions?: MessageReactions;
  /** Qué acciones enseña la UI: lo decide el backend, con las mismas reglas que al enviar. */
  canReact?: boolean;
  canReply?: boolean;
}
