import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, Check, RefreshCw, X } from "lucide-react";
import { useNotice } from "./context/useNotice";
import type { NoticeKind } from "./context/NoticeContext";

// Se va solo a los 5 s; con el puntero encima, no (diseño, 7a).
const VISIBLE_MS = 5000;

interface KindLook {
    box: string;
    iconBox: string;
    close: string;
    action: string;
    icon: ReactNode;
}

// El color según el tipo (diseño «Avisos de la asignación», 7a). `success` va
// con los colores de `info` y un ✓ (decisión del 2026-10-28).
const deep = {
    box: "bg-brand-deep border-brand-deep text-white",
    iconBox: "bg-brand-deep-active text-brand-accent",
    close: "text-brand-notice-info-x hover:text-white",
    action: "text-brand-accent",
};
const LOOKS: Record<NoticeKind, KindLook> = {
    error: {
        box: "bg-brand-notice-error border-brand-notice-error text-white",
        iconBox: "bg-brand-notice-error-icon text-white",
        close: "text-brand-notice-error-x hover:text-white",
        action: "text-white",
        icon: <AlertTriangle size={15} strokeWidth={2.4} />,
    },
    info: { ...deep, icon: <RefreshCw size={15} strokeWidth={2.4} /> },
    success: { ...deep, icon: <Check size={15} strokeWidth={2.6} /> },
    new: {
        box: "bg-brand-accent border-brand-accent text-brand-ink",
        iconBox: "bg-brand-deep text-brand-accent",
        close: "text-brand-accent-strong hover:text-brand-ink",
        action: "text-brand-ink",
        icon: <Bell size={15} strokeWidth={2.4} />,
    },
};

export const Notice = () => {
    const { notice, close } = useNotice();
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const stopTimer = useCallback(() => clearTimeout(timer.current), []);
    const startTimer = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(close, VISIBLE_MS);
    }, [close]);

    // Cada aviso nuevo empieza su cuenta, aunque reemplace a otro.
    const noticeId = notice?.id;
    useEffect(() => {
        if (noticeId === undefined) return;
        startTimer();
        return stopTimer;
    }, [noticeId, startTimer, stopTimer]);

    useEffect(() => {
        if (noticeId === undefined) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [noticeId, close]);

    const root = document.getElementById("notice");
    if (!notice || !root) return null;

    const look = LOOKS[notice.kind];
    return createPortal(
        <div
            key={notice.id}
            role={notice.kind === "error" ? "alert" : "status"}
            // Un clic aquí no es un «clic fuera» de un diálogo abierto.
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={stopTimer}
            onMouseLeave={startTimer}
            className={`fixed z-[1000] top-[calc(16px+var(--safe-top,0px))] left-4 right-4 md:left-auto md:w-[380px]
                flex items-start gap-3 py-3 pr-3 pl-3.5 rounded-xl border shadow-[0_16px_40px_rgba(14,17,22,0.16)]
                ${notice.exiting ? "animate-notice-out" : "animate-notice-in"} ${look.box}`}
        >
            <span className={`flex-none w-7 h-7 rounded-[7px] flex items-center justify-center ${look.iconBox}`}>
                {look.icon}
            </span>
            <span className="flex-1 min-w-0 pt-[5px] text-[13.5px] leading-[1.45]">{notice.text}</span>
            {notice.action && (
                <button
                    type="button"
                    onClick={() => { notice.action?.onClick(); close(); }}
                    className={`flex-none pt-[5px] px-1 text-[13.5px] font-semibold leading-[1.45] hover:underline cursor-pointer ${look.action}`}
                >
                    {notice.action.label}
                </button>
            )}
            <button
                type="button"
                onClick={close}
                aria-label="Cerrar aviso"
                className={`flex-none w-7 h-7 flex items-center justify-center rounded-[7px] transition-colors cursor-pointer ${look.close}`}
            >
                <X size={14} strokeWidth={2.2} />
            </button>
        </div>,
        root,
    );
};
