// De dónde salió un mensaje saliente y quién lo envió (Fase 3 de multi-línea):
// con varias personas en la cuenta, el chat lo dice.

/**
 * `{ kind: 'chat' | 'api' }`, `{ kind: 'campaign', campaignName }` o null (un
 * entrante, o un saliente anterior al campo). Un mensaje anterior con
 * `campaignId` sigue siendo de su campaña. `campaignNames`: id → nombre.
 */
export const messageOrigin = (msg, campaignNames = new Map()) => {
    const kind = msg.origin ?? (msg.campaignId ? 'campaign' : null);
    if (!kind) return null;
    if (kind !== 'campaign') return { kind };
    return { kind, campaignName: campaignNames.get(String(msg.campaignId)) ?? null };
};

/** `{ id, name }` de quien lo envió desde el chat, o null. El nombre es el de ese momento. */
export const messageSender = (msg) => (msg.sentBy ? { id: String(msg.sentBy), name: msg.sentByName ?? null } : null);
