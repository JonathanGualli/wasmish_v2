import { useMemo, useState } from "react";
import { useSaveAutoReplies } from "../../../hooks/useAutoReplies";
import type { AutoRepliesResponse, CardPosition, DaySchedule, KeywordRule, MenuOption, WeekDay } from "../../../models/autoReply.model";
import {
    WIZARD_STEPS, draftOf, exampleMenu, formIssues, isDirty, issueCounts, newRule, toForm, toPayload, totalIssues,
    withExampleHours, withGreeting, wizardStart, type AutoReplyForm, type EditableRule, type WizardStep,
} from "../../../utils/autoReplyForm";
import type { NodeKey } from "../../../utils/autoReplyFlow";

/** Dónde viven las opciones: la bienvenida, el «si no entiende» o una respuesta (su `key`). */
export type OptionsOwner = 'welcome' | 'fallback' | string;

const withOptions = (form: AutoReplyForm, owner: OptionsOwner, change: (options: MenuOption[]) => MenuOption[]): AutoReplyForm => {
    if (owner === 'welcome') return { ...form, welcome: { ...form.welcome, options: change(form.welcome.options) } };
    if (owner === 'fallback') return { ...form, fallback: { ...form.fallback, options: change(form.fallback.options) } };
    return { ...form, keywordRules: form.keywordRules.map(rule => (rule.key === owner ? { ...rule, options: change(rule.options) } : rule)) };
};

/** Sin las opciones que llevaban a la respuesta `ruleId` (al borrarla). */
const withoutOptionsTo = (form: AutoReplyForm, ruleId: string): AutoReplyForm => {
    const keep = (options: MenuOption[]) => options.filter(option => !(option.target === 'rule' && option.ruleId === ruleId));
    return {
        ...form,
        welcome: { ...form.welcome, options: keep(form.welcome.options) },
        fallback: { ...form.fallback, options: keep(form.fallback.options) },
        keywordRules: form.keywordRules.map(rule => ({ ...rule, options: keep(rule.options) })),
    };
};

export type EditorMode = 'wizard' | 'tabs';

/**
 * Lo que se edita en «Respuestas automáticas» y cómo se guarda. Todo se guarda
 * junto (`PUT`), y nada sale hasta guardar con el interruptor general encendido.
 *
 * - `wizard`: la cuenta nunca guardó. El asistente (diseño 4f), en cuatro
 *   pasos hasta «Encender». «Terminar luego» guarda lo hecho apagado y la
 *   próxima vez abre la página normal.
 * - `tabs`: la página normal (el lienzo, o los pasos en pantallas estrechas).
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
    // El menú de ejemplo y donde empieza el asistente, una sola vez: elegir con
    // o sin menú no cambia los ids, y salir sin haber tocado nada no pregunta.
    const [menu] = useState(exampleMenu);
    const [wizardBase] = useState(() => (data.configured ? null : wizardStart(saved, menu)));
    const [form, setForm] = useState(() => wizardBase ?? saved);
    const [mode, setMode] = useState<EditorMode>(wizardBase ? 'wizard' : 'tabs');
    const [wizardStep, setWizardStep] = useState<WizardStep>('greeting');
    const [withMenu, setWithMenu] = useState(true);
    const [showIssues, setShowIssues] = useState(false);
    const [saveBlocked, setSaveBlocked] = useState(false);
    const mutation = useSaveAutoReplies();

    // Si lo guardado cambia (otra pestaña, una recarga) y aquí no se tocó nada, se ve lo nuevo.
    if (baseline !== saved) {
        setBaseline(saved);
        if (!isDirty(form, baseline)) setForm(saved);
    }

    const dirty = isDirty(form, mode === 'wizard' && wizardBase ? wizardBase : saved);
    const issues = useMemo(() => formIssues(form), [form]);
    const counts = useMemo(() => issueCounts(issues), [issues]);
    const issueTotal = totalIssues(counts);

    // En el asistente, «Horarios» sigue al horario del paso 2.
    const update = (change: (form: AutoReplyForm) => AutoReplyForm) =>
        setForm(current => (mode === 'wizard' ? withExampleHours(change(current), menu) : change(current)));

    /** Guarda `next`; con errores no guarda y abre el primer paso que tiene uno. */
    const save = (next: AutoReplyForm, afterSave?: (saved: AutoRepliesResponse) => void) => {
        const nextCounts = issueCounts(formIssues(next));
        if (totalIssues(nextCounts) > 0) {
            setShowIssues(true);
            setSaveBlocked(true);
            // En el asistente, lo único que puede quedar mal es el horario.
            if (mode === 'wizard' && nextCounts.outOfHours > 0) setWizardStep('outOfHours');
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

    const toTabs = () => setMode('tabs');

    return {
        form, mode, dirty, issues, counts, issueTotal, isSaving: mutation.isPending,
        showIssues,
        /** El aviso de arriba: se intentó guardar con errores y aún quedan. */
        saveBlocked: saveBlocked && issueTotal > 0,

        // El asistente de la primera vez.
        wizardStep, withMenu,
        /** Paso 1: con el menú de ejemplo o solo el saludo; se ve al momento en «Probar». */
        chooseGreeting: (next: boolean) => {
            setWithMenu(next);
            update(f => withGreeting(f, menu, next));
        },
        /** «Siguiente»: con errores en el horario, los marca y no avanza. */
        next: () => {
            if (wizardStep === 'outOfHours' && counts.outOfHours > 0) {
                setShowIssues(true);
                return;
            }
            setWizardStep(WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(wizardStep) + 1, WIZARD_STEPS.length - 1)]);
        },
        previous: () => setWizardStep(WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(wizardStep) - 1, 0)]),
        goToWizardStep: setWizardStep,
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
        setFallback: (change: Partial<AutoReplyForm['fallback']>) => update(f => ({ ...f, fallback: { ...f.fallback, ...change } })),
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

        addRule: (change: Partial<KeywordRule> = {}) => {
            const rule = newRule(change);
            update(f => ({ ...f, keywordRules: [...f.keywordRules, rule] }));
            return rule;
        },
        setRule: (key: string, change: Partial<EditableRule>) =>
            update(f => ({ ...f, keywordRules: f.keywordRules.map(rule => (rule.key === key ? { ...rule, ...change } : rule)) })),
        /** Borra la respuesta y los botones que llevaban a ella: no pueden llevar a una que no existe. */
        removeRule: (key: string) => update(f => {
            const rule = f.keywordRules.find(candidate => candidate.key === key);
            const rest = { ...f, keywordRules: f.keywordRules.filter(candidate => candidate.key !== key) };
            return rule ? withoutOptionsTo(rest, rule.id) : rest;
        }),

        // Bot con menús: las opciones de cada respuesta, «Una persona» y el lienzo.
        setOptions: (owner: OptionsOwner, options: MenuOption[]) => update(f => withOptions(f, owner, () => options)),
        /**
         * «+ Nueva respuesta» desde el destino de una opción: la crea con ese
         * nombre (su id lo pone la página) y la opción ya lleva a ella.
         */
        createRuleFor: (owner: OptionsOwner, index: number, name: string) => {
            const rule = newRule({ name: name.trim() });
            update(f => withOptions({ ...f, keywordRules: [...f.keywordRules, rule] }, owner,
                options => options.map((option, i) => (i === index ? { ...option, target: 'rule', ruleId: rule.id } : option))));
            return rule;
        },
        setHandoffText: (text: string) => update(f => ({ ...f, handoff: { ...f.handoff, text } })),
        /**
         * Dónde quedaron las tarjetas al soltar una en el lienzo: se guarda con
         * lo demás. Llegan todas (también las que se colocaban solas), así
         * mover una no recoloca las otras.
         */
        setPositions: (positions: Map<NodeKey, CardPosition>) => update(f => {
            const at = (node: NodeKey, current: CardPosition | null) => {
                const position = positions.get(node);
                return position ? { x: Math.max(0, Math.round(position.x)), y: Math.max(0, Math.round(position.y)) } : current;
            };
            return {
                ...f,
                welcome: { ...f.welcome, position: at('welcome', f.welcome.position) },
                fallback: { ...f.fallback, position: at('fallback', f.fallback.position) },
                handoff: { ...f.handoff, position: at('handoff', f.handoff.position) },
                keywordRules: f.keywordRules.map(rule => ({ ...rule, position: at(`rule:${rule.key}`, rule.position) })),
            };
        }),
        /** Cambia de sitio dos reglas (la prioridad del lienzo: entre las que tienen frases). */
        swapRules: (a: string, b: string) => update(f => {
            const rules = [...f.keywordRules];
            const from = rules.findIndex(rule => rule.key === a);
            const to = rules.findIndex(rule => rule.key === b);
            if (from < 0 || to < 0) return f;
            [rules[from], rules[to]] = [rules[to], rules[from]];
            return { ...f, keywordRules: rules };
        }),
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
