import { ArrowRight, Send } from "lucide-react";
import { ConfirmDialog } from "../../../../components/Dialog/ConfirmDialog";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { useLines } from "../../../../hooks/useLines";
import type { Line } from "../../../../models/line.model";
import { pluralize } from "../../../../utils/campaignDisplay";
import { lineLabel } from "../../../../utils/lineDisplay";
import type { CampaignWizard } from "./useCampaignWizard";

const LineName = ({ line }: { line: Line }) => {
    const { colorOf } = useLines();
    return (
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-text">
            <LineSwatch colorClass={colorOf(line.id)} size="sm" />{lineLabel(line)}
        </span>
    );
};

/** Lo que va con la plantilla, para decir qué se pierde: « y su variable y los 2 botones». */
const filledWork = (variables: number, buttons: number) => {
    const parts = [
        variables === 1 ? 'su variable' : variables > 1 ? `sus ${pluralize(variables, 'variable', 'variables')}` : '',
        buttons === 1 ? 'el botón' : buttons > 1 ? `los ${pluralize(buttons, 'botón', 'botones')}` : '',
    ].filter(Boolean);
    return parts.length ? ` y ${parts.join(' y ')}` : '';
};

/**
 * Pasar a una línea de otra cuenta de WhatsApp Business con la plantilla ya
 * elegida: las plantillas son de cada cuenta, así que se quita, y antes se
 * pregunta. Si otra línea conectada sí tiene la plantilla, se dice.
 */
export const LineChangeDialog = ({ wizard }: { wizard: CampaignWizard }) => {
    const { activeLines } = useLines();
    const { pendingLine: next, line: current, template, draft } = wizard;
    if (!next || !current || !template || !draft) return null;

    const alsoHasIt = activeLines.filter(l => l.id !== current.id && l.waBusinessId === template.waBusinessId);

    return (
        <ConfirmDialog
            open
            icon={<Send size={20} />}
            title={`¿Enviar por ${lineLabel(next)}?`}
            description={`${lineLabel(next)} es de otra cuenta de WhatsApp Business, y las plantillas son de cada cuenta. `
                + `Si cambias, se quitan «${template.name}»${filledWork(draft.variables.length, draft.buttons.length)}.`}
            confirmLabel="Cambiar y quitar la plantilla"
            cancelLabel={`Seguir con ${lineLabel(current)}`}
            onConfirm={wizard.confirmLineChange}
            onCancel={wizard.cancelLineChange}
        >
            <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] bg-brand-bg px-3.5 py-2.5 text-[13.5px]">
                <LineName line={current} />
                <ArrowRight size={14} className="text-brand-muted" />
                <LineName line={next} />
                {alsoHasIt.length > 0 && (
                    <span className="ml-auto text-brand-muted">{alsoHasIt.map(lineLabel).join(', ')} sí la tiene{alsoHasIt.length > 1 ? 'n' : ''}</span>
                )}
            </div>
        </ConfirmDialog>
    );
};
