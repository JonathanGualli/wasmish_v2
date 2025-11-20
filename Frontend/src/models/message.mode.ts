export type Sender = "me" | "them";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  conversationId: string;
  sender: Sender;
  text: string;
  timestamp: string; // ISO
  status: MessageStatus;
  deliveredAt?: string; // ISO
  readAt?: string; // ISO
  waMessageId?: string;
}
