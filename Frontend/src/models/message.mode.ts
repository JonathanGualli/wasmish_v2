export type Sender = "me" | "them";

export interface Message {
  id: string;
  conversationId: string;
  sender: Sender;
  text: string;
  timestamp: string; // ISO
}
