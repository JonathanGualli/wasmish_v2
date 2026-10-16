import { useMemo, useState } from "react";
import { useSaveAutoReplies } from "../../../hooks/useAutoReplies";
import type { AutoRepliesResponse, DaySchedule, WeekDay } from "../../../models/autoReply.model";
import {
    EDIT_STEPS, WIZARD_STEPS, draftOf, formIssues, isDirty, issueCounts, newRule, toForm, toPayload, totalIssues, wizardStart,
    type AutoReplyForm, type EditableRule, type StepKey,
} from "../../../utils/autoReplyForm";

export type EditorMode = 'intro' | 'wizard' | 'tabs';

/**
 * Lo que se edita en «Respuestas automáticas» y cómo se guarda. Todo se guarda
 * junto (`PUT`), y nada sale hasta guardar con el interruptor general encendido.
 *
 * - `intro`: la cuenta nunca guardó; la invitación a empezar.
 * - `wizard`: el asistente, paso a paso, hasta «Revisar y encender». «Terminar
 *   luego» guarda lo hecho apagado y la próxima vez abre en pestañas.
 * - `tabs`: los mismos pasos como pestañas.
 */
/**
 * Lo guardado, con las claves de pantalla de lo enviado (misma posición): así
 * la regla que estaba abierta sigue abierta aunque estrene id. Mientras se
 * guarda no se puede editar (`isSaving`), así que no hay nada más que conservar.
 */
const savedForm = (sent: AutoReplyForm, response: AutoRepliesResponse): AutoReplyForm => {
    const fresh = toForm(response);
    return { ...fresh, keywordRules: fresh.keywordRules.map((rule, index) => ({ ...rule, key: sent.keywordRules[index]?.key ?? rule.key })) };
};

/** `switch`: el interruptor general, que se guarda solo; `all`: «Guardar» y el asistente. */
export type SaveKind = 'all' | 'switch';

export const useAutoReplyEditor = (
    data: AutoRepliesResponse,
    onSaved: (saved: AutoRepliesResponse, kind: SaveKind) => void,
    onSaveError: (error: unknown) => void,
) => {
    const saved = useMemo(() => toForm(data), [data]);
    const [baseline, setBaseline] = useState(saved);
    const [form, setForm] = useState(saved);
    const [mode, setMode] = useState<EditorMode>(data.configured ? 'tabs' : 'intro');
    const [step, setStep] = useState<StepKey>('welcome');
    // En el asistente, hasta qué paso se llegó: se puede volver a cualquiera de esos.
    const [reached, setReached] = useState(0);
    const [showIssues, setShowIssues] = useState(false);
    const [saveBlocked, setSaveBlocked] = useState(false);
    const mutation = useSaveAutoReplies();

    // Si lo guardado cambia (otra pestaña, una recarga) y aquí no se tocó nada, se ve lo nuevo.
    if (baseline !== saved) {
        setBaseline(saved);
        if (!isDirty(form, baseline)) setForm(saved);
    }

    const dirty = mode !== 'intro' && (mode === 'wizard' || isDirty(form, saved));
    const issues = useMemo(() => formIssues(form), [form]);
    const counts = useMemo(() => issueCounts(issues), [issues]);
    const issueTotal = totalIssues(counts);
    const steps = mode === 'wizard' ? WIZARD_STEPS : EDIT_STEPS;

    const update = (change: (form: AutoReplyForm) => AutoReplyForm) => setForm(current => change(current));

    const goTo = (next: StepKey) => {
        setStep(next);
        if (mode === 'wizard') setReached(index => Math.max(index, WIZARD_STEPS.indexOf(next)));
    };

    /** Guarda `next`; con errores no guarda y abre el primer paso que tiene uno. */
    const save = (next: AutoReplyForm, afterSave?: (saved: AutoRepliesResponse) => void) => {
        const nextCounts = issueCounts(formIssues(next));
        if (totalIssues(nextCounts) > 0) {
            setShowIssues(true);
            setSaveBlocked(true);
            setStep(EDIT_STEPS.find(key => nextCounts[key] > 0) ?? 'welcome');
            return;
        }
        mutation.mutate(toPayload(next), {
            onSuccess: (response) => {
                setForm(savedForm(next, response));
                setShowIssues(false);
                setSaveBlocked(false);
                afterSave?.(response);
                onSaved(response, 'all');
            },
            onError: onSaveError,
        });
    };

    const toTabs = () => {
        setMode('tabs');
        setStep('welcome');
    };

    return {
        form, mode, step, steps, reached, dirty, issues, counts, issueTotal, isSaving: mutation.isPending,
        showIssues,
        /** El aviso de arriba: se intentó guardar con errores y aún quedan. */
        saveBlocked: saveBlocked && issueTotal > 0,
        goTo,

        startWizard: (options: { example: boolean; businessName?: string }) => {
            setForm(current => wizardStart(current, options));
            setMode('wizard');
            setStep('welcome');
            setReached(0);
            setShowIssues(false);
        },
        /** «Siguiente»: con errores en este paso, los marca y no avanza. */
        next: () => {
            if (counts[step] > 0) {
                setShowIssues(true);
                return;
            }
            const index = WIZARD_STEPS.indexOf(step);
            goTo(WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]);
        },
        previous: () => setStep(WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(step) - 1, 0)]),
        /** «Terminar luego»: lo hecho, guardado y apagado. */
        finishLater: () => save(draftOf(form), toTabs),
        /** El último paso del asistente. */
        turnOnAndSave: () => save({ ...form, enabled: true }, toTabs),
        saveAll: () => save(form),
        discard: () => {
            setForm(saved);
            setShowIssues(false);
            setSaveBlocked(false);
        },
        /** Salir del asistente sin guardar: vuelve la invitación. */
        leaveWizard: () => {
            setForm(saved);
            setMode(data.configured ? 'tabs' : 'intro');
            setShowIssues(false);
            setSaveBlocked(false);
        },

        /**
         * El interruptor general, con un toque: guarda solo eso (sobre lo ya
         * guardado) y deja como estaban los demás cambios sin guardar.
         */
        setEnabledNow: (enabled: boolean) => mutation.mutate(toPayload({ ...saved, enabled }), {
            onSuccess: (response) => {
                setForm(current => ({ ...current, enabled: response.enabled }));
                onSaved(response, 'switch');
            },
            onError: onSaveError,
        }),
        setHandoffHours: (handoffHours: AutoReplyForm['handoffHours']) => update(f => ({ ...f, handoffHours })),
        setTimezone: (timezone: string) => update(f => ({ ...f, timezone })),
        setWelcome: (change: Partial<AutoReplyForm['welcome']>) => update(f => ({ ...f, welcome: { ...f.welcome, ...change } })),
        setOutOfHours: (change: Partial<Omit<AutoReplyForm['outOfHours'], 'schedule'>>) =>
            update(f => ({ ...f, outOfHours: { ...f.outOfHours, ...change } })),
        setDay: (day: WeekDay, schedule: DaySchedule) =>
            update(f => ({ ...f, outOfHours: { ...f.outOfHours, schedule: { ...f.outOfHours.schedule, [day]: schedule } } })),
        /** «Copiar el lunes a todos»: los días abiertos quedan con los tramos del lunes. */
        copyMondayToAll: () => update(f => {
            const monday = f.outOfHours.schedule.mon;
            const schedule = Object.fromEntries(Object.entries(f.outOfHours.schedule).map(([day, entry]) => [
                day,
                day === 'mon' || entry.closed ? entry : { closed: false, ranges: monday.ranges.map(r => ({ ...r })) },
            ])) as AutoReplyForm['outOfHours']['schedule'];
            return { ...f, outOfHours: { ...f.outOfHours, schedule } };
        }),

        addRule: () => {
            const rule = newRule();
            update(f => ({ ...f, keywordRules: [...f.keywordRules, rule] }));
            return rule;
        },
        setRule: (key: string, change: Partial<EditableRule>) =>
            update(f => ({ ...f, keywordRules: f.keywordRules.map(rule => (rule.key === key ? { ...rule, ...change } : rule)) })),
        removeRule: (key: string) => update(f => ({ ...f, keywordRules: f.keywordRules.filter(rule => rule.key !== key) })),
        /** Sube (-1) o baja (+1) una regla: si coinciden más de 3, salen las primeras. */
        moveRule: (key: string, delta: -1 | 1) => update(f => {
            const rules = [...f.keywordRules];
            const from = rules.findIndex(rule => rule.key === key);
            const to = from + delta;
            if (from < 0 || to < 0 || to >= rules.length) return f;
            [rules[from], rules[to]] = [rules[to], rules[from]];
            return { ...f, keywordRules: rules };
        }),
    };
};

export type AutoReplyEditor = ReturnType<typeof useAutoReplyEditor>;
