import { Copy, ExternalLink, FileText, ImageOff, Phone, Reply, Video } from 'lucide-react';
import type { Template, TemplateButton } from '../../models/template.model';
import { headerMediaRule, headerMediaUrl } from '../../utils/templateHeader';

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

/** Cómo se marca un valor dentro de la burbuja (la vista previa de un envío masivo). */
export type ValueHighlight = 'value' | 'fallback';

const HIGHLIGHT_CLASS: Record<ValueHighlight, string> = {
  value: 'bg-brand-deep-active rounded px-1',
  fallback: 'underline decoration-dashed decoration-brand-accent underline-offset-[3px]',
};

/**
 * Cuerpo de la plantilla con lo escrito hasta ahora. Los marcadores que faltan
 * se quedan a la vista (en mono y subrayados) para que se note qué falta, en
 * vez de desaparecer del texto. Con `highlights`, cada valor se marca según de
 * dónde salió: un dato del contacto o su valor de reserva.
 */
export const TemplateBubble = ({ bodyText, values, highlights, template }: {
  bodyText: string;
  values: Record<string, string>;
  highlights?: Record<string, ValueHighlight>;
  /** Para enseñar su cabecera encima del cuerpo. */
  template?: Template;
}) => (
  <div className="text-sm leading-[1.6] whitespace-pre-line text-white
    bg-brand-deep rounded-[12px_12px_3px_12px] px-3.5 py-2.5">
    {template && <TemplateHeaderPreview template={template} />}
    {bodyText.split(/(\{\{\s*[^}]+?\s*\}\})/g).map((part, i) => {
      const key = part.match(/^\{\{\s*([^}]+?)\s*\}\}$/)?.[1];
      if (!key) return part;
      const value = values[key]?.trim();
      if (!value) {
        return (
          <span key={i} className="font-mono text-[13px] text-brand-accent
            underline decoration-dotted underline-offset-[3px]">
            {part}
          </span>
        );
      }
      const highlight = highlights?.[key];
      return highlight ? <span key={i} className={HIGHLIGHT_CLASS[highlight]}>{value}</span> : value;
    })}
  </div>
);

/**
 * La cabecera dentro de la burbuja: el archivo que se enviará, el texto, o el
 * hueco si falta el archivo (y entonces la plantilla no se puede enviar).
 */
const TemplateHeaderPreview = ({ template }: { template: Template }) => {
  const header = template.header;
  if (!header) return null;
  if (header.format === 'TEXT') return <div className="font-bold mb-1">{header.text}</div>;

  const rule = headerMediaRule(template);
  if (!rule) return null;
  const media = template.headerMedia;
  if (!media) {
    return (
      <div className="flex items-center justify-center gap-2 h-24 mb-2 rounded-[8px] border border-dashed
        border-brand-on-deep-subtle text-[13px] text-brand-on-deep-muted">
        <ImageOff size={15} />Sin {rule.noun}
      </div>
    );
  }
  if (header.format === 'IMAGE') {
    return <img src={headerMediaUrl(media.id)} alt="" className="w-full max-h-[200px] object-cover rounded-[8px] mb-2" />;
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 mb-2 rounded-[8px] bg-brand-deep-active text-[13px] text-brand-on-deep">
      {header.format === 'VIDEO' ? <Video size={15} className="flex-none" /> : <FileText size={15} className="flex-none" />}
      <span className="truncate">{media.filename ?? rule.noun}</span>
    </div>
  );
};

/** La leyenda de `highlights`, debajo de la vista previa. */
export const ValueHighlightLegend = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-brand-strong">
    <span className="flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded-[3px] bg-brand-deep-active" />Dato del contacto</span>
    <span className="flex items-center gap-1.5"><span className="w-3.5 border-b-[1.5px] border-dashed border-brand-accent-strong" />Valor de reserva</span>
  </div>
);
