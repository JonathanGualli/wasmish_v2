import { Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { useLines } from "../../hooks/useLines";
import type { Line } from "../../models/line.model";
import { lineLabel, lineNumber } from "../../utils/lineDisplay";
import { LineSwatch } from "./LineSwatch";

interface Props {
    /** La línea elegida; si no es una conectada, se enseña la por defecto. */
    value: string | null;
    onChange: (lineId: string) => void;
    /** Ya hay una plantilla elegida: pasar a otra cuenta de WhatsApp Business la quita. */
    templateChosen?: boolean;
}

/** Lo que cambia al elegir cada línea, dicho respecto a la elegida: las plantillas van por cuenta de WhatsApp Business. */
const optionHint = (line: Line, selected: Line, templateChosen: boolean) => {
    if (line.id === selected.id) return line.verifiedName ? `La ven como «${line.verifiedName}»` : null;
    if (line.waBusinessId === selected.waBusinessId) return `Misma cuenta que ${lineLabel(selected)}: mismas plantillas`;
    return templateChosen
        ? 'Otra cuenta de WhatsApp Business: se quitará la plantilla elegida'
        : 'Otra cuenta de WhatsApp Business: otras plantillas';
};

/**
 * «Enviar desde»: por qué línea sale lo que se envía. Solo con más de una
 * línea conectada (`hasManyLines`); con una, se usa esa sin preguntar. En
 * escritorio, una lista bajo el campo; en móvil, una hoja inferior.
 */
export const LineSelect = ({ value, onChange, templateChosen = false }: Props) => {
    const { hasManyLines, activeLines, defaultLine, colorOf } = useLines();
    const selected = activeLines.find(line => line.id === value) ?? defaultLine ?? activeLines[0];
    if (!hasManyLines || !selected) return null;

    return (
        <Field className="grid gap-[7px]">
            <div className="flex items-baseline gap-2">
                <Label className="text-[13px] font-semibold text-brand-strong">Enviar desde</Label>
                <span className="ml-auto text-xs text-brand-muted">Las plantillas dependen de la línea</span>
            </div>
            <Listbox value={selected.id} onChange={onChange}>
                {({ open }) => (
                    <div className="relative">
                        <ListboxButton
                            className={`w-full flex items-center gap-2.5 min-h-[46px] max-sm:min-h-12 px-[14px] py-2 rounded-[8px] border
                                bg-brand-surface text-left cursor-pointer transition-colors
                                ${open ? 'border-brand-success ring-[3px] ring-brand-accent-soft' : 'border-brand-border-strong'}`}>
                            <LineSwatch colorClass={colorOf(selected.id)} />
                            <span className="min-w-0 truncate text-sm font-semibold text-brand-text">{lineLabel(selected)}</span>
                            <span className="hidden sm:inline font-mono text-[12.5px] text-brand-muted tabular-nums">{lineNumber(selected)}</span>
                            {selected.isDefault && <span className="flex-none text-xs text-brand-muted">· por defecto</span>}
                            <ChevronDown size={16} className="ml-auto flex-none text-brand-muted" />
                        </ListboxButton>
                        {open && <div aria-hidden className="sm:hidden fixed inset-0 z-40 bg-brand-ink/50" />}
                        <ListboxOptions
                            className="absolute z-50 inset-x-0 top-[52px] rounded-xl border border-brand-border bg-brand-surface p-1.5
                                shadow-[0_18px_44px_rgba(14,17,22,0.16)] focus:outline-none
                                max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto
                                max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:px-4 max-sm:pt-2.5 max-sm:pb-7">
                            <div className="sm:hidden">
                                <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-brand-border-strong" />
                                <div className="px-1 pb-2.5 text-base font-bold text-brand-text">Enviar desde</div>
                            </div>
                            {activeLines.map(line => {
                                const hint = optionHint(line, selected, templateChosen);
                                return (
                                    <ListboxOption key={line.id} value={line.id}
                                        className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 max-sm:min-h-[60px] cursor-pointer
                                            data-[focus]:bg-brand-bg data-[selected]:bg-brand-bg">
                                        <LineSwatch colorClass={colorOf(line.id)} />
                                        <span className="flex-1 min-w-0">
                                            <span className="flex flex-wrap items-baseline gap-x-2">
                                                <span className="text-sm font-semibold text-brand-text">{lineLabel(line)}</span>
                                                <span className="font-mono text-xs text-brand-muted tabular-nums">{lineNumber(line)}</span>
                                                {line.isDefault && (
                                                    <span className="self-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em]
                                                        bg-brand-accent-soft text-brand-accent-strong">
                                                        Por defecto
                                                    </span>
                                                )}
                                            </span>
                                            {hint && <span className="block mt-0.5 text-xs text-brand-muted">{hint}</span>}
                                        </span>
                                        {line.id === selected.id && <Check size={16} strokeWidth={2.6} className="flex-none text-brand-accent-strong" />}
                                    </ListboxOption>
                                );
                            })}
                        </ListboxOptions>
                    </div>
                )}
            </Listbox>
        </Field>
    );
};
