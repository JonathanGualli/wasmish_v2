import type { AccountRole } from "./user.mode";

/**
 * Lo que otra página pide abrir al navegar a Chats (va en el estado del router,
 * no en la URL). Lo usa la ficha de un contacto.
 */
export interface ChatsNavigationState {
  /** Abrir esta conversación. */
  conversationId?: string;
  /** Empezar una conversación nueva con estos datos; reemplaza el borrador que hubiera. */
  draft?: NewConversationRequest;
}

/** Lo que llega ya puesto a una conversación nueva. */
export interface NewConversationRequest {
  phone: string;
  name: string;
}

/** Una persona de la cuenta, como la nombra la asignación. */
export interface ConversationPerson {
  id: string;
  name: string | null;
}

/** La solicitud pendiente de que le pasen la conversación a alguien (Fase 4). */
export interface TransferRequest {
  /** Nuevo en cada solicitud: aceptar o rechazar manda el que se tiene a la vista. */
  id: string;
  requestedBy: ConversationPerson;
  requestedAt: string;
}

/** Quien puede atender una conversación (`GET /chats/:id/assignees`). */
export interface Assignee {
  id: string;
  name: string | null;
  role: AccountRole;
}

export interface Conversation {
  id: string;
  /** Su contacto. `null` en una conversación anterior a los contactos que aún no se enlazó. */
  contactId: string | null;
  title: string;
  /** `null` si la persona escribió con su nombre de usuario y WhatsApp no compartió su número. */
  phone: string | null;
  /** Nombre de usuario de WhatsApp, sin la @. */
  username?: string | null;
  /** Su línea de WhatsApp. `null` solo en una conversación anterior a las líneas que aún no se enlazó. */
  lineId: string | null;
  lastMessage: string;
  updatedAt: string; // ISO date
  unreadCount: number;
  /** ISO de cuándo cierra la ventana de 24 h. `null` = el contacto nunca escribió. */
  windowExpiresAt?: string | null;
  /** Quién la atiende (Fase 4). `null` = sin asignar. */
  assignedTo?: ConversationPerson | null;
  /** Quién se la asignó la última vez. */
  assignedBy?: ConversationPerson | null;
  transferRequest?: TransferRequest | null;
}
