import type { Line } from '../models/line.model';

export const LINE_NAME_MAX = 40;

// Las clases de los tokens `--color-line-*` (App.css), escritas enteras para
// que Tailwind las genere.
const LINE_COLOR_CLASSES = [
    'bg-line-1', 'bg-line-2', 'bg-line-3', 'bg-line-4', 'bg-line-5',
    'bg-line-6', 'bg-line-7', 'bg-line-8', 'bg-line-9', 'bg-line-10',
] as const;

/** Cómo se llama una línea en toda la app: nombre interno → nombre en WhatsApp → número → ID de teléfono. */
export const lineLabel = (line: Line) =>
    line.name ?? line.verifiedName ?? line.displayPhoneNumber ?? line.phoneNumberId;

/** El número que se enseña de una línea: el visible o, en una antigua, su ID de teléfono. */
export const lineNumber = (line: Line) => line.displayPhoneNumber ?? line.phoneNumberId;

/**
 * La etiqueta donde hay poco sitio (la bandeja, la lista de campañas): una
 * línea que se llama por su número se acorta a sus 4 últimas cifras, «···1122».
 */
export const shortLineLabel = (line: Line) =>
    (line.name ?? line.verifiedName ? lineLabel(line) : `···${lineNumber(line).replace(/\D/g, '').slice(-4)}`);

/**
 * El color de cada línea, por orden de conexión (la primera, verde): lo asigna
 * Wasmish y no cambia al renombrar ni al desconectar otra. Si hay más líneas
 * que colores, se repiten.
 */
export const lineColorClasses = (lines: Line[]) => new Map(
    [...lines]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((line, index) => [line.id, LINE_COLOR_CLASSES[index % LINE_COLOR_CLASSES.length]]),
);

/** Un ID de WhatsApp Business sin enseñarlo entero: «···4733». */
export const maskWabaId = (waBusinessId: string | null) => (waBusinessId ? `···${waBusinessId.slice(-4)}` : '—');

export const formatLineDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
