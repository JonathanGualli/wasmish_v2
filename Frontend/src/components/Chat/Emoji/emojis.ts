/** Los de la barra de reacciones: los mismos que la de WhatsApp. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Sin el selector de variante (U+FE0F): «❤» y «❤️» son el mismo emoji para compararlos. */
export const sameEmoji = (a: string | null | undefined, b: string | null | undefined) =>
    Boolean(a && b) && a!.replace(/️/g, "") === b!.replace(/️/g, "");

/** Para buscar sin tildes ni mayúsculas: «corazon» encuentra «corazón». */
export const normalizeSearch = (text: string) =>
    text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export interface EmojiItem {
    emoji: string;
    /** Su nombre en español (emojibase). */
    label: string;
    /** El nombre y sus etiquetas, normalizados, para buscar. */
    search: string;
    group: number;
}

let loading: Promise<EmojiItem[]> | null = null;

/**
 * Todos los emojis con sus nombres en español, de `emojibase-data` (77 KB
 * comprimidos): se piden la primera vez que se abre el selector, en su propio
 * archivo, y no pesan al entrar en Wasmish. Sin los «componentes» (tonos de
 * piel sueltos) ni los tonos de cada emoji.
 */
export const loadEmojis = () => {
    loading ??= import("emojibase-data/es/compact.json").then(({ default: data }) =>
        data
            .filter(item => item.group !== undefined && item.group !== 2)
            .map(item => ({
                emoji: item.unicode,
                label: item.label,
                search: normalizeSearch([item.label, ...(item.tags ?? [])].join(" ")),
                group: item.group!,
            })))
        .catch(error => {
            loading = null;
            throw error;
        });
    return loading;
};

const RECENT_KEY = "wasmish.emojis.recent";
const RECENT_MAX = 24;
// Antes de usar ninguno: los de la barra y los que más se usan en un negocio.
const RECENT_DEFAULT = [...QUICK_REACTIONS, "😊", "👌", "🎉", "✅", "😀", "🤝", "👏", "🔥", "💯", "📦", "💵", "📅"];

/** Los últimos que eligió esta persona en este navegador (solo una comodidad: puede no haber). */
export const recentEmojis = (): string[] => {
    try {
        const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
        return Array.isArray(saved) && saved.length > 0 ? saved : RECENT_DEFAULT;
    } catch {
        return RECENT_DEFAULT;
    }
};

export const rememberEmoji = (emoji: string) => {
    try {
        const next = [emoji, ...recentEmojis().filter(item => !sameEmoji(item, emoji))].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* sin almacenamiento: no se recuerda */ }
};

/** Las pestañas del selector (el diseño): recientes y siete grupos, con los de emojibase juntados. */
export const EMOJI_TABS = [
    { key: "recent", icon: "🕘", label: "Usados a menudo", groups: [] as number[] },
    { key: "smileys", icon: "😀", label: "Caras y emociones", groups: [0] },
    { key: "people", icon: "👋", label: "Personas", groups: [1] },
    { key: "nature", icon: "🐶", label: "Animales y naturaleza", groups: [3] },
    { key: "food", icon: "🍔", label: "Comida y bebida", groups: [4] },
    { key: "activities", icon: "⚽", label: "Actividades y viajes", groups: [6, 5] },
    { key: "objects", icon: "💡", label: "Objetos", groups: [7] },
    { key: "symbols", icon: "🔣", label: "Símbolos y banderas", groups: [8, 9] },
];
