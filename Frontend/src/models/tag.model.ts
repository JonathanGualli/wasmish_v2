/** Una etiqueta de la cuenta: un grupo de contactos que pone quien usa Wasmish. */
export interface Tag {
    id: string;
    name: string;
    contactCount: number;
}

/** Cuántos de una selección tienen cada etiqueta. Las que no tiene nadie no salen. */
export interface TagSelectionSummary {
    total: number;
    tags: { id: string; count: number }[];
}

/** Lo que devuelve etiquetar en bloque. */
export interface BulkTagResult {
    matched: number;
    modified: number;
    /** Los que se pasarían de 20 etiquetas: a esos no se les tocó. */
    overLimit: number;
}
