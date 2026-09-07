import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X, LayoutTemplate } from 'lucide-react';
import type { AxiosError } from 'axios';
import { CustomButton } from '../Button/Button';
import { AuthField } from '../Auth/AuthField';
import { Callout } from '../Callout/Callout';
import { useTemplates } from '../../hooks/useTemplates';
import { useSendTemplate } from '../../hooks/useSendTemplate';
import { extractPlaceholders, isPositional, previewTemplate, buttonsNeedingValue, buttonFieldLabel } from '../../utils/templatePlaceholders';
import type { Template } from '../../models/template.model';

interface ErrorItem { message: string }

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  /** Solo para el texto de cabecera: a quién se le va a escribir. */
  contactName: string;
}

/**
 * Enviar una plantilla aprobada a una conversación cuya ventana de 24 h se
 * cerró. Los errores se muestran DENTRO del diálogo, no en el modal global:
 * el usuario tiene que poder corregir los datos sin perder lo que escribió.
 */
export const SendTemplateDialog = ({ open, onClose, conversationId, contactName }: Props) => {
  const { templates, isLoading } = useTemplates();
  const sendTemplate = useSendTemplate();

  const [selectedName, setSelectedName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [buttonValues, setButtonValues] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Solo las aprobadas se pueden enviar; el resto Meta las rechaza.
  const approved = useMemo(
    () => (templates as Template[]).filter(t => t.status === 'APPROVED'),
    [templates],
  );

  const selected = useMemo(
    () => approved.find(t => t.name === selectedName),
    [approved, selectedName],
  );

  const placeholders = useMemo(
    () => extractPlaceholders(selected?.bodyText),
    [selected],
  );

  // Una plantilla de OTP, de cupón o con URL dinámica no se puede enviar sin el
  // valor de su botón: Meta la rechaza. Los pedimos aquí en vez de fallar luego.
  const buttonFields = useMemo(
    () => buttonsNeedingValue(selected?.buttons),
    [selected],
  );

  // Cambiar de plantilla invalida lo escrito: los marcadores son otros.
  useEffect(() => {
    setValues({});
    setButtonValues({});
    setError(null);
  }, [selectedName]);

  const handleClose = () => {
    if (sendTemplate.isPending) return;
    setSelectedName('');
    setValues({});
    setButtonValues({});
    setError(null);
    onClose();
  };

  const allFilled = placeholders.every(p => values[p]?.trim())
    && buttonFields.every(({ index }) => buttonValues[index]?.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !allFilled) return;
    setError(null);

    // Los posicionales van ordenados por su número ({{2}} después de {{1}});
    // los nombrados llevan su nombre, que es como Meta los identifica.
    const parameters = isPositional(placeholders)
      ? [...placeholders].sort((a, b) => Number(a) - Number(b)).map(p => values[p].trim())
      : placeholders.map(p => ({ name: p, value: values[p].trim() }));

    // El backend deduce el sub_type de la definición guardada; aquí solo va el
    // índice del botón y su valor.
    const buttons = buttonFields.map(({ index }) => ({
      index,
      parameters: [buttonValues[index].trim()],
    }));

    try {
      await sendTemplate.mutateAsync({
        conversationId,
        templateName: selected.name,
        parameters,
        language: selected.language,
        buttons,
      });
      handleClose();
    } catch (err) {
      const data = (err as AxiosError<ErrorItem[] | ErrorItem>).response?.data;
      const messages = Array.isArray(data) ? data.map(d => d.message) : data?.message ? [data.message] : [];
      setError(messages[0] ?? 'No se pudo enviar la plantilla. Inténtalo de nuevo.');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-ink/50" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-brand-surface
          border border-brand-border rounded-2xl shadow-[0_18px_40px_rgba(14,17,22,0.12)] p-6">

          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">
                Enviar plantilla
              </DialogTitle>
              <p className="text-[15px] text-brand-muted mt-1.5">
                A <span className="font-semibold text-brand-strong">{contactName}</span>.
                Fuera de la ventana de 24 h, WhatsApp solo entrega plantillas aprobadas.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="ml-auto text-brand-subtle hover:text-brand-text transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-brand-muted mt-6">Cargando plantillas…</p>
          ) : approved.length === 0 ? (
            <div className="mt-6">
              <Callout tone="info" icon={<LayoutTemplate size={16} />} title="No tienes plantillas aprobadas">
                Créalas en el Administrador de WhatsApp de Meta y sincronízalas desde la
                página de Plantillas.
              </Callout>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-[18px] mt-6">
              <label className="grid gap-[7px]">
                <span className="text-[13px] font-semibold text-brand-strong">Plantilla</span>
                <select
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  required
                  className="w-full box-border text-[15px] text-brand-text
                    bg-brand-surface border border-brand-border-strong rounded-lg px-[14px] py-[13px]
                    focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft
                    transition-colors cursor-pointer"
                >
                  <option value="">Elige una plantilla…</option>
                  {approved.map(t => (
                    <option key={t.templateId} value={t.name}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              </label>

              {placeholders.map((p, i) => (
                <AuthField
                  key={p}
                  label={isPositional(placeholders) ? `Valor ${i + 1} — {{${p}}}` : p}
                  type="text"
                  value={values[p] ?? ''}
                  onChange={(e) => setValues(v => ({ ...v, [p]: e.target.value }))}
                  required
                />
              ))}

              {buttonFields.map(({ button, index }) => (
                <div key={index} className="grid gap-[7px]">
                  <AuthField
                    label={buttonFieldLabel(button)}
                    type="text"
                    value={buttonValues[index] ?? ''}
                    onChange={(e) => setButtonValues(v => ({ ...v, [index]: e.target.value }))}
                    required
                  />
                  {button.type === 'OTP' && (
                    <span className="text-[13px] text-brand-muted">
                      Tiene que ser el mismo código que aparece en el texto del mensaje.
                    </span>
                  )}
                </div>
              ))}

              {selected && (
                <div className="grid gap-[7px]">
                  <span className="text-[13px] font-semibold text-brand-strong">Vista previa</span>
                  <div className="text-sm leading-[1.5] whitespace-pre-line text-white
                    bg-brand-deep rounded-[12px_12px_3px_12px] px-3.5 py-2.5">
                    {previewTemplate(selected.bodyText ?? '', values)}
                  </div>
                  <span className="text-[13px] text-brand-muted">
                    Si la plantilla tiene botones o encabezado, no se ven aquí — pero sí se envían.
                  </span>
                </div>
              )}

              {error && <p className="text-[13px] text-brand-danger">{error}</p>}

              <div className="flex gap-2.5 justify-end">
                <div className="h-10">
                  <CustomButton variant="outline" onClick={handleClose}>Cancelar</CustomButton>
                </div>
                <div className="h-10">
                  <CustomButton type="submit" isLoading={sendTemplate.isPending} disabled={!selected || !allFilled}>
                    {sendTemplate.isPending ? 'Enviando…' : 'Enviar'}
                  </CustomButton>
                </div>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
};
