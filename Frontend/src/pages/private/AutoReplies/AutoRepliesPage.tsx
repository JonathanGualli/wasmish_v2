import { useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, Reply, Send, X } from "lucide-react";
import { useAutoReplies } from "../../../hooks/useAutoReplies";
import { PHONE_QUERY, useMediaQuery } from "../../../hooks/useMediaQuery";
import { useLeaveGuard } from "../../../components/Layout/NavigationGuardContext";
import { useNoticeContext } from "../../../components/Notice/context/UseNoticeContext";
import { CustomButton } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { BlankState } from "../../../components/BlankState/BlankState";
import { ConfirmDialog } from "../../../components/Dialog/ConfirmDialog";
import { SkeletonBox } from "../../../components/Skeleton/Skeleton";
import type { AutoRepliesResponse } from "../../../models/autoReply.model";
import { KEYWORD_RULES_MAX } from "../../../models/autoReply.model";
import { apiErrorOf } from "../../../utils/apiError";
import { EDIT_STEPS, STEP_TITLES, WIZARD_STEPS, type StepKey } from "../../../utils/autoReplyForm";
import { useAutoReplyEditor, type AutoReplyEditor, type SaveKind } from "./useAutoReplyEditor";
import { AutoRepliesIntro } from "./AutoRepliesIntro";
import { StepBar, StepStatus } from "./StepBar";
import { stepSummary } from "./stepState";
import { WelcomeStep } from "./WelcomeStep";
import { OutOfHoursStep } from "./OutOfHoursStep";
import { KeywordsStep } from "./KeywordsStep";
import { SilenceStep } from "./SilenceStep";
import { ReviewStep } from "./ReviewStep";
import { FallbackStep } from "./FallbackStep";
import { TestPanel } from "./TestPanel";
import { Switch } from "./Switch";

/*
 * «Respuestas automáticas» (diseño «Wasmish Respuestas automáticas v2», con los
 * estados de la v1). Solo owner y admin (`autoReplies.manage`, en la ruta).
 * Lo que se edita y cómo se guarda vive en `useAutoReplyEditor`.
 */

const STEP_DESCRIPTIONS: Record<StepKey, string> = {
    welcome: 'A quien escribe por primera vez, o vuelve después de un tiempo sin escribir.',
    outOfHours: 'A quien escribe con el negocio cerrado.',
    keywords: `Si el mensaje dice una de las frases, responde ese texto. Hasta ${KEYWORD_RULES_MAX} reglas.`,
    fallback: 'Cuando el bot no sabría qué decir: a «me gusta el café con pan», por ejemplo.',
    silence: 'Para que no conteste encima de una persona ni repita lo mismo.',
    review: 'Así queda. Puedes cambiar cualquier cosa después, desde esta misma página.',
};

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
    const { setState, setContent } = useNoticeContext();
    const phone = useMediaQuery(PHONE_QUERY);
    const wide = useMediaQuery('(min-width: 1024px)');

    const notify = (content: ReactNode) => {
        setContent(content);
        setState(true);
    };
    const onSaved = (saved: AutoRepliesResponse, kind: SaveKind) => notify(
        <p className="text-brand-accent-strong">
            {kind === 'switch'
                ? (saved.enabled ? 'Respuestas automáticas encendidas.' : 'Respuestas automáticas apagadas: no sale ninguna.')
                : (saved.enabled ? 'Respuestas guardadas. Ya están funcionando.' : 'Guardado. Las respuestas automáticas siguen apagadas.')}
        </p>,
    );
    const onSaveError = (error: unknown) =>
        notify(<p className="text-brand-danger">{apiErrorOf(error, 'No se pudo guardar. Inténtalo de nuevo.').message}</p>);

    const editor = useAutoReplyEditor(data, onSaved, onSaveError);
    const [confirmEnable, setConfirmEnable] = useState(false);
    const [leaving, setLeaving] = useState<(() => void) | null>(null);
    const [testOpen, setTestOpen] = useState(false);
    // En el teléfono, configurada: la lista de pasos o uno abierto.
    const [phoneStep, setPhoneStep] = useState<StepKey | null>(null);

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
                <TestSheet onClose={() => setTestOpen(false)}><TestPanel editor={editor} /></TestSheet>
            )}
        </>
    );

    const startWizard = (example: boolean) => editor.startWizard({ example });

    if (editor.mode === 'intro') {
        return (
            <div className="mx-auto max-w-6xl px-5 sm:px-8 py-6 sm:py-8 grid gap-6">
                <PageTitle subtitle="Wasmish contesta solo con lo que dejes escrito. Vale para todas tus líneas." />
                <AutoRepliesIntro onStart={startWizard} />
            </div>
        );
    }

    if (phone) {
        return (
            <>
                <PhoneLayout editor={editor} phoneStep={phoneStep} setPhoneStep={setPhoneStep}
                    onMasterSwitch={onMasterSwitch} onTest={() => setTestOpen(true)} />
                {dialogs}
            </>
        );
    }

    const wizard = editor.mode === 'wizard';
    const stepIndex = editor.steps.indexOf(editor.step);
    const nextStep = WIZARD_STEPS[stepIndex + 1];

    return (
        <div className="h-full min-h-[680px] flex flex-col gap-4 px-5 lg:px-7 pt-[22px] pb-6">
            <header className="flex-none flex flex-wrap lg:flex-nowrap items-center gap-x-3.5 gap-y-3">
                <PageTitle subtitle={wizard
                    ? 'Configuración inicial. Nada sale hasta el último paso.'
                    : 'Wasmish contesta solo con lo que dejes escrito. Vale para todas tus líneas.'} />
                {!wizard && <MasterSwitch editor={editor} onChange={onMasterSwitch} />}
                <div className="ml-auto flex items-center gap-2.5">
                    {!wide && (
                        <div className="h-[38px]"><CustomButton variant="outline" onClick={() => setTestOpen(true)}><Send size={15} /> Probar</CustomButton></div>
                    )}
                    {wizard ? (
                        <>
                            <span className="font-mono tabular-nums text-[12.5px] text-brand-muted whitespace-nowrap">Paso {stepIndex + 1} de {editor.steps.length}</span>
                            <div className="h-[38px]"><CustomButton variant="outline" onClick={editor.finishLater} isLoading={editor.isSaving}>Terminar luego</CustomButton></div>
                        </>
                    ) : (
                        <>
                            {editor.dirty && (
                                <>
                                    <span className="hidden xl:inline-flex items-center gap-[7px] text-[13px] text-brand-gray-600 whitespace-nowrap">
                                        <span className="w-[7px] h-[7px] rounded-full bg-brand-warning" />Cambios sin guardar
                                    </span>
                                    <div className="h-[38px]"><CustomButton variant="outline" onClick={editor.discard}>Descartar</CustomButton></div>
                                </>
                            )}
                            <div className="h-[38px]">
                                <CustomButton onClick={editor.saveAll} isLoading={editor.isSaving} disabled={!editor.dirty}>Guardar</CustomButton>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {editor.saveBlocked && <SaveBlockedNotice editor={editor} />}

            <div className="flex-none"><StepBar editor={editor} /></div>

            <div className="flex-1 min-h-0 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="min-h-0 border border-brand-border rounded-xl flex flex-col overflow-hidden">
                    <StepHeader editor={editor} />
                    <div className="@container flex-1 min-h-0 overflow-y-auto px-[22px] py-5">
                        <StepContent editor={editor} phone={false} />
                    </div>
                    {wizard && (
                        <div className="flex-none flex items-center gap-2.5 px-[22px] py-3.5 border-t border-brand-raised">
                            {stepIndex > 0 && (
                                <div className="h-[38px]"><CustomButton variant="outline" onClick={editor.previous}><ArrowLeft size={15} /> Anterior</CustomButton></div>
                            )}
                            {nextStep && (
                                <>
                                    <span className="ml-auto text-[13px] text-brand-muted">Luego: {STEP_TITLES[nextStep].toLowerCase()}</span>
                                    <div className="h-[38px]"><CustomButton onClick={editor.next}>Siguiente <ArrowRight size={15} /></CustomButton></div>
                                </>
                            )}
                        </div>
                    )}
                </section>
                {wide && (
                    <aside className="min-h-0 border border-brand-border rounded-xl p-4 overflow-hidden flex flex-col">
                        <TestPanel editor={editor} />
                    </aside>
                )}
            </div>
            {dialogs}
        </div>
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

/** El interruptor general: se guarda con un toque (al encender, pregunta antes). */
const MasterSwitch = ({ editor, onChange }: { editor: AutoReplyEditor; onChange: (enabled: boolean) => void }) => {
    const on = editor.form.enabled;
    return (
        <div className={`flex items-center gap-2.5 pl-2 pr-3.5 py-[7px] rounded-full border
            ${on ? 'border-brand-green-200 bg-brand-green-50' : 'border-brand-border bg-brand-surface'}`}>
            <Switch size="lg" checked={on} disabled={editor.isSaving} label="Respuestas automáticas encendidas" onChange={onChange} />
            <span className={`text-sm font-semibold ${on ? 'text-brand-accent-strong' : 'text-brand-muted'}`}>{on ? 'Encendidas' : 'Apagadas'}</span>
        </div>
    );
};

const SaveBlockedNotice = ({ editor }: { editor: AutoReplyEditor }) => {
    const stepsWithIssues = EDIT_STEPS.filter(step => editor.counts[step] > 0).length;
    return (
        <Callout tone="danger" icon={<AlertCircle size={16} />}>
            <span className="text-brand-strong">
                <b className="font-semibold text-brand-text">No se guardó.</b>{' '}
                Hay {editor.issueTotal} {editor.issueTotal === 1 ? 'cosa' : 'cosas'} por corregir
                {stepsWithIssues > 1 ? ` en ${stepsWithIssues} pasos` : ''}; {stepsWithIssues > 1 ? 'están marcados' : 'está marcado'} en rojo.
            </span>
        </Callout>
    );
};

/** La cabecera del paso abierto: título, para qué es y su interruptor (o el contador de reglas). */
const StepHeader = ({ editor }: { editor: AutoReplyEditor }) => {
    const { step, form } = editor;
    return (
        <div className="flex-none flex items-start gap-4 px-[22px] py-[18px] border-b border-brand-raised">
            <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold tracking-[-0.015em] text-brand-text">{STEP_TITLES[step]}</h2>
                <p className="mt-[3px] text-[13.5px] leading-[1.5] text-brand-muted">{STEP_DESCRIPTIONS[step]}</p>
            </div>
            <SectionToggle editor={editor} />
            {step === 'keywords' && (
                <span className="flex-none font-mono tabular-nums text-[12.5px] font-semibold text-brand-strong bg-brand-bg rounded-full px-[11px] py-[5px]">
                    {form.keywordRules.length} de {KEYWORD_RULES_MAX}
                </span>
            )}
        </div>
    );
};

/** Encender o apagar la bienvenida, el fuera de horario o el «no entiendo». */
const SectionToggle = ({ editor }: { editor: AutoReplyEditor }) => {
    const { step, form } = editor;
    const toggles = {
        welcome: { on: form.welcome.enabled, set: (enabled: boolean) => editor.setWelcome({ enabled }) },
        outOfHours: { on: form.outOfHours.enabled, set: (enabled: boolean) => editor.setOutOfHours({ enabled }) },
        fallback: { on: form.fallback.enabled, set: (enabled: boolean) => editor.setFallback({ enabled }) },
    };
    if (!(step in toggles)) return null;
    const { on, set } = toggles[step as keyof typeof toggles];
    return (
        <span className="flex-none flex items-center gap-2.5 text-[13.5px] font-semibold text-brand-strong">
            {on ? 'Encendida' : 'Apagada'}
            <Switch checked={on} disabled={editor.isSaving} label={`${STEP_TITLES[step]} encendida`} onChange={set} />
        </span>
    );
};

/** El paso abierto. Mientras se guarda no se edita: la respuesta reemplaza lo que hay en pantalla. */
const StepContent = ({ editor, phone }: { editor: AutoReplyEditor; phone: boolean }) => (
    <fieldset disabled={editor.isSaving} className="contents"><StepFields editor={editor} phone={phone} /></fieldset>
);

const StepFields = ({ editor, phone }: { editor: AutoReplyEditor; phone: boolean }) => {
    switch (editor.step) {
        case 'welcome': return <WelcomeStep editor={editor} exampleBadge={editor.mode === 'wizard' && editor.form.welcome.text.length > 0} />;
        case 'outOfHours': return <OutOfHoursStep editor={editor} />;
        case 'keywords': return <KeywordsStep editor={editor} phone={phone} />;
        case 'fallback': return <FallbackStep editor={editor} exampleBadge={editor.mode === 'wizard' && editor.form.fallback.text.length > 0} />;
        case 'silence': return <SilenceStep editor={editor} />;
        case 'review': return <ReviewStep editor={editor} />;
    }
};

// ---------------------------------------------------------------------------
// Teléfono: una columna; cada paso, en su pantalla
// ---------------------------------------------------------------------------

const PhoneLayout = ({ editor, phoneStep, setPhoneStep, onMasterSwitch, onTest }: {
    editor: AutoReplyEditor;
    phoneStep: StepKey | null;
    setPhoneStep: (step: StepKey | null) => void;
    onMasterSwitch: (enabled: boolean) => void;
    onTest: () => void;
}) => {
    const wizard = editor.mode === 'wizard';
    const open = wizard ? editor.step : phoneStep;
    const index = editor.steps.indexOf(editor.step);
    const nextStep = WIZARD_STEPS[index + 1];

    const openStep = (step: StepKey) => {
        editor.goTo(step);
        setPhoneStep(step);
    };
    // Con errores al guardar, se abre el paso que tiene el primero.
    const save = () => {
        editor.saveAll();
        if (editor.issueTotal > 0) setPhoneStep(EDIT_STEPS.find(step => editor.counts[step] > 0) ?? null);
    };

    return (
        <div className="min-h-full flex flex-col bg-brand-bg">
            <div className="flex-1 px-3.5 py-3.5 grid gap-3 content-start">
                {open === null ? (
                    <>
                        <h1 className="px-0.5 pt-1 text-[22px] font-bold tracking-[-0.02em] text-brand-text">Respuestas automáticas</h1>
                        <div className={`bg-brand-surface border rounded-[14px] px-4 py-3.5 grid gap-2
                            ${editor.form.enabled ? 'border-brand-green-200' : 'border-brand-border'}`}>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <div className="text-[15px] font-bold text-brand-text">{editor.form.enabled ? 'Encendidas' : 'Apagadas'}</div>
                                    <div className="text-[13px] text-brand-gray-600 mt-px">
                                        {editor.form.enabled ? 'En todas tus líneas' : 'No sale ninguna respuesta'}
                                    </div>
                                </div>
                                <Switch size="lg" checked={editor.form.enabled} disabled={editor.isSaving}
                                    label="Respuestas automáticas encendidas" onChange={onMasterSwitch} />
                            </div>
                            <div className="text-xs leading-[1.45] text-brand-muted">Cada respuesta es un mensaje que Meta cobra. Unos 1.000 gratis al mes por número.</div>
                        </div>
                        {editor.saveBlocked && <SaveBlockedNotice editor={editor} />}
                        <div className="bg-brand-surface border border-brand-border rounded-[14px] overflow-hidden divide-y divide-brand-raised">
                            {EDIT_STEPS.map((step, i) => (
                                <button key={step} type="button" onClick={() => openStep(step)}
                                    className="w-full flex items-center gap-3 min-h-[68px] px-4 py-2.5 text-left cursor-pointer active:bg-brand-bg">
                                    <span className="flex-none w-[26px] h-[26px] rounded-full border border-brand-border-strong flex items-center justify-center
                                        font-mono text-xs font-semibold text-brand-gray-600">{i + 1}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span className="text-[15px] font-semibold text-brand-text">{STEP_TITLES[step]}</span>
                                            <StepStatus editor={editor} step={step} />
                                        </span>
                                        <span className="block text-[12.5px] text-brand-muted mt-0.5 truncate">{stepSummary(editor, step)}</span>
                                    </span>
                                    <ChevronRight size={16} className="flex-none text-brand-subtle" />
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            {wizard ? (
                                <button type="button" onClick={editor.finishLater} aria-label="Terminar luego" title="Terminar luego"
                                    className="-ml-2 w-11 h-11 flex items-center justify-center text-brand-strong cursor-pointer"><X size={20} /></button>
                            ) : (
                                <button type="button" onClick={() => setPhoneStep(null)} aria-label="Volver a los pasos"
                                    className="-ml-2 w-11 h-11 flex items-center justify-center text-brand-strong cursor-pointer"><ArrowLeft size={20} /></button>
                            )}
                            <span className="flex-1 text-[15px] font-semibold text-brand-text">{wizard ? 'Configurar respuestas' : 'Respuestas automáticas'}</span>
                            <span className="font-mono tabular-nums text-xs text-brand-muted">{editor.steps.indexOf(open) + 1} de {editor.steps.length}</span>
                        </div>
                        <div className="flex gap-1">
                            {editor.steps.map((step, i) => (
                                <span key={step} className={`flex-1 h-1 rounded-sm ${i <= editor.steps.indexOf(open) ? 'bg-brand-accent-strong' : 'bg-brand-border-strong'}`} />
                            ))}
                        </div>
                        <div className="flex items-start gap-3 mt-1">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">{STEP_TITLES[open]}</h1>
                                <p className="mt-0.5 text-sm leading-[1.5] text-brand-gray-600">{STEP_DESCRIPTIONS[open]}</p>
                            </div>
                            <div className="pt-1.5"><SectionToggle editor={editor} /></div>
                        </div>
                        <div className="@container bg-brand-surface border border-brand-border rounded-[14px] p-3.5">
                            <StepContent editor={editor} phone />
                        </div>
                    </>
                )}
            </div>

            <div className="sticky bottom-0 flex-none flex gap-2 px-3.5 pt-2.5 pb-[calc(14px+var(--safe-bottom))] bg-brand-surface border-t border-brand-border">
                {wizard ? (
                    <>
                        {index > 0 && <div className="flex-1 h-12"><CustomButton variant="outline" onClick={editor.previous}>Anterior</CustomButton></div>}
                        {nextStep && (
                            <div className="flex-[2] h-12"><CustomButton onClick={editor.next}>Siguiente: {STEP_TITLES[nextStep].toLowerCase()}</CustomButton></div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex-1 h-12"><CustomButton variant="outline" onClick={onTest}><Send size={16} /> Probar</CustomButton></div>
                        <div className="flex-1 h-12"><CustomButton onClick={save} isLoading={editor.isSaving} disabled={!editor.dirty}>Guardar</CustomButton></div>
                    </>
                )}
            </div>
        </div>
    );
};

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
    <div className="h-full flex flex-col gap-4 px-5 lg:px-7 pt-[22px] pb-6" aria-busy="true">
        <PageTitle subtitle="Wasmish contesta solo con lo que dejes escrito. Vale para todas tus líneas." />
        <div className="hidden md:grid grid-cols-4 gap-2.5">
            {EDIT_STEPS.map(step => <SkeletonBox key={step} className="h-[62px] rounded-[10px]" />)}
        </div>
        <div className="grid gap-3 md:hidden">
            <SkeletonBox className="h-[92px] rounded-[14px]" />
            <SkeletonBox className="h-[272px] rounded-[14px]" />
        </div>
        <div className="hidden md:grid flex-1 min-h-[360px] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <SkeletonBox className="h-full rounded-xl" tone="soft" />
            <SkeletonBox className="hidden lg:block h-full rounded-xl" tone="soft" />
        </div>
    </div>
);
