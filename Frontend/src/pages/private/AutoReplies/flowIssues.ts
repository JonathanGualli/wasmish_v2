import { optionsIssueCount } from "../../../utils/autoReplyForm";
import { ruleKeyOf, type NodeKey } from "../../../utils/autoReplyFlow";
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
