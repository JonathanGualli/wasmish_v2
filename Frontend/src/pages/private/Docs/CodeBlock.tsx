import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
    code: string;
    /** Etiqueta del lenguaje mostrada arriba a la izquierda (ej. "bash", "json"). */
    lang?: string;
}

/** Bloque de código con botón de copiar, acorde al estilo de marca. */
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
        <div className="relative group rounded-lg border border-brand-border bg-brand-raised overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-brand-border bg-brand-bg/50">
                <span className="text-[11px] font-medium uppercase tracking-wide text-brand-subtle">
                    {lang ?? 'code'}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-muted
                        hover:text-brand-text transition-colors cursor-pointer"
                    title="Copiar"
                >
                    {copied ? <Check size={13} className="text-brand-accent-strong" /> : <Copy size={13} />}
                    {copied ? 'Copiado' : 'Copiar'}
                </button>
            </div>
            <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-brand-text">
                <code className="font-mono whitespace-pre">{code}</code>
            </pre>
        </div>
    );
};
