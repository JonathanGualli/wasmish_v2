import type { Message } from "../models/message.mode";

/** La nuestra puesta (no la que falló): va marcada en la barra y en el selector, y tocarla la quita. */
export const currentOwnEmoji = (msg: Message) => {
    const me = msg.reactions?.me;
    return me && me.status !== "failed" ? me.emoji : null;
};
