import { Copy, ExternalLink, Phone, Reply } from 'lucide-react';
import type { TemplateButton } from '../../models/template.model';

const BUTTON_ICON: Record<string, React.ReactNode> = {
  URL: <ExternalLink size={14} />,
  PHONE_NUMBER: <Phone size={14} />,
  QUICK_REPLY: <Reply size={14} />,
  COPY_CODE: <Copy size={14} />,
  OTP: <Copy size={14} />,
};

/**
 * Los botones de una plantilla, como los ve el contacto: debajo de la burbuja
 * y a su ancho. Se usan en la vista previa y en el hilo, en los mensajes que
 * se enviaron como plantilla.
 */
export const TemplateButtons = ({ buttons }: { buttons?: TemplateButton[] }) => {
  if (!buttons?.length) return null;
  return (
    <div className="grid gap-1 mt-1">
      {buttons.map((b, i) => (
        <div
          key={i}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px]
            bg-brand-surface border border-brand-border text-[13px] font-semibold text-brand-accent-strong"
        >
          {BUTTON_ICON[b.type]}
          <span className="truncate">{b.text || 'Botón'}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Cuerpo de la plantilla con lo escrito hasta ahora. Los marcadores que faltan
 * se quedan a la vista (en mono y subrayados) para que se note qué falta, en
 * vez de desaparecer del texto.
 */
export const TemplateBubble = ({ bodyText, values }: { bodyText: string; values: Record<string, string> }) => (
  <div className="text-sm leading-[1.5] whitespace-pre-line text-white
    bg-brand-deep rounded-[12px_12px_3px_12px] px-3.5 py-2.5">
    {bodyText.split(/(\{\{\s*[^}]+?\s*\}\})/g).map((part, i) => {
      const key = part.match(/^\{\{\s*([^}]+?)\s*\}\}$/)?.[1];
      if (!key) return part;
      const value = values[key]?.trim();
      return value || (
        <span key={i} className="font-mono text-[13px] text-brand-accent
          underline decoration-dotted underline-offset-[3px]">
          {part}
        </span>
      );
    })}
  </div>
);
