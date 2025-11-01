import type { Conversation } from "../models/conversation.mode";
import type { Message } from "../models/message.mode";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const conversations: Conversation[] = [
  {
    id: "1",
    title: "Juan Pérez",
    phone: "+593987654321",
    lastMessage: "Perfecto, gracias!",
    updatedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    unreadCount: 0,
  },
  {
    id: "2",
    title: "María Gómez",
    phone: "+593912345678",
    lastMessage: "Envíame la cotización, por favor",
    updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    unreadCount: 2,
  },
];

const messagesByConversation: Record<string, Message[]> = {
  "1": [
    { id: "m1", conversationId: "1", sender: "them", text: "Hola!", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
    { id: "m2", conversationId: "1", sender: "me", text: "Hola Juan, ¿en qué puedo ayudarte?", timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString() },
    { id: "m3", conversationId: "1", sender: "them", text: "Quiero información del plan", timestamp: new Date(Date.now() - 1000 * 60 * 50).toISOString() },
    { id: "m4", conversationId: "1", sender: "me", text: "Te envío ahora los detalles", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    { id: "m5", conversationId: "1", sender: "them", text: "Perfecto, gracias!", timestamp: new Date(Date.now() - 1000 * 60 * 40).toISOString() },
  ],
  "2": [
    { id: "m6", conversationId: "2", sender: "them", text: "Buenos días", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
    { id: "m7", conversationId: "2", sender: "me", text: "Hola María", timestamp: new Date(Date.now() - 1000 * 60 * 115).toISOString() },
    { id: "m8", conversationId: "2", sender: "them", text: "Envíame la cotización, por favor", timestamp: new Date(Date.now() - 1000 * 60 * 110).toISOString() },
  ],
};

export const getConversations = async (): Promise<Conversation[]> => {
  await delay(300);
  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const getMessages = async (conversationId: string): Promise<Message[]> => {
  await delay(300);
  return messagesByConversation[conversationId] ?? [];
};

export const sendMessage = async (conversationId: string, text: string): Promise<Message> => {
  await delay(200);
  const msg: Message = {
    id: Math.random().toString(36).slice(2),
    conversationId,
    sender: "me",
    text,
    timestamp: new Date().toISOString(),
  };
  if (!messagesByConversation[conversationId]) messagesByConversation[conversationId] = [];
  messagesByConversation[conversationId].push(msg);

  // update conversation metadata
  const c = conversations.find((c) => c.id === conversationId);
  if (c) {
    c.lastMessage = text;
    c.updatedAt = msg.timestamp;
    c.unreadCount = 0;
  }

  return msg;
};
