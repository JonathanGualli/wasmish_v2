import { useState, type ReactNode } from "react";
import { AlertCircle, Reply, Send, X } from "lucide-react";
import { useAutoReplies } from "../../../hooks/useAutoReplies";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { useLeaveGuard } from "../../../components/Layout/NavigationGuardContext";
import { useNotice } from "../../../components/Notice/context/useNotice";
import { CustomButton } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { BlankState } from "../../../components/BlankState/BlankState";
import { ConfirmDialog } from "../../../components/Dialog/ConfirmDialog";
import { SkeletonBox } from "../../../components/Skeleton/Skeleton";
import type { AutoRepliesResponse, PreviewMessage } from "../../../models/autoReply.model";
import { apiErrorOf } from "../../../utils/apiError";
import { useAutoReplyEditor, type AutoReplyEditor, type SaveKind } from "./useAutoReplyEditor";
import { TestPanel } from "./TestPanel";
import { FlowEditorView } from "./FlowEditorView";
import { PhoneFlow } from "./PhoneFlow";
import { SetupWizard, WizardBarActions } from "./SetupWizard";

/*
 * «Respuestas automáticas». Solo owner y admin (`autoReplies.manage`, en la
 * ruta). Lo que se edita y cómo se guarda vive en `useAutoReplyEditor`.
 *
 * Desde 1024 px, el lienzo del bot con menús (`FlowEditorView`, diseño
 * «Respuestas automáticas v4 - Lienzo»), con el asistente encima la primera
 * vez (4f). En pantallas más estrechas, el asistente solo y después
 * `PhoneFlow`, que se navega en vez de un lienzo (p1 a p3).
 */

const COST_LINE = 'Cada respuesta automática es un mensaje que Meta cobra; cada número tiene unos 1.000 gratis al mes.';

export const AutoRepliesPage = () => {
    const query = useAutoReplies();

    if (query.isLoading) return <AutoRepliesSkeleton />;
    // Con datos ya en pantalla, una recarga fallida (p. ej. al reconectar el SSE)
    // deja `isError` y conserva `data`: el editor sigue, con lo que se escribió.
    if (!query.data) {
        return (
            <div className="mx-auto max-w-5xl px-5 sm:px-8 py-8 sm:py-10">
                <BlankState
                    tone="danger"
                    icon={<AlertCircle size={22} />}
                    title="No pudimos cargar tus respuestas automáticas"
                    action={<CustomButton variant="secondary" onClick={() => query.refetch()}>Reintentar</CustomButton>}
                >
                    Siguen funcionando como estaban. Revisa tu conexión y vuelve a intentarlo.
                </BlankState>
            </div>
        );
    }
    return <AutoRepliesEditorView data={query.data} />;
};

const AutoRepliesEditorView = ({ data }: { data: AutoRepliesResponse }) => {
    const { notify } = useNotice();
    const wide = useMediaQuery('(min-width: 1024px)');

    const onSaved = (saved: AutoRepliesResponse, kind: SaveKind) => notify({
        kind: 'success',
        text: kind === 'switch'
            ? (saved.enabled ? 'Respuestas automáticas encendidas.' : 'Respuestas automáticas apagadas: no sale ninguna.')
            : (saved.enabled ? 'Respuestas guardadas. Ya están funcionando.' : 'Guardado. Las respuestas automáticas siguen apagadas.'),
    });
    // Otra pestaña con la página de antes de los menús no puede borrarlos (decisión G):
    // el 409 no es un error que se reintenta, sino recargar (diseño, 4e).
    const [outdated, setOutdated] = useState(false);
    const onSaveError = (error: unknown) => {
        const { message, code } = apiErrorOf(error, 'No se pudo guardar. Inténtalo de nuevo.');
        if (code === 'auto_replies_outdated') setOutdated(true);
        else notify({ kind: 'error', text: message });
    };

    const editor = useAutoReplyEditor(data, onSaved, onSaveError);
    const [confirmEnable, setConfirmEnable] = useState(false);
    const [leaving, setLeaving] = useState<(() => void) | null>(null);
    const [testOpen, setTestOpen] = useState(false);
    // La conversación de «Probar», de la página: sigue al pasar de una pestaña a otra.
    const [testMessages, setTestMessages] = useState<PreviewMessage[]>([]);

    useLeaveGuard(editor.dirty, (proceed) => setLeaving(() => proceed));

    const onMasterSwitch = (enabled: boolean) => (enabled ? setConfirmEnable(true) : editor.setEnabledNow(false));

    const dialogs = (
        <>
            <ConfirmDialog
                open={confirmEnable}
                title="¿Encender las respuestas automáticas?"
                description={`Desde ahora, Wasmish contesta solo en todas tus líneas. ${COST_LINE}`}
                icon={<Reply size={20} />}
                confirmLabel="Encender"
                cancelLabel="Ahora no"
                onConfirm={() => { setConfirmEnable(false); editor.setEnabledNow(true); }}
                onCancel={() => setConfirmEnable(false)}
            />
            <ConfirmDialog
                open={leaving !== null}
                tone="danger"
                title="¿Salir sin guardar?"
                description={editor.mode === 'wizard'
                    ? 'Si sales ahora, se pierde lo que configuraste. Para guardarlo apagado, usa «Terminar luego».'
                    : 'Si sales ahora, los cambios se pierden y sigue funcionando lo que estaba guardado.'}
                confirmLabel="Salir sin guardar"
                cancelLabel="Seguir editando"
                onConfirm={() => { const proceed = leaving; setLeaving(null); proceed?.(); }}
                onCancel={() => setLeaving(null)}
            />
            {testOpen && !wide && (
                <TestSheet onClose={() => setTestOpen(false)}><TestPanel heading editor={editor} messages={testMessages} onMessagesChange={setTestMessages} /></TestSheet>
            )}
        </>
    );

    if (wide) {
        return (
            <FlowEditorView editor={editor} onMasterSwitch={onMasterSwitch} outdated={outdated}
                testMessages={testMessages} onTestMessagesChange={setTestMessages}>
                {dialogs}
            </FlowEditorView>
        );
    }

    if (editor.mode === 'wizard') {
        return (
            <div className="min-h-full flex flex-col gap-4 bg-brand-bg px-3.5 sm:px-5 pt-4 sm:pt-[22px] pb-6">
                <header className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
                    <PageTitle subtitle="Configuración inicial · nada sale hasta encender" />
                    <div className="ml-auto flex items-center gap-2.5">
                        <div className="h-[38px]"><CustomButton variant="outline" onClick={() => setTestOpen(true)}><Send size={15} /> Probar</CustomButton></div>
                        <WizardBarActions editor={editor} />
                    </div>
                </header>
                {editor.saveBlocked && <SaveBlockedNotice editor={editor} />}
                <div className="flex justify-center"><SetupWizard editor={editor} contained={false} /></div>
                {dialogs}
            </div>
        );
    }

    return (
        <>
            <PhoneFlow editor={editor} onMasterSwitch={onMasterSwitch} outdated={outdated} onTest={() => setTestOpen(true)} />
            {dialogs}
        </>
    );
};

const PageTitle = ({ subtitle }: { subtitle: string }) => (
    <div className="flex items-center gap-3.5 min-w-0 lg:flex-1 max-w-[620px]">
        <div className="w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center flex-none">
            <Reply size={20} />
        </div>
        <div className="min-w-0">
            <h1 className="text-[22px] font-bold tracking-[-0.025em] text-brand-text">Respuestas automáticas</h1>
            <p className="text-[13.5px] leading-[1.45] text-brand-muted mt-px">{subtitle}</p>
        </div>
    </div>
);


const SaveBlockedNotice = ({ editor }: { editor: AutoReplyEditor }) => (
    <Callout tone="danger" icon={<AlertCircle size={16} />}>
        <span className="text-brand-strong">
            <b className="font-semibold text-brand-text">No se guardó.</b>{' '}
            Hay {editor.issueTotal} {editor.issueTotal === 1 ? 'cosa' : 'cosas'} por corregir, marcadas en rojo.
        </span>
    </Callout>
);

/** «Probar» como hoja inferior (teléfono y pantallas sin sitio para la columna). */
const TestSheet = ({ onClose, children }: { onClose: () => void; children: ReactNode }) => (
    <div className="fixed inset-0 z-[55] flex flex-col justify-end md:items-center md:justify-center md:p-6" role="dialog" aria-modal="true" aria-label="Probar">
        <div className="absolute inset-0 bg-brand-ink/50" onClick={onClose} />
        <div className="relative bg-brand-surface rounded-t-2xl md:rounded-2xl h-[82dvh] md:h-[min(720px,90dvh)] w-full md:max-w-[440px]
            px-4 pt-3 pb-[calc(16px+var(--safe-bottom))] flex flex-col">
            <button type="button" onClick={onClose} aria-label="Cerrar"
                className="absolute right-2 top-2 w-11 h-11 flex items-center justify-center text-brand-muted hover:text-brand-text cursor-pointer">
                <X size={18} />
            </button>
            <div className="mx-auto mb-3 w-10 h-1 rounded-full bg-brand-border-strong md:hidden" />
            <div className="flex-1 min-h-0 pr-8">{children}</div>
        </div>
    </div>
);

const AutoRepliesSkeleton = () => (
    <div className="h-full flex flex-col gap-4 px-3.5 sm:px-5 lg:px-7 pt-[22px] pb-6" aria-busy="true">
        <PageTitle subtitle="Wasmish contesta solo con lo que dejes escrito. Vale para todas tus líneas." />
        <div className="grid gap-3 lg:hidden">
            <SkeletonBox className="h-[92px] rounded-[14px]" />
            <SkeletonBox className="h-[272px] rounded-[14px]" />
        </div>
        <div className="hidden lg:grid flex-1 min-h-[360px] gap-5 grid-cols-[minmax(0,1fr)_380px]">
            <SkeletonBox className="h-full rounded-xl" tone="soft" />
            <SkeletonBox className="h-full rounded-xl" tone="soft" />
        </div>
    </div>
);
