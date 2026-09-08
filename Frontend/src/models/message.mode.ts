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
}
