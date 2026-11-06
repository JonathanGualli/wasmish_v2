import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { Switch } from "./Switch";

/** El interruptor general: se guarda con un toque (al encender, pregunta antes). */
export const MasterSwitch = ({ editor, onChange, compact = false }: {
    editor: AutoReplyEditor;
    onChange: (enabled: boolean) => void;
    /** El de la barra del lienzo (diseño «Respuestas automáticas v4», 4a): más bajo. */
    compact?: boolean;
}) => {
    const on = editor.form.enabled;
    return (
        <div className={`flex-none flex items-center rounded-full border
            ${compact ? 'gap-2 pl-1.5 pr-3 py-[5px]' : 'gap-2.5 pl-2 pr-3.5 py-[7px]'}
            ${on ? 'border-brand-green-200 bg-brand-green-50' : 'border-brand-border bg-brand-surface'}`}>
            <Switch size={compact ? 'md' : 'lg'} checked={on} disabled={editor.isSaving} label="Respuestas automáticas encendidas" onChange={onChange} />
            <span className={`font-semibold ${compact ? 'text-[13px]' : 'text-sm'} ${on ? 'text-brand-accent-strong' : 'text-brand-muted'}`}>
                {on ? 'Encendidas' : 'Apagadas'}
            </span>
        </div>
    );
};
