import { useState } from "react";
import { CustomButton } from "../../../../components/Button/Button";
import { LINE_NAME_MAX } from "../../../../utils/lineDisplay";

/**
 * El nombre interno de una línea, editado en el sitio. Enter guarda y Escape
 * cancela; vacío = sin nombre. Si guardar falla, lo escrito se queda (el error
 * lo enseña la fila).
 */
export const LineNameEditor = ({ initialName, isSaving, onSave, onCancel }: {
    initialName: string;
    isSaving: boolean;
    onSave: (name: string | null) => void;
    onCancel: () => void;
}) => {
    const [value, setValue] = useState(initialName);
    const save = () => onSave(value.trim() || null);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-[300px]">
                    <input
                        autoFocus
                        aria-label="Nombre de la línea"
                        value={value}
                        maxLength={LINE_NAME_MAX}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') save();
                            if (e.key === 'Escape') onCancel();
                        }}
                        className="w-full h-9 rounded-[8px] border-[1.5px] border-brand-accent-strong bg-brand-surface
                            pl-[11px] pr-14 text-sm font-semibold text-brand-text ring-[3px] ring-brand-accent-soft
                            focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11.5px] text-brand-muted tabular-nums">
                        {value.length}/{LINE_NAME_MAX}
                    </span>
                </div>
                <div className="h-9 w-24"><CustomButton variant="secondary" onClick={save} isLoading={isSaving}>Guardar</CustomButton></div>
                <div className="h-9 w-24"><CustomButton variant="ghost" onClick={onCancel} disabled={isSaving}>Cancelar</CustomButton></div>
            </div>
            <p className="mt-1.5 text-xs text-brand-muted">Solo lo ves tú, en Wasmish. Déjalo vacío para usar el nombre en WhatsApp.</p>
        </div>
    );
};
