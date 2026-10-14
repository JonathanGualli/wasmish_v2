import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { useCopyToClipboard } from "../../../../hooks/useCopyToClipboard";
import { LinePin } from "./LinePin";

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
    <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{label}</dt>
        <dd className="mt-1">{children}</dd>
        {hint && <dd className="mt-0.5 text-[11.5px] text-brand-muted">{hint}</dd>}
    </div>
);

const Value = ({ children }: { children: ReactNode }) => (
    <span className="font-mono text-[13px] text-brand-text break-all">{children}</span>
);

const CopyableValue = ({ value }: { value: string }) => {
    const { copied, copy } = useCopyToClipboard();
    return (
        <span className="flex items-center gap-1.5">
            <Value>{value}</Value>
            <button type="button" onClick={() => copy(value)} title={copied ? 'Copiado' : 'Copiar'}
                aria-label={copied ? 'Copiado' : 'Copiar el ID de línea'}
                className="flex-none text-brand-accent-strong cursor-pointer">
                {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
        </span>
    );
};

/** Los datos técnicos de una línea, plegados: lo que hace falta para la API o para soporte, y el PIN de dos pasos. */
export const LineDetails = ({ line }: { line: Line }) => (
    <dl className="sm:ml-6 grid gap-4 sm:grid-cols-3 rounded-[8px] bg-brand-bg px-3.5 py-3">
        <Field label="ID de línea" hint="Úsalo en la API para enviar por esta línea.">
            <CopyableValue value={line.id} />
        </Field>
        <Field label="ID de teléfono"><Value>{line.phoneNumberId}</Value></Field>
        <Field label="ID de WhatsApp Business"><Value>{line.waBusinessId ?? '—'}</Value></Field>
        <LinePin line={line} />
    </dl>
);
