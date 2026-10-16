import { Info } from "lucide-react";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { ReplyTextField } from "./ReplyTextField";

/**
 * «Si no entiende»: el aspecto de «Bienvenida», con el texto y su interruptor
 * en la cabecera. Cuándo sale (spec § 10): solo si no saldría nada más, con
 * algo escrito, una vez por conversación cada `handoffHours`.
 */
export const FallbackStep = ({ editor, exampleBadge }: { editor: AutoReplyEditor; exampleBadge: boolean }) => {
    const { fallback, handoffHours } = editor.form;
    return (
        <div className="grid gap-4 max-w-[720px]">
            <ReplyTextField
                label="Mensaje cuando no entiende"
                badge={exampleBadge ? 'Ejemplo · edítalo' : undefined}
                value={fallback.text}
                onChange={(text) => editor.setFallback({ text })}
                error={editor.showIssues ? editor.issues.fallbackText : undefined}
                placeholder="Perdona, no te entendí. Puedo ayudarte con…"
                help="Di de qué temas puedes informar, y que si es otra cosa le responde alguien del equipo."
                minHeight="min-h-[150px]"
            />
            <div className="flex gap-2.5 items-start px-3.5 py-3 rounded-[10px] bg-brand-bg text-[13px] leading-[1.55] text-brand-gray-600">
                <Info size={15} className="flex-none mt-0.5 text-brand-muted" />
                <span>
                    Sale <b className="font-semibold text-brand-text">solo si no saldría nada más</b>: ni la bienvenida, ni una palabra
                    clave, ni el fuera de horario. Una vez por conversación cada {handoffHours} h, y nunca a una foto o un audio sin texto.
                </span>
            </div>
        </div>
    );
};
