export interface Conversation {
  id: string;
  title: string;
  phone: string;
  lastMessage: string;
  updatedAt: string; // ISO date
  unreadCount: number;
}
