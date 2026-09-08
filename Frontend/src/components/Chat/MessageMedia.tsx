import { useState } from 'react';
import { Download, FileText, ImageOff } from 'lucide-react';
import type { Message } from '../../models/message.mode';

/** «1,4 MB», «312 KB». Mono al pintarlo: es un dato, no prosa. */
const formatTamano = (bytes?: number | null) => {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

/**
 * El adjunto de un mensaje, servido por `/api/media/<id>`.
 *
 * La ruta es del mismo origen que la app (en dev por el proxy de Vite, en prod
 * por el nginx del front), así que la cookie de sesión viaja sola: no hace falta
 * fetch ni blobs, basta con poner la URL en el src.
 */
export const MessageMedia = ({ msg }: { msg: Message }) => {
  const [fallo, setFallo] = useState(false);
  const url = `/api/media/${msg.id}`;
  const tamano = formatTamano(msg.mediaSize);

  // El archivo se borró del volumen, o la sesión caducó. Mejor decirlo que
  // dejar el hueco roto del navegador.
  if (fallo) {
    return (
      <span className="flex items-center gap-2 text-[13px] text-brand-muted">
        <ImageOff size={15} className="flex-none" />
        No se pudo cargar el archivo
      </span>
    );
  }

  if (msg.type === 'image' || msg.type === 'sticker') {
    const esSticker = msg.type === 'sticker';
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={msg.caption ?? 'Imagen recibida'}
          onError={() => setFallo(true)}
          className={`rounded-[10px] object-contain ${esSticker ? 'max-h-[140px]' : 'max-h-[320px] w-full'}`}
        />
      </a>
    );
  }

  if (msg.type === 'video') {
    return (
      <video
        src={url}
        controls
        onError={() => setFallo(true)}
        className="rounded-[10px] max-h-[320px] w-full"
      />
    );
  }

  if (msg.type === 'audio') {
    // El reproductor nativo del navegador: teclado y accesibilidad ya resueltos.
    return <audio src={url} controls onError={() => setFallo(true)} className="w-[260px] max-w-full" />;
  }

  // Documento: se descarga con su nombre original, que lo pone el backend en la
  // cabecera Content-Disposition.
  return (
    <a
      href={url}
      className="flex items-center gap-2.5 rounded-[10px] border border-brand-border
        bg-brand-bg px-3 py-2.5 hover:bg-brand-raised transition-colors group"
    >
      <FileText size={18} className="flex-none text-brand-accent-strong" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-brand-text truncate">
          {msg.mediaFilename ?? 'Documento'}
        </span>
        {tamano && <span className="block font-mono tabular-nums text-[11px] text-brand-muted">{tamano}</span>}
      </span>
      <Download size={16} className="flex-none ml-auto text-brand-subtle group-hover:text-brand-text transition-colors" />
    </a>
  );
};
