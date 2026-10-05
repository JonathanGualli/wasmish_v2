import { useRef } from "react";
import { FileText, Upload, Video } from "lucide-react";
import { Pill } from "../../../components/Pill/Pill";
import { useModalContext } from "../../../components/Modal/context/UseModalContext";
import { parseError, useTemplates } from "../../../hooks/useTemplates";
import type { Template } from "../../../models/template.model";
import { formatFileSize, headerMediaRule, headerMediaUrl, templateHeaderIssue } from "../../../utils/templateHeader";

const linkButton = `text-[12.5px] font-semibold cursor-pointer hover:underline disabled:text-brand-subtle
    disabled:cursor-wait disabled:no-underline`;

/** La miniatura del archivo: la imagen misma, o el icono del vídeo o el documento. */
const MediaThumb = ({ template }: { template: Template }) => {
    const media = template.headerMedia!;
    if (template.header?.format === 'IMAGE') {
        return (
            <a href={headerMediaUrl(media.id)} target="_blank" rel="noreferrer" className="flex-none"
                aria-label={`Ver la imagen de la cabecera de ${template.name}`}>
                <img src={headerMediaUrl(media.id)} alt=""
                    className="w-10 h-10 rounded-[8px] object-cover border border-brand-border bg-brand-bg" />
            </a>
        );
    }
    return (
        <a href={headerMediaUrl(media.id)} target="_blank" rel="noreferrer"
            className="w-10 h-10 rounded-[8px] border border-brand-border bg-brand-bg text-brand-muted flex-none
                flex items-center justify-center hover:text-brand-text transition-colors">
            {template.header?.format === 'VIDEO' ? <Video size={17} /> : <FileText size={17} />}
        </a>
    );
};

/**
 * La cabecera de la plantilla y, si pide un archivo, el que se envía con ella.
 * Meta aprueba que lleve una imagen, no cuál: la imagen va en cada envío, así
 * que aquí se sube la que se usará (y se cambia cuando se quiera).
 */
export const TemplateHeaderCell = ({ template }: { template: Template }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const { uploadHeaderMedia, removeHeaderMedia } = useTemplates();
    const { setState: showNotice, setContent: setNoticeContent } = useModalContext();
    const rule = headerMediaRule(template);
    // Las mutaciones son de esta celda: cada fila lleva su propio estado.
    const busy = uploadHeaderMedia.isPending || removeHeaderMedia.isPending;

    const notify = (message: string) => {
        setNoticeContent(<p className="text-sm text-brand-danger">{message}</p>);
        showNotice(true);
    };

    if (!template.header) return <span className="text-brand-subtle">—</span>;

    if (!rule) {
        const issue = templateHeaderIssue(template);
        return issue
            ? <span title={issue}><Pill tone="neutral">No compatible</Pill></span>
            : <span className="text-brand-muted whitespace-nowrap">Texto</span>;
    }

    const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';   // elegir el mismo archivo otra vez también avisa
        if (!file) return;
        // El backend lo vuelve a mirar; esto ahorra subir megas para nada.
        if (!rule.accept.split(',').includes(file.type)) {
            notify(`La cabecera pide ${rule.article} ${rule.noun}: elige un archivo ${rule.types}.`);
            return;
        }
        if (file.size > rule.maxBytes) {
            notify(`El archivo pesa ${formatFileSize(file.size)}: el máximo es ${formatFileSize(rule.maxBytes)}.`);
            return;
        }
        uploadHeaderMedia.mutate({ templateId: template.templateId, file }, {
            onError: (err) => notify(parseError(err, 'No se pudo subir el archivo.')),
        });
    };

    const remove = () => removeHeaderMedia.mutate(template.templateId, {
        onError: (err) => notify(parseError(err, 'No se pudo quitar el archivo.')),
    });

    const input = (
        <input ref={inputRef} type="file" accept={rule.accept} className="hidden" onChange={pickFile}
            aria-label={`Archivo de la cabecera de ${template.name}`} />
    );

    if (!template.headerMedia) {
        return (
            <div className="flex flex-col items-start gap-1.5 min-w-[150px]">
                <Pill tone="warning">Falta {rule.noun}</Pill>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                    className={`${linkButton} inline-flex items-center gap-1.5 text-brand-accent-strong`}>
                    <Upload size={13} />{busy ? 'Subiendo…' : `Subir ${rule.noun}`}
                </button>
                {input}
            </div>
        );
    }

    const media = template.headerMedia;
    return (
        <div className="flex items-center gap-2.5 min-w-[190px]">
            <MediaThumb template={template} />
            <div className="min-w-0 grid gap-0.5">
                <span className="text-[12.5px] text-brand-strong truncate max-w-[150px]" title={media.filename ?? undefined}>
                    {media.filename ?? rule.noun}
                    <span className="font-mono text-[11px] text-brand-subtle"> · {formatFileSize(media.size)}</span>
                </span>
                <span className="flex gap-3">
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                        className={`${linkButton} text-brand-accent-strong`}>
                        {uploadHeaderMedia.isPending ? 'Subiendo…' : 'Cambiar'}
                    </button>
                    <button type="button" onClick={remove} disabled={busy} className={`${linkButton} text-brand-gray-600`}>
                        Quitar
                    </button>
                </span>
            </div>
            {input}
        </div>
    );
};
