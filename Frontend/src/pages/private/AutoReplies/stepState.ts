import { fallbackSummary, keywordsSummary, scheduleSummary, silenceSummary, welcomeSummary, type StepKey } from "../../../utils/autoReplyForm";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

/** Si el paso está encendido (`null` en los que no se encienden). */
export const stepIsOn = (editor: AutoReplyEditor, step: StepKey): boolean | null => {
    const { form } = editor;
    if (step === 'welcome') return form.welcome.enabled;
    if (step === 'outOfHours') return form.outOfHours.enabled;
    if (step === 'keywords') return form.keywordRules.some(rule => rule.enabled);
    if (step === 'fallback') return form.fallback.enabled;
    return null;
};

export const stepSummary = (editor: AutoReplyEditor, step: StepKey) => {
    const { form } = editor;
    switch (step) {
        case 'welcome': return welcomeSummary(form.welcome.returnAfterDays);
        case 'outOfHours': return scheduleSummary(form.outOfHours.schedule);
        case 'keywords': return keywordsSummary(form.keywordRules);
        case 'fallback': return fallbackSummary(form.handoffHours);
        case 'silence': return silenceSummary(form.handoffHours);
        case 'review': return 'Último paso';
    }
};
