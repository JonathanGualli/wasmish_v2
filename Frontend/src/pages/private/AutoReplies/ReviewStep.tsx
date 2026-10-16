import { CustomButton } from "../../../components/Button/Button";
import { useLines } from "../../../hooks/useLines";
import { scheduleDescription, welcomeSummary, type EditableRule, type StepKey } from "../../../utils/autoReplyForm";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { StatusDot } from "./StepBar";

/** En cuántas líneas contesta: lo que se enciende es de la cuenta. */
const linesPhrase = (count: number) => {
    if (count === 0) return 'Contestará en cuanto conectes tu número.';
    return `Desde ahora contesta solo en ${count === 1 ? 'tu línea' : `tus ${count} líneas`}.`;
};

/** «precio», «dónde quedan»: la primera frase de cada regla. */
const quoted = (rules: EditableRule[]) => {
    const names = rules.map(rule => `«${rule.keywords[0] ?? 'sin frases'}»`);
    return names.length > 4 ? `${names.slice(0, 4).join(', ')} y ${names.length - 4} más` : names.join(', ');
};

/** El último paso del asistente: así queda, y el aviso del cobro justo antes de encender. */
export const ReviewStep = ({ editor }: { editor: AutoReplyEditor }) => {
    const { form } = editor;
    const { activeLines } = useLines();
    const rulesOn = form.keywordRules.filter(rule => rule.enabled);
    const rulesOff = form.keywordRules.filter(rule => !rule.enabled);

    const cards: { step: StepKey; title: string; on: boolean; status: string; summary: string }[] = [
        {
            step: 'welcome', title: 'Bienvenida', on: form.welcome.enabled,
            status: form.welcome.enabled ? 'Encendida' : 'Apagada',
            summary: form.welcome.enabled ? `${welcomeSummary(form.welcome.returnAfterDays)}.` : 'No saluda a quien escribe por primera vez.',
        },
        {
            step: 'outOfHours', title: 'Fuera de horario', on: form.outOfHours.enabled,
            status: form.outOfHours.enabled ? 'Encendida' : 'Apagada',
            summary: form.outOfHours.enabled ? scheduleDescription(form.outOfHours.schedule) : 'No avisa cuando el negocio está cerrado.',
        },
        {
            step: 'keywords', title: 'Palabras clave', on: rulesOn.length > 0,
            status: form.keywordRules.length ? `${rulesOn.length} de ${form.keywordRules.length} encendidas` : 'Sin reglas',
            summary: form.keywordRules.length
                ? [rulesOn.length ? `${quoted(rulesOn)}.` : 'Todas apagadas.', rulesOff.length && rulesOn.length
                    ? `${quoted(rulesOff)} ${rulesOff.length === 1 ? 'queda apagada' : 'quedan apagadas'}.` : ''].filter(Boolean).join(' ')
                : 'Puedes añadirlas después, desde esta misma página.',
        },
        {
            step: 'fallback', title: 'Si no entiende', on: form.fallback.enabled,
            status: form.fallback.enabled ? 'Encendida' : 'Apagada',
            summary: form.fallback.enabled
                ? `Cuando no saldría nada más, una vez cada ${form.handoffHours} h por conversación.`
                : 'Si el bot no sabe qué decir, no responde.',
        },
        {
            step: 'silence', title: 'Cuándo se calla', on: false, status: `${form.handoffHours} horas`,
            summary: `Tras una respuesta manual del equipo. Cada regla y el «no entiendo», una vez cada ${form.handoffHours} h.`,
        },
    ];

    return (
        <div className="grid gap-[18px]">
            <div className="grid gap-3 md:grid-cols-2">
                {cards.map(card => (
                    <div key={card.step} className="border border-brand-border rounded-[10px] px-4 py-3.5 grid gap-1.5">
                        <div className="flex items-center gap-2.5">
                            <span className="text-[14.5px] font-bold text-brand-text">{card.title}</span>
                            <StatusDot tone={card.on ? 'on' : 'off'}>{card.status}</StatusDot>
                            <button type="button" onClick={() => editor.goTo(card.step)}
                                className="ml-auto text-[13px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                                Editar
                            </button>
                        </div>
                        <div className="text-[13px] leading-[1.5] text-brand-gray-600">{card.summary}</div>
                    </div>
                ))}
            </div>
            <div className="border border-brand-green-200 bg-brand-green-50 rounded-xl px-5 py-[18px] flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
                <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-brand-text">Todo listo para encender</div>
                    <div className="mt-1 text-[13.5px] leading-[1.55] text-brand-strong">
                        {linesPhrase(activeLines.length)} Cada respuesta automática es un mensaje que Meta cobra; cada número tiene unos 1.000 gratis al mes.
                    </div>
                </div>
                <div className="flex-none h-11">
                    <CustomButton onClick={editor.turnOnAndSave} isLoading={editor.isSaving}>Encender y guardar</CustomButton>
                </div>
            </div>
        </div>
    );
};
