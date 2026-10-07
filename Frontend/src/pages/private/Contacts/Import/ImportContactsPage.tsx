import { useEffect, type ComponentProps } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { WizardHeader } from "../../../../components/Wizard/WizardHeader";
import { WizardFooter } from "../../../../components/Wizard/WizardFooter";
import { ContactsPath } from "../../../../models/routes.models";
import { pluralize } from "../../../../utils/campaignDisplay";
import { fileProblemCopy } from "../../../../utils/contactsFile";
import { usedColumns } from "../../../../utils/contactImport";
import { IMPORT_STEPS, useImportWizard, type ImportWizard } from "./useImportWizard";
import { FileStep } from "./FileStep";
import { ColumnsStep } from "./ColumnsStep";
import { ReviewStep } from "./ReviewStep";
import { ImportProgress } from "./ImportProgress";
import { ImportResult } from "./ImportResult";

type FooterProps = ComponentProps<typeof WizardFooter>;

/** El pie de cada momento: qué falta para seguir (o qué va a pasar) y los botones. Terminado, no hay pie. */
const footerFor = (wizard: ImportWizard, leave: () => void): FooterProps | null => {
    const { step, goToStep, run } = wizard;

    if (run.status === 'running') return { hint: 'Guardando en tandas: tarda unos segundos.' };
    if (run.status === 'failed') {
        const { saved, left } = wizard.progress;
        return {
            hint: `${pluralize(saved, 'guardado', 'guardados')} · ${left > 0 ? `faltan ${left.toLocaleString('es-EC')}` : 'falta terminar'}.`,
            back: { label: 'Salir', onClick: leave },
            next: { label: left > 0 ? `Reintentar los ${left.toLocaleString('es-EC')}` : 'Reintentar', onClick: run.retry },
        };
    }
    if (run.status === 'done') return null;

    if (step === 1) {
        const { picked, isReading, problem } = wizard;
        const hint = isReading ? 'Leyendo el archivo…'
            : problem ? fileProblemCopy(problem).footer
            : picked ? 'Nada se guarda hasta el último paso.'
            : 'Elige un archivo para continuar.';
        return {
            hint,
            back: { label: 'Cancelar', onClick: leave },
            next: { label: 'Siguiente', onClick: () => goToStep(2), disabled: !picked || isReading || Boolean(problem) },
        };
    }

    if (step === 2) {
        const { mapping, sheet, unused } = wizard;
        const phoneMissing = mapping?.phone.column === null;
        const columns = sheet ? usedColumns(sheet).length : 0;
        const hint = phoneMissing ? 'Elige la columna del teléfono para continuar.'
            : unused.length > 0 ? 'Revisa que los ejemplos tengan sentido.'
            : columns === 1 ? 'La columna tiene dónde ir.'
            : `Las ${columns} columnas tienen dónde ir.`;
        return {
            hint,
            hintTone: phoneMissing ? 'danger' : 'muted',
            back: { label: 'Atrás', onClick: () => goToStep(1) },
            next: { label: 'Revisar', onClick: wizard.review, disabled: phoneMissing },
        };
    }

    const { preview, consent, toImport, startImport } = wizard;
    const back = { label: 'Atrás', onClick: () => goToStep(2) };
    if (!preview.data) {
        return { hint: preview.isError ? 'No se pudo comprobar el archivo.' : 'Comprobando…', hintTone: preview.isError ? 'danger' : 'muted', back };
    }
    if (toImport === 0) {
        return { hint: 'No hay nada que importar en este archivo.', back: { label: 'Elegir otro archivo', onClick: () => goToStep(1) } };
    }
    return {
        hint: consent ? 'Nada se guarda hasta que pulses Importar.' : 'Marca la casilla de consentimiento para importar.',
        hintTone: consent ? 'muted' : 'warning',
        back,
        next: { label: `Importar ${pluralize(toImport, 'contacto', 'contactos')}`, onClick: startImport, disabled: !consent },
    };
};

/**
 * «Importar contactos»: un asistente de tres pasos (Archivo → Columnas →
 * Revisar) con la misma cabecera y el mismo pie que «Nueva campaña». El
 * archivo se lee en el navegador y se comprueba entero en el backend antes de
 * guardar nada; luego se guarda en tandas.
 */
export const ImportContactsPage = () => {
    const navigate = useNavigate();
    const wizard = useImportWizard();
    const { step, run, file, sheet } = wizard;
    const running = run.status === 'running';

    // Mientras se guarda, cerrar la pestaña dejaría el archivo a medias: el navegador pregunta antes.
    useEffect(() => {
        if (!running) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [running]);

    const footer = footerFor(wizard, () => navigate(ContactsPath));
    const editing = run.status === 'idle';

    return (
        <div className="min-h-full flex flex-col">
            <div className="flex-1 mx-auto w-full max-w-6xl px-5 sm:px-8 pt-6 sm:pt-8 pb-10">
                <WizardHeader
                    parent={{ label: 'Contactos', to: ContactsPath }}
                    title="Importar contactos"
                    icon={<Download size={20} />}
                    description="Desde un Excel o CSV. Lo que ya tienes en Wasmish no se toca."
                    steps={IMPORT_STEPS}
                    // Importando o terminado, los tres pasos quedan hechos.
                    step={editing ? step : IMPORT_STEPS.length + 1}
                    aside={file && sheet && step > 1 && (
                        <span className="hidden md:inline font-mono text-xs text-brand-muted">
                            {file.name} · {pluralize(sheet.rows.length, 'fila', 'filas')}
                        </span>
                    )}
                />

                {editing && step === 1 && <FileStep wizard={wizard} />}
                {editing && step === 2 && <ColumnsStep wizard={wizard} />}
                {editing && step === 3 && <ReviewStep wizard={wizard} />}
                {(running || run.status === 'failed') && <ImportProgress wizard={wizard} />}
                {run.status === 'done' && <ImportResult wizard={wizard} />}
            </div>

            {footer && <WizardFooter {...footer} />}
        </div>
    );
};
