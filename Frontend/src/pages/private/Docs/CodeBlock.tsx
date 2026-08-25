import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
    code: string;
    /** Etiqueta del lenguaje mostrada arriba a la izquierda (ej. "bash", "json"). */
    lang?: string;
}

/**
 * Bloque de código. Se queda en claro a propósito: el contenido siempre es
 * blanco (principio 01 del manual). El chrome va en gris frío 100 y el cuerpo
 * en gris frío 50, respetando la jerarquía de superficies.
 */
export const CodeBlock = ({ code, lang }: Props) => {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard no disponible */
        }
    };

    return (
        <div className="rounded-xl border border-brand-border bg-brand-bg overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2
                border-b border-brand-border bg-brand-raised">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-brand-muted">
                    {lang ?? 'code'}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className={`inline-flex items-center gap-1.5 text-[12px] font-semibold
                        rounded px-2 py-1 -mr-1 transition-colors cursor-pointer
                        ${copied
                            ? 'text-brand-success'
                            : 'text-brand-gray-600 hover:text-brand-text hover:bg-brand-border'}`}
                    title="Copiar al portapapeles"
                >
                    {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
                    {copied ? 'Copiado' : 'Copiar'}
                </button>
            </div>
            <pre className="overflow-x-auto p-4 text-[13px] leading-[1.65] text-brand-text">
                <code className="font-mono whitespace-pre">{code}</code>
            </pre>
        </div>
    );
};
