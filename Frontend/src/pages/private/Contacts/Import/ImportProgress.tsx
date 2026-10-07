import { AlertCircle, AlertTriangle } from "lucide-react";
import { Callout } from "../../../../components/Callout/Callout";
import { ProgressBar } from "../../../../components/ProgressBar/ProgressBar";
import type { ImportWizard } from "./useImportWizard";

/** Mientras se guarda, tanda a tanda; y si una tanda falla, lo que queda por guardar. */
export const ImportProgress = ({ wizard }: { wizard: ImportWizard }) => {
    const { run, toImport, progress: { saved, left, percent } } = wizard;
    const failed = run.status === 'failed';

    return (
        <div className="max-w-[560px] mx-auto py-6 sm:py-12 grid gap-5">
            <div className="grid gap-1.5">
                <span className="text-[15px] font-semibold text-brand-text">{failed ? 'Importación detenida' : 'Importando…'}</span>
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="font-mono text-[44px] font-semibold tracking-[-0.03em] leading-none tabular-nums text-brand-text">
                        {saved.toLocaleString('es-EC')}
                    </span>
                    <span className="text-[15px] text-brand-gray-600">
                        de <span className="font-mono">{toImport.toLocaleString('es-EC')}</span> guardados
                    </span>
                </div>
            </div>
            <ProgressBar percent={percent} active={!failed} size="md" />
            {failed && run.error ? (
                <Callout tone="danger" icon={<AlertCircle size={16} />} title={run.error.title}>
                    {run.error.detail && <>{run.error.detail} </>}
                    Los <span className="font-mono">{saved.toLocaleString('es-EC')}</span> guardados se quedan. Reintenta para guardar
                    {left > 0 ? <> los <span className="font-mono">{left.toLocaleString('es-EC')}</span> que faltan</> : ' lo que falta'};
                    nadie se duplica.
                </Callout>
            ) : (
                <Callout tone="warning" icon={<AlertTriangle size={16} />} title="No cierres esta pestaña.">
                    Si se cierra, lo ya guardado se queda: vuelve a importar el mismo archivo y se completa el resto sin duplicar.
                </Callout>
            )}
        </div>
    );
};
