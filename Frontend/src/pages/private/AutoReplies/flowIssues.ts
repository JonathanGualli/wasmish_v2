import { optionsIssueCount } from "../../../utils/autoReplyForm";
import { formatTag, ruleKeyOf, unreachableReason, type FlowNode, type NodeKey } from "../../../utils/autoReplyFlow";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

/** Cuántos errores tiene una tarjeta del lienzo: su texto y sus opciones. */
export const nodeIssueCount = (editor: AutoReplyEditor, node: NodeKey) => {
    const { issues } = editor;
    if (node === 'welcome') return Number(Boolean(issues.welcomeText)) + optionsIssueCount(issues.options.welcome);
    if (node === 'fallback') return Number(Boolean(issues.fallbackText)) + optionsIssueCount(issues.options.fallback);
    if (node === 'handoff') return Number(Boolean(issues.handoffText));
    const key = ruleKeyOf(node) ?? '';
    return Number(Boolean(issues.rules[key]?.text)) + optionsIssueCount(issues.options[key]);
};

export type NodeTagTone = 'muted' | 'danger' | 'warning' | 'handoff';

/**
 * La etiqueta de una respuesta, en su tarjeta del lienzo y en la lista del
 * teléfono: sus errores (tras intentar guardar), «Toda la cuenta», «No se
 * llega», «Apagada» o cómo salen sus opciones («3 botones», «Lista · 5»).
 */
export const nodeTag = (editor: AutoReplyEditor, node: FlowNode): { tag: string; tone: NodeTagTone } => {
    const issues = editor.showIssues ? nodeIssueCount(editor, node.key) : 0;
    if (issues > 0) return { tag: issues === 1 ? '1 error' : `${issues} errores`, tone: 'danger' };
    if (node.kind === 'handoff') return { tag: 'Toda la cuenta', tone: 'handoff' };
    if (node.rule && unreachableReason(editor.form, node.rule)) return { tag: 'No se llega', tone: 'warning' };
    if (!node.enabled) return { tag: 'Apagada', tone: 'muted' };
    return { tag: formatTag(node.options.length), tone: 'muted' };
};
