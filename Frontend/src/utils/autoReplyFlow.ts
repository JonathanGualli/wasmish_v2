import { BUTTONS_MAX, type CardPosition, type MenuOption } from "../models/autoReply.model";
import type { AutoReplyForm, EditableRule } from "./autoReplyForm";

/*
 * El lienzo de «Respuestas automáticas» (bot con menús; diseño «Respuestas
 * automáticas v4 - Lienzo», 4a): qué tarjetas hay, en qué columna va cada una,
 * qué opciones llevan línea, dónde se coloca sola una tarjeta y los avisos que
 * no impiden guardar. Sin React.
 */

/** Una tarjeta: la bienvenida, el «si no entiende», una respuesta (`rule:<key>`) o «Una persona». */
export type NodeKey = 'welcome' | 'fallback' | 'handoff' | `rule:${string}`;

export const ruleNode = (rule: { key: string }): NodeKey => `rule:${rule.key}`;
export const ruleKeyOf = (node: NodeKey) => (node.startsWith('rule:') ? node.slice(5) : null);

export interface FlowNode {
    key: NodeKey;
    kind: 'welcome' | 'fallback' | 'rule' | 'handoff';
    name: string;
    text: string;
    enabled: boolean;
    /** «Una persona» no tiene opciones. */
    options: MenuOption[];
    position: CardPosition | null;
    rule?: EditableRule;
}

/** El nombre de una respuesta en pantalla: el suyo, o «Respuesta N» si no tiene. */
export const ruleName = (form: AutoReplyForm, rule: EditableRule) =>
    rule.name.trim() || `Respuesta ${form.keywordRules.indexOf(rule) + 1}`;

/** La tarjeta «Una persona» sale solo si alguna opción lleva ahí. */
export const flowNodes = (form: AutoReplyForm): FlowNode[] => {
    const nodes: FlowNode[] = [
        { key: 'welcome', kind: 'welcome', name: 'Bienvenida', text: form.welcome.text, enabled: form.welcome.enabled, options: form.welcome.options, position: form.welcome.position },
        { key: 'fallback', kind: 'fallback', name: 'Si no entiende', text: form.fallback.text, enabled: form.fallback.enabled, options: form.fallback.options, position: form.fallback.position },
        ...form.keywordRules.map((rule): FlowNode => ({
            key: ruleNode(rule), kind: 'rule', name: ruleName(form, rule), text: rule.text, enabled: rule.enabled,
            options: rule.options, position: rule.position, rule,
        })),
    ];
    if (incomingTo(form, 'handoff').length > 0 || form.handoff.position) {
        nodes.push({ key: 'handoff', kind: 'handoff', name: 'Una persona', text: form.handoff.text, enabled: true, options: [], position: form.handoff.position });
    }
    return nodes;
};

/** Adónde lleva una opción, como tarjeta (`null`: «volver al inicio», que no tiene tarjeta propia). */
export const optionNode = (form: AutoReplyForm, option: MenuOption): NodeKey | null => {
    if (option.target === 'person') return 'handoff';
    if (option.target === 'start') return null;
    const rule = form.keywordRules.find(candidate => candidate.id === option.ruleId);
    return rule ? ruleNode(rule) : null;
};

/** Las opciones que llevan a una tarjeta: desde qué tarjeta y en qué posición. */
export const incomingTo = (form: AutoReplyForm, target: NodeKey) => {
    const found: { from: NodeKey; index: number; option: MenuOption }[] = [];
    const scan = (from: NodeKey, options: MenuOption[]) => options.forEach((option, index) => {
        if (optionNode(form, option) === target) found.push({ from, index, option });
    });
    scan('welcome', form.welcome.options);
    scan('fallback', form.fallback.options);
    form.keywordRules.forEach(rule => scan(ruleNode(rule), rule.options));
    return found;
};

/**
 * La columna de cada tarjeta: la bienvenida y el «si no entiende» en la 0, y
 * cada respuesta una más que la primera tarjeta desde la que se llega (por
 * anchura, siguiendo las opciones). Una respuesta a la que no lleva ninguna
 * opción va en la 1 si tiene frases, o en la 0, debajo, si no se llega. «Una
 * persona», en la 1.
 */
export const flowColumns = (form: AutoReplyForm): Map<NodeKey, number> => {
    const columns = new Map<NodeKey, number>([['welcome', 0], ['fallback', 0]]);
    const queue: NodeKey[] = ['welcome', 'fallback'];
    const optionsOf = (key: NodeKey) => {
        if (key === 'welcome') return form.welcome.options;
        if (key === 'fallback') return form.fallback.options;
        return form.keywordRules.find(rule => ruleNode(rule) === key)?.options ?? [];
    };
    for (let i = 0; i < queue.length; i++) {
        const from = queue[i];
        for (const option of optionsOf(from)) {
            const to = optionNode(form, option);
            if (!to || to === 'handoff' || columns.has(to)) continue;
            columns.set(to, (columns.get(from) ?? 0) + 1);
            queue.push(to);
        }
    }
    // Las que no se alcanzan desde el inicio: sus frases las llevan a la 1, y
    // desde ellas se sigue igual.
    for (const rule of form.keywordRules) {
        const key = ruleNode(rule);
        if (columns.has(key)) continue;
        columns.set(key, rule.keywords.length > 0 ? 1 : 0);
        const more: NodeKey[] = [key];
        for (let i = 0; i < more.length; i++) {
            for (const option of optionsOf(more[i])) {
                const to = optionNode(form, option);
                if (!to || to === 'handoff' || columns.has(to)) continue;
                columns.set(to, (columns.get(more[i]) ?? 0) + 1);
                more.push(to);
            }
        }
    }
    columns.set('handoff', 1);
    return columns;
};

/**
 * Si una opción se dibuja con línea: lleva a una respuesta de una columna
 * mayor. Las que vuelven («Volver», «Inicio») o piden una persona van como
 * etiqueta en el propio botón, para que el dibujo no se enrede (diseño, 4a).
 */
export const isForward = (columns: Map<NodeKey, number>, from: NodeKey, to: NodeKey | null) =>
    to !== null && to !== 'handoff' && (columns.get(to) ?? 0) > (columns.get(from) ?? 0);

// Las medidas de la tarjeta, del diseño.
export const CARD_WIDTH = 260;
export const CARD_HEADER = 44;
export const CARD_TEXT = 66;
const OPTION_ROW = 34;
const COLUMN_STEP = 330;
const LEFT = 36;
const TOP = 68;
const GAP = 22;

/** Si la tarjeta lleva una nota al pie («Una persona» y las que no se alcanzan). */
export const cardHeight = (node: FlowNode, withFoot: boolean) => {
    const k = node.options.length;
    return CARD_HEADER + CARD_TEXT + (k ? 6 + k * OPTION_ROW + 8 : 0) + (withFoot ? 38 : 0);
};

/** Dónde sale el puerto de la opción `index` y dónde entra la línea a una tarjeta. */
export const optionPort = (position: CardPosition, index: number) => ({
    x: position.x + CARD_WIDTH + 5, y: position.y + CARD_HEADER + CARD_TEXT + 6 + index * OPTION_ROW + 15,
});
export const inPort = (position: CardPosition) => ({ x: position.x - 4, y: position.y + 22 });

/**
 * Dónde va cada tarjeta: la guardada, si la tiene; si no, en su columna, en el
 * primer hueco desde arriba donde no tape nada (guardado o colocado antes).
 */
export const flowLayout = (nodes: FlowNode[], columns: Map<NodeKey, number>, heights: Map<NodeKey, number>) => {
    const placed = new Map<NodeKey, CardPosition>();
    for (const node of nodes) if (node.position) placed.set(node.key, node.position);
    for (const node of nodes) {
        if (placed.has(node.key)) continue;
        const x = LEFT + COLUMN_STEP * (columns.get(node.key) ?? 0);
        const height = heights.get(node.key) ?? 0;
        let y = TOP;
        // Si tapa algo, baja justo debajo de eso y vuelve a mirar.
        for (let blocker = overlapping(placed, heights, x, y, height); blocker; blocker = overlapping(placed, heights, x, y, height)) {
            y = blocker.y + blocker.height + GAP;
        }
        placed.set(node.key, { x, y });
    }
    return placed;
};

/** La primera tarjeta colocada que choca con el hueco `x, y` (con su margen), o `null`. */
const overlapping = (placed: Map<NodeKey, CardPosition>, heights: Map<NodeKey, number>, x: number, y: number, height: number) => {
    for (const [key, position] of placed) {
        const other = heights.get(key) ?? 0;
        const crossesX = position.x < x + CARD_WIDTH + GAP && position.x + CARD_WIDTH + GAP > x;
        const crossesY = position.y < y + height + GAP && position.y + other + GAP > y;
        if (crossesX && crossesY) return { y: position.y, height: other };
    }
    return null;
};

/** «2 botones», «Lista · 5»; nada sin opciones. */
export const formatTag = (count: number) => {
    if (count === 0) return '';
    if (count <= BUTTONS_MAX) return `${count} ${count === 1 ? 'botón' : 'botones'}`;
    return `Lista · ${count}`;
};

/**
 * Una respuesta a la que no se llega (aviso, no error): sin frases y sin
 * ninguna opción que lleve a ella, o apagada con opciones que llevan a ella.
 * Devuelve por qué, o `null`.
 */
export const unreachableReason = (form: AutoReplyForm, rule: EditableRule) => {
    const incoming = incomingTo(form, ruleNode(rule)).length;
    if (rule.keywords.length === 0 && incoming === 0) return 'Sin frases y sin botones que lleven a ella.';
    if (!rule.enabled && incoming > 0) return `Está apagada y ${incoming === 1 ? 'un botón lleva' : `${incoming} botones llevan`} a ella.`;
    return null;
};

/** Lo que conviene revisar pero no impide guardar (diseño, 4a y 4e). */
export const flowWarnings = (form: AutoReplyForm) => {
    const warnings: { title: string; detail: string }[] = [];
    const starts = [form.welcome.options, form.fallback.options, ...form.keywordRules.map(rule => rule.options)]
        .reduce((n, options) => n + options.filter(option => option.target === 'start').length, 0);
    if (starts > 0 && !(form.welcome.enabled && form.welcome.text.trim())) {
        warnings.push({
            title: 'La bienvenida está apagada.',
            detail: `${starts === 1 ? 'El botón «Volver al inicio» se tratará' : `Los ${starts} botones «Volver al inicio» se tratarán`} como texto escrito.`,
        });
    }
    const unreachable = form.keywordRules.filter(rule => unreachableReason(form, rule));
    if (unreachable.length > 0) {
        warnings.push({
            title: unreachable.length === 1 ? '1 respuesta no se alcanza.' : `${unreachable.length} respuestas no se alcanzan.`,
            detail: unreachable.length === 1
                ? `«${ruleName(form, unreachable[0])}»: ${unreachableReason(form, unreachable[0])?.toLowerCase()} Se puede guardar igual.`
                : `${unreachable.map(rule => `«${ruleName(form, rule)}»`).join(', ')}. Se puede guardar igual.`,
        });
    }
    return warnings;
};
