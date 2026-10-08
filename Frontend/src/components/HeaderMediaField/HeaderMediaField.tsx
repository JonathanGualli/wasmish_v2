import type { ReactNode } from "react";
import { FileText, Play, Upload } from "lucide-react";
import { CustomButton } from "../Button/Button";
import { Checkbox } from "../Checkbox/Checkbox";
import { Pill } from "../Pill/Pill";
import { ProgressBar } from "../ProgressBar/ProgressBar";
import type { HeaderMediaUpload, PendingHeaderFile } from "../../hooks/useHeaderMediaUpload";
import { useFilePicker } from "../../hooks/useFilePicker";
import type { Template, TemplateHeaderMedia } from "../../models/template.model";
import {
    HEADER_MEDIA, HEADER_SOURCE_LABEL, headerFileMeta, headerMediaRule, headerMediaUrl,
    type HeaderMediaFormat, type HeaderMediaRule,
} from "../../utils/templateHeader";
import { formatFileSize } from "../../utils/fileSize";

interface HeaderMediaFieldProps {
    template: Template;
    /** El archivo elegido solo para este envío; `null` = el de la plantilla. */
    override: TemplateHeaderMedia | null;
    upload: HeaderMediaUpload;
    onRevert: () => void;
    /** «Usar también como imagen de la plantilla». Sin él, la casilla no sale. */
    saveAsDefault?: { checked: boolean; onToggle: () => void };
    /** Error de validación del envío (falta el archivo, ya no existe…). */
    error?: string;
}

// Los botones se ponen al lado del archivo si cabe y, en un contenedor
// estrecho (el diálogo del chat, el móvil), en una fila propia a 44 px.
const actionsRow = 'flex flex-wrap items-center gap-1.5 basis-full @lg:basis-auto';
const actionSlot = 'h-11 @lg:h-10 flex-1 @lg:flex-none';

/** La imagen en miniatura; el vídeo y el documento no tienen, van con su icono. */
const Thumb = ({ media, format }: { media: TemplateHeaderMedia; format: HeaderMediaFormat }) => {
    const box = 'w-14 h-14 flex-none rounded-[8px] flex items-center justify-center';
    if (format === 'IMAGE') {
        return <img src={headerMediaUrl(media.id)} alt="" className={`${box} object-cover border border-brand-border bg-brand-bg`} />;
    }
    if (format === 'VIDEO') {
        return <span className={`${box} bg-brand-deep text-brand-accent`}><Play size={20} fill="currentColor" /></span>;
    }
    return <span className={`${box} border border-brand-border bg-brand-bg text-brand-muted`}><FileText size={20} /></span>;
};

/** El archivo elegido: el de la plantilla o uno solo para esta campaña. */
const FileCard = ({ media, templateMedia, format, isOverride, invalid, onPick, onRevert, saveAsDefault }: {
    media: TemplateHeaderMedia;
    /** El de la plantilla, si tiene: se puede volver a él, y la casilla lo reemplaza. */
    templateMedia: TemplateHeaderMedia | null;
    format: HeaderMediaFormat;
    isOverride: boolean;
    invalid: boolean;
    onPick: () => void;
    onRevert: () => void;
    saveAsDefault?: HeaderMediaFieldProps['saveAsDefault'];
}) => {
    const rule: HeaderMediaRule = HEADER_MEDIA[format];
    const saveHelp = !saveAsDefault?.checked
        ? `Cambia ${rule.the} ${rule.noun} por defecto de la plantilla cuando envíes. Hasta entonces, la plantilla no cambia.`
        : templateMedia
            ? `Al enviar, reemplaza a «${templateMedia.filename ?? rule.noun}» en los próximos envíos de esta plantilla.`
            : `Al enviar, queda ${rule.saved} en la plantilla para los próximos envíos.`;

    return (
        <div className={`border rounded-xl bg-brand-surface overflow-hidden ${invalid ? 'border-brand-danger' : 'border-brand-border'}`}>
            <div className="p-3 flex flex-wrap items-center gap-x-3.5 gap-y-3">
                <div className="flex-1 basis-60 min-w-0 flex items-center gap-3">
                    <Thumb media={media} format={format} />
                    <div className="min-w-0 grid gap-1">
                        <span className="text-sm font-semibold text-brand-text [overflow-wrap:anywhere]">{media.filename ?? rule.title}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs text-brand-muted">{headerFileMeta(media)}</span>
                            <Pill tone={isOverride ? 'positive' : 'neutral'}>{HEADER_SOURCE_LABEL[isOverride ? 'campaign' : 'template']}</Pill>
                        </span>
                        {format === 'DOCUMENT' && (
                            <span className="text-[12.5px] text-brand-gray-600">El contacto ve este nombre al abrir el documento.</span>
                        )}
                    </div>
                </div>
                <div className={actionsRow}>
                    {isOverride && templateMedia && (
                        <div className={actionSlot}>
                            <CustomButton variant="ghost" onClick={onRevert}>Volver {rule.toThe} de la plantilla</CustomButton>
                        </div>
                    )}
                    <div className={actionSlot}>
                        <CustomButton variant="outline" onClick={onPick}>
                            <Upload size={14} />{isOverride ? 'Cambiar' : `Usar ${rule.another} en esta campaña`}
                        </CustomButton>
                    </div>
                </div>
            </div>

            {isOverride && saveAsDefault && (
                <label className={`border-t border-brand-raised px-3.5 py-3 flex items-start gap-3 cursor-pointer transition-colors
                    ${saveAsDefault.checked ? 'bg-brand-green-50' : ''}`}>
                    <span className="mt-px">
                        <Checkbox checked={saveAsDefault.checked} onChange={saveAsDefault.onToggle}
                            label={`Usar también como ${rule.noun} de la plantilla`} />
                    </span>
                    <span className="grid gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-text">Usar también como {rule.noun} de la plantilla</span>
                        <span className="text-[12.5px] leading-normal text-brand-muted">{saveHelp}</span>
                    </span>
                </label>
            )}
        </div>
    );
};

const UploadingCard = ({ pending, onCancel }: { pending: PendingHeaderFile; onCancel: () => void }) => (
    <div className="border border-brand-border rounded-xl p-3 flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <div className="flex-1 basis-60 min-w-0 flex items-center gap-3">
            <span className="w-14 h-14 flex-none rounded-[8px] bg-brand-bg text-brand-subtle flex items-center justify-center">
                <Upload size={20} />
            </span>
            <div className="flex-1 min-w-0 grid gap-2">
                <span className="text-sm font-semibold text-brand-text [overflow-wrap:anywhere]">Subiendo {pending.name}</span>
                <ProgressBar percent={pending.size ? Math.round((pending.loadedBytes / pending.size) * 100) : 0} active />
                <span className="text-[12.5px] leading-normal text-brand-muted">
                    <span className="font-mono text-brand-strong">
                        {formatFileSize(pending.loadedBytes)} de {formatFileSize(pending.size)}
                    </span>
                    {' · '}Se guarda en Wasmish; todavía no se manda nada.
                </span>
            </div>
        </div>
        <div className={actionsRow}>
            <div className={actionSlot}><CustomButton variant="ghost" onClick={onCancel}>Cancelar</CustomButton></div>
        </div>
    </div>
);

/**
 * Sin archivo: la plantilla no tiene ninguno guardado y hay que elegirlo para
 * poder enviar. Toda la tarjeta abre el selector; en rojo tras intentar avanzar.
 */
const MissingCard = ({ rule, invalid, onPick }: { rule: HeaderMediaRule; invalid: boolean; onPick: () => void }) => (
    <button
        type="button"
        onClick={onPick}
        aria-invalid={invalid || undefined}
        className={`w-full rounded-xl border-[1.5px] p-3.5 flex flex-wrap items-center gap-x-4 gap-y-3 text-left cursor-pointer
            ${invalid ? 'border-solid border-brand-danger bg-brand-danger-soft' : 'border-dashed border-brand-warning bg-brand-warning-soft'}`}
    >
        <span className="flex-1 basis-60 min-w-0 flex items-start gap-3">
            <span className={`w-9 h-9 flex-none rounded-[9px] bg-brand-surface border flex items-center justify-center
                ${invalid ? 'border-brand-danger-border text-brand-danger' : 'border-brand-border text-brand-warning'}`}>
                <Upload size={17} />
            </span>
            <span className="grid gap-0.5 min-w-0">
                <span className="text-sm font-semibold text-brand-text">Falta {rule.the} {rule.noun}</span>
                <span className="text-[13px] leading-normal text-brand-gray-600">
                    Esta plantilla no tiene {rule.noneSaved}, y sin {rule.noun} WhatsApp no envía el mensaje.
                </span>
                <span className="mt-0.5 font-mono text-xs text-brand-muted">
                    {rule.types} · hasta {formatFileSize(rule.maxBytes)}
                </span>
            </span>
        </span>
        <span className={`${actionsRow} gap-2.5`}>
            {/* Parece un botón, pero el botón es toda la tarjeta. */}
            <span className="h-11 @lg:h-10 flex-1 @lg:flex-none px-[18px] flex items-center justify-center rounded-[8px] border
                border-brand-border-strong bg-brand-surface text-sm font-semibold text-brand-accent-strong">
                Elegir {rule.noun}
            </span>
            <span className="hidden @lg:inline text-[12.5px] text-brand-muted">{rule.dropHint}</span>
        </span>
    </button>
);

/**
 * El archivo de la cabecera de un envío. Por defecto el de la plantilla (el
 * que se sube en Plantillas); se puede usar otro solo para este envío. Si la
 * plantilla no tiene ninguno, aquí se elige: sin archivo, WhatsApp no envía
 * la plantilla (Meta responde 132012). Se adapta a su contenedor, no a la
 * pantalla: así sirve igual en el paso 2 que en un diálogo estrecho.
 */
export const HeaderMediaField = ({ template, override, upload, onRevert, saveAsDefault, error }: HeaderMediaFieldProps) => {
    const picker = useFilePicker(upload.start);
    const rule = headerMediaRule(template);
    if (!rule) return null;

    const media = override ?? template.headerMedia ?? null;
    // Sin archivo, el error de validación es siempre «falta»: se dice corto.
    const shownError = upload.error ?? (error && (media ? error : `Elige ${rule.article} ${rule.noun} para continuar.`));

    let body: ReactNode;
    if (upload.pending) {
        body = <UploadingCard pending={upload.pending} onCancel={upload.reset} />;
    } else if (media) {
        body = (
            <FileCard
                media={media}
                templateMedia={template.headerMedia ?? null}
                format={template.header!.format as HeaderMediaFormat}
                isOverride={Boolean(override)}
                invalid={Boolean(shownError)}
                onPick={picker.open}
                onRevert={onRevert}
                saveAsDefault={saveAsDefault}
            />
        );
    } else {
        body = <MissingCard rule={rule} invalid={Boolean(shownError)} onPick={picker.open} />;
    }

    return (
        <div className="@container grid gap-2 min-w-0" {...picker.dropProps}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-semibold text-brand-strong">{rule.title} del mensaje</span>
                <span className="text-[12.5px] text-brand-muted">Va arriba del texto, en cada mensaje.</span>
            </div>
            {body}
            {shownError && <p className="text-xs text-brand-danger">{shownError}</p>}
            <input {...picker.inputProps} accept={rule.accept} aria-label={`${rule.title} del mensaje de ${template.name}`} />
        </div>
    );
};
