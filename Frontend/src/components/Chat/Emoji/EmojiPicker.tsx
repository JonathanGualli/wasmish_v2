import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { EMOJI_TABS, loadEmojis, normalizeSearch, recentEmojis, rememberEmoji, sameEmoji, type EmojiItem } from "./emojis";

interface Props {
    /** El texto del mensaje al que se reacciona: el selector se abre lejos de él (diseño, 1d). */
    target: string;
    /** La nuestra, si la hay: va marcada y tocarla la quita. */
    current: string | null;
    onPick: (emoji: string) => void;
    onClose: () => void;
    /** En el celular es una hoja que sube desde abajo, con celdas más grandes. */
    mobile: boolean;
}

/**
 * El selector completo de emojis (diseño, 1d, 1e y m4): a qué mensaje se
 * reacciona, buscador en español, pestañas y la cuadrícula de 8. La primera vez
 * carga los nombres (un instante, con su esqueleto). Se importa con `lazy`: ni
 * él ni sus datos pesan al entrar en Wasmish.
 */
const EmojiPicker = ({ target, current, onPick, onClose, mobile }: Props) => {
    const [emojis, setEmojis] = useState<EmojiItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState(EMOJI_TABS[0].key);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let alive = true;
        loadEmojis().then(items => alive && setEmojis(items)).catch(() => alive && setFailed(true));
        // En el celular no se abre el teclado sin pedirlo: taparía media hoja.
        if (!mobile) searchRef.current?.focus();
        return () => { alive = false; };
    }, [mobile]);

    const search = normalizeSearch(query);
    const activeTab = EMOJI_TABS.find(item => item.key === tab) ?? EMOJI_TABS[0];
    const shown = useMemo(() => {
        if (!emojis) return [];
        if (search) return emojis.filter(item => item.search.includes(search)).map(item => item.emoji);
        if (activeTab.key === "recent") return recentEmojis();
        return emojis.filter(item => activeTab.groups.includes(item.group)).map(item => item.emoji);
    }, [emojis, search, activeTab]);

    const pick = (emoji: string) => {
        rememberEmoji(emoji);
        onPick(emoji);
    };

    const cell = mobile ? "h-[42px] text-[26px]" : "h-9 text-[22px]";
    const label = !emojis ? "Cargando emojis…" : search ? "Resultados" : activeTab.label;

    return (
        <div role="dialog" aria-label="Elegir un emoji"
            className={`flex flex-col overflow-hidden bg-brand-surface border border-brand-border shadow-[0_16px_40px_rgba(14,17,22,0.2)]
                ${mobile ? "h-[470px] max-h-[75dvh] rounded-t-[18px]" : "w-[348px] h-[392px] rounded-[14px]"}`}>
            {mobile && <div className="flex-none self-center mt-2 w-9 h-1 rounded-sm bg-brand-border-strong" />}
            <div className="flex-none flex items-center gap-2 pt-2.5 pr-2.5 pl-3.5">
                <p className="flex-1 min-w-0 truncate text-[13px] text-brand-gray-600">
                    Reaccionar a <span className="font-semibold text-brand-text">«{target}»</span>
                </p>
                <button type="button" onClick={onClose} title="Cerrar"
                    className="flex-none w-8 h-8 rounded-lg flex items-center justify-center text-brand-gray-600 hover:bg-brand-bg cursor-pointer">
                    <X size={16} strokeWidth={2.2} />
                </button>
            </div>
            <div className="flex-none px-3 pt-2">
                <label className="flex items-center gap-2 h-[38px] px-2.5 rounded-[9px] bg-brand-bg border border-brand-border
                    text-brand-subtle focus-within:border-brand-success focus-within:bg-brand-surface">
                    <Search size={15} className="flex-none" />
                    <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)}
                        placeholder="Buscar emoji" aria-label="Buscar emoji"
                        className="flex-1 min-w-0 bg-transparent outline-none text-base md:text-sm text-brand-text placeholder:text-brand-subtle" />
                </label>
            </div>
            <div className="flex-none flex gap-0.5 px-2.5 pt-2 pb-1 border-b border-brand-raised">
                {EMOJI_TABS.map(item => (
                    <button key={item.key} type="button" onClick={() => { setTab(item.key); setQuery(""); }}
                        title={item.label} disabled={!emojis}
                        className={`flex-1 h-[30px] rounded-[7px] flex items-center justify-center text-base cursor-pointer disabled:opacity-35
                            ${item.key === activeTab.key && !search ? "bg-brand-raised" : "hover:bg-brand-bg"}`}>
                        {item.icon}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] px-3 pt-2 pb-3">
                <p className="px-0.5 pt-0.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">{label}</p>
                {failed ? (
                    <p className="px-1 py-6 text-[13.5px] text-brand-muted">No se pudieron cargar los emojis. Cierra y vuelve a abrir el selector.</p>
                ) : !emojis ? (
                    <div className="grid grid-cols-8 gap-1">
                        {Array.from({ length: 32 }, (_, i) => (
                            <span key={i} className={`${cell} rounded-lg bg-brand-raised motion-safe:animate-skeleton-pulse`} />
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <p className="px-1 py-6 text-[13.5px] text-brand-muted">Ningún emoji con «{query.trim()}».</p>
                ) : (
                    <div className="grid grid-cols-8 gap-1">
                        {shown.map(emoji => (
                            <button key={emoji} type="button" onClick={() => pick(emoji)}
                                className={`${cell} min-w-0 rounded-lg flex items-center justify-center leading-none cursor-pointer
                                    ${sameEmoji(emoji, current) ? "bg-brand-accent-soft" : "hover:bg-brand-raised"}`}>
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmojiPicker;
