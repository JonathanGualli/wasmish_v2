import { LineChip } from "../../../components/Line/LineChip";
import { useLines } from "../../../hooks/useLines";
import type { Template } from "../../../models/template.model";

/**
 * Por qué líneas se puede enviar: las conectadas de su cuenta de WhatsApp
 * Business, que es de quien es la plantilla. Con dos cuentas, dos plantillas
 * con el mismo nombre se distinguen por aquí.
 */
export const TemplateLinesCell = ({ template }: { template: Template }) => {
    const { activeLines } = useLines();
    const lines = activeLines.filter(line => line.waBusinessId === template.waBusinessId);
    if (lines.length === 0) return <span className="text-brand-subtle">—</span>;
    return (
        <div className="flex flex-col gap-1">
            {lines.map(line => <LineChip key={line.id} lineId={line.id} wide />)}
        </div>
    );
};
