import { RETURN_AFTER_DAYS, type ReturnAfterDays } from "../../../models/autoReply.model";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { ReplyTextField } from "./ReplyTextField";

const RETURN_OPTIONS: Record<string, { title: string; hint: string }> = {
    7: { title: '7 días', hint: 'Saluda de nuevo con frecuencia' },
    30: { title: '30 días', hint: 'Lo más común' },
    90: { title: '90 días', hint: 'Solo tras mucho tiempo' },
    null: { title: 'Nunca', hint: 'Solo la primera vez que escribe' },
};

/** Bienvenida: el texto y cuándo volver a saludar a quien ya había escrito. */
export const WelcomeStep = ({ editor, exampleBadge }: { editor: AutoReplyEditor; exampleBadge: boolean }) => {
    const { welcome } = editor.form;
    return (
        <div className="grid gap-7 @min-[600px]:grid-cols-[minmax(0,1fr)_300px] items-start">
            <ReplyTextField
                label="Mensaje de bienvenida"
                badge={exampleBadge ? 'Ejemplo · edítalo' : undefined}
                value={welcome.text}
                onChange={(text) => editor.setWelcome({ text })}
                error={editor.showIssues ? editor.issues.welcomeText : undefined}
                placeholder="Escribe lo que recibe quien escribe por primera vez…"
                help="Solo texto, hasta 800 caracteres."
                minHeight="min-h-[180px]"
            />
            <fieldset className="grid gap-2">
                <legend className="text-[13.5px] font-semibold text-brand-strong mb-2">Volver a saludar a quien ya había escrito</legend>
                <div className="border border-brand-border rounded-[10px] overflow-hidden divide-y divide-brand-raised">
                    {RETURN_AFTER_DAYS.map((days) => {
                        const selected = welcome.returnAfterDays === days;
                        const option = RETURN_OPTIONS[String(days)];
                        return (
                            <label key={String(days)} className={`flex gap-[11px] items-start px-3.5 py-[11px] cursor-pointer transition-colors
                                ${selected ? 'bg-brand-green-50' : 'bg-brand-surface hover:bg-brand-bg'}`}>
                                <input
                                    type="radio"
                                    name="welcome-return"
                                    className="sr-only peer"
                                    checked={selected}
                                    onChange={() => editor.setWelcome({ returnAfterDays: days as ReturnAfterDays })}
                                />
                                <span className={`flex-none mt-px w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center
                                    peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand-accent-soft
                                    ${selected ? 'border-brand-accent-strong' : 'border-brand-border-strong'}`}>
                                    {selected && <span className="w-2 h-2 rounded-full bg-brand-accent-strong" />}
                                </span>
                                <span>
                                    <span className={`block text-sm text-brand-text ${selected ? 'font-semibold' : 'font-medium'}`}>{option.title}</span>
                                    <span className="block text-[12.5px] text-brand-muted mt-px">{option.hint}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        </div>
    );
};
