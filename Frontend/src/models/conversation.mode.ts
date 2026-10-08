/**
 * Lo que otra página pide abrir al navegar a Chats (va en el estado del router,
 * no en la URL). Lo usa la ficha de un contacto.
 */
export interface ChatsNavigationState {
  /** Abrir esta conversación. */
  conversationId?: string;
  /** Empezar una conversación nueva con estos datos; reemplaza el borrador que hubiera. */
  draft?: { phone: string; name: string };
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
  lastMessage: string;
  updatedAt: string; // ISO date
  unreadCount: number;
  /** ISO de cuándo cierra la ventana de 24 h. `null` = el contacto nunca escribió. */
  windowExpiresAt?: string | null;
}
