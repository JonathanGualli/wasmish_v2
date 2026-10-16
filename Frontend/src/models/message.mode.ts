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
}
