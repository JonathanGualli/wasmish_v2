export interface Conversation {
  id: string;
  title: string;
  phone: string;
  lastMessage: string;
  updatedAt: string; // ISO date
  unreadCount: number;
  /** ISO de cuándo cierra la ventana de 24 h. `null` = el contacto nunca escribió. */
  windowExpiresAt?: string | null;
}
