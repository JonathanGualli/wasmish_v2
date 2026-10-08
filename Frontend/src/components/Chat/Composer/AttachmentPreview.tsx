import { useRef, useState } from "react";
import { CircleAlert, Pause, Play, X } from "lucide-react";
import type { OutgoingAttachment } from "../../../hooks/useOutgoingAttachment";
import { formatFileSize } from "../../../utils/fileSize";
import { fileTypeLabel } from "../../../utils/outboundMedia";

interface Props {
    attachment: OutgoingAttachment;
    onChange: () => void;
    /** La ventana se cerró: se ve, apagado, pero ya no se puede mandar. */
    disabled?: boolean;
    /** Va también el texto escrito (se dice al guardarlo con la ventana cerrada). */
    withText?: boolean;
}

/**
 * El archivo listo para enviar, encima del campo de escribir: miniatura o
 * icono, nombre, formato y peso, y cambiarlo o quitarlo. Si no vale, el motivo
 * va dentro, con «Enviar como documento» si es una imagen que así sí cabe.
 */
export const AttachmentPreview = ({ attachment, onChange, disabled = false, withText = false }: Props) => {
    const { file, kind, issue, totalDropped } = attachment;
    if (!file) return null;

    // «PDF · 15 MB · 1 de 3»: el audio mete su duración después del formato.
    const metaParts = [
        fileTypeLabel(file.name),
        formatFileSize(file.size),
        totalDropped > 1 ? `1 de ${totalDropped}` : '',
        disabled ? (withText ? 'y tu texto, guardados' : 'guardado') : '',
    ].filter(Boolean);

    return (
        <div className={`bg-brand-surface border rounded-xl p-2.5 md:p-3 grid gap-2.5
            ${issue ? 'border-brand-danger' : 'border-brand-border'} ${disabled ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3">
                {kind === 'audio' && !issue
                    ? <AudioPreview src={attachment.previewUrl} name={file.name} metaParts={metaParts} />
                    : (
                        <>
                            <Thumbnail attachment={attachment} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-brand-text truncate">{file.name}</div>
                                <div className={`font-mono text-[11px] ${issue ? 'text-brand-danger' : 'text-brand-muted'}`}>{metaParts.join(' · ')}</div>
                            </div>
                        </>
                    )}
                {!disabled && (
                    <>
                        <button type="button" onClick={onChange}
                            className="hidden md:block flex-none px-2 text-[13px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                            Cambiar
                        </button>
                        <button type="button" onClick={attachment.clear} title="Quitar el archivo"
                            className="flex-none w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-brand-muted
                                hover:bg-brand-bg hover:text-brand-text transition-colors cursor-pointer">
                            <X size={17} />
                        </button>
                    </>
                )}
            </div>

            {issue && (
                <div className="flex gap-2.5 rounded-[9px] bg-brand-danger-soft px-3 py-2.5 text-[13px] leading-[1.5] text-brand-strong">
                    <CircleAlert size={16} className="flex-none mt-0.5 text-brand-danger" />
                    <div className="min-w-0 grid gap-2 justify-items-start">
                        <p><span className="font-semibold text-brand-text">{issue.title}</span>{issue.detail && <> {issue.detail}</>}</p>
                        {issue.canSendAsDocument && (
                            <button type="button" onClick={attachment.sendAsDocument}
                                className="h-8 px-3 rounded-[8px] border border-brand-border-strong bg-brand-surface text-[13px]
                                    font-semibold text-brand-text hover:bg-brand-bg transition-colors cursor-pointer">
                                Enviar como documento
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/** Miniatura de la imagen o el video; de lo demás, el formato en un sello. */
const Thumbnail = ({ attachment }: { attachment: OutgoingAttachment }) => {
    const { file, previewUrl, issue } = attachment;
    const box = "w-10 h-10 md:w-14 md:h-14 rounded-[9px] flex-none overflow-hidden";
    if (!file) return null;

    if (!issue && previewUrl && file.type.startsWith('image/')) {
        return <img src={previewUrl} alt="" className={`${box} object-cover bg-brand-raised`} />;
    }
    if (!issue && previewUrl && file.type.startsWith('video/')) {
        return <video src={previewUrl} muted preload="metadata" className={`${box} object-cover bg-brand-raised`} />;
    }
    if (issue) return <div className={`${box} bg-brand-raised`} />;

    const label = fileTypeLabel(file.name);
    return (
        <div className={`${box} flex items-center justify-center border text-[11px] font-bold
            ${label === 'PDF' ? 'bg-brand-danger-soft border-brand-danger-border text-brand-danger' : 'bg-brand-bg border-brand-border text-brand-gray-600'}`}>
            {label.slice(0, 4)}
        </div>
    );
};

const formatSeconds = (seconds: number) => {
    const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Un audio se puede escuchar antes de mandarlo. */
const AudioPreview = ({ src, name, metaParts }: { src: string | null; name: string; metaParts: string[] }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play();
        else audio.pause();
    };

    return (
        <div className="min-w-0 flex-1 flex items-center gap-3">
            {src && (
                <audio
                    ref={audioRef}
                    src={src}
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
                    onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                />
            )}
            <button type="button" onClick={toggle} title={playing ? 'Pausar' : 'Escuchar'}
                className="flex-none w-11 h-11 rounded-full bg-brand-deep text-white flex items-center justify-center cursor-pointer
                    hover:bg-brand-deep-hover transition-colors">
                {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>
            <div className="min-w-0 flex-1 grid gap-1">
                <div className="text-sm font-semibold text-brand-text truncate">{name}</div>
                <div className="font-mono text-[11px] text-brand-muted">
                    {[metaParts[0], duration ? formatSeconds(duration) : '', ...metaParts.slice(1)].filter(Boolean).join(' · ')}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-brand-raised overflow-hidden">
                        <div className="h-full bg-brand-deep" style={{ width: `${duration ? (current / duration) * 100 : 0}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-brand-muted tabular-nums">
                        {formatSeconds(current)} / {formatSeconds(duration)}
                    </span>
                </div>
            </div>
        </div>
    );
};
