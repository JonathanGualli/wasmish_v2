import { useState } from "react";
import { ChevronDown, ChevronUp, List, Reply } from "lucide-react";
import type { BotOption } from "../../../models/message.mode";

/**
 * Las opciones que mandó el bot con un mensaje (bot con menús, diseño
 * «Respuestas automáticas v4», c1), como las vio el contacto: botones debajo
 * de la burbuja o el botón «Ver opciones» de la lista. **No se tocan**: son del
 * contacto. Las filas de la lista se despliegan para el equipo, cerradas al
 * abrir el chat.
 */
export const BotOptions = ({ options, format }: { options: BotOption[]; format: 'buttons' | 'list' }) => {
    const [open, setOpen] = useState(false);

    if (format === 'buttons') {
        return (
            // En fila, como en el diseño, si caben enteros; si no, el que no cabe
            // baja. En el teléfono, uno debajo de otro, como en WhatsApp.
            <div title="Solo el contacto puede tocarlas" className="flex flex-wrap max-md:flex-col gap-1.5">
                {options.map(option => (
                    <span key={option.id}
                        className="flex-[1_0_auto] max-w-full h-9 min-w-0 px-3 rounded-[9px] border border-brand-border-strong bg-brand-surface flex items-center
                            justify-center gap-1.5 text-[13px] font-semibold text-brand-accent-strong cursor-default">
                        <Reply size={12} strokeWidth={2.2} className="flex-none" />
                        <span className="truncate whitespace-nowrap">{option.title}</span>
                    </span>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-1.5">
            <span title="Solo el contacto puede tocarlo"
                className="h-9 rounded-[9px] border border-brand-border-strong bg-brand-surface flex items-center justify-center gap-1.5
                    text-[13px] font-semibold text-brand-accent-strong cursor-default">
                <List size={13} strokeWidth={2.2} />Ver opciones
            </span>
            {open && (
                <div className="bg-brand-surface border border-brand-border rounded-[9px] overflow-hidden">
                    {options.map((option, i) => (
                        <div key={option.id}
                            className={`flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-brand-strong ${i ? 'border-t border-brand-bg' : ''}`}>
                            <span className="flex-1 min-w-0">{option.title}</span>
                            <span aria-hidden className="flex-none w-3.5 h-3.5 rounded-full border-[1.5px] border-brand-border-strong" />
                        </div>
                    ))}
                </div>
            )}
            <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
                className="justify-self-end inline-flex items-center gap-[5px] text-xs font-semibold text-brand-gray-600
                    hover:text-brand-text transition-colors cursor-pointer">
                {open ? 'Ocultar las opciones' : `Ver las ${options.length} opciones`}
                {open ? <ChevronUp size={12} strokeWidth={2.2} /> : <ChevronDown size={12} strokeWidth={2.2} />}
            </button>
        </div>
    );
};
