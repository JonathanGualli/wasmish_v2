import { z } from "zod";

export const sendMessageSchema = z.object({
    contactName: z.string().min(1).optional(),
    destinationNumber: z.string().min(8).optional(),
    text: z.string().min(1),
    temporalId: z.string().optional(),
});

export const sendNewMessageSchema = z.object({
    destinationNumber: z.string().min(9),
    text: z.string().min(1),
    temporalId: z.string().optional(),
});