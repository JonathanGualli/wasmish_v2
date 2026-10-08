import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X, LayoutTemplate } from 'lucide-react';
import { CustomButton } from '../Button/Button';
import { Callout } from '../Callout/Callout';
import { useNoticeContext } from '../Notice/context/UseNoticeContext';
import { useSendTemplate } from '../../hooks/useSendTemplate';
import { useTemplateForm, templateSendError } from '../../hooks/useTemplateForm';
import { TemplatePicker, TemplateFields } from './TemplateFields';
import { TemplateBubble, TemplateButtons } from './TemplatePreview';
import { templateHeaderIssue } from '../../utils/templateHeader';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  /** Solo para el texto de cabecera: a quién se le va a escribir. */
  contactName: string;
  /** Con la ventana abierta no hace falta explicar por qué una plantilla. */
  windowOpen: boolean;
  /** Hay algo escrito en el chat: se avisa de que no se pierde. */
  keepsDraft: boolean;
}

/**
 * Enviar una plantilla aprobada a una conversación: la única forma de retomarla
 * con la ventana de 24 h cerrada, y otra cosa más que mandar con ella abierta
 * (una con botones, un recordatorio ya redactado). Los errores van al aviso global, como en el resto de la app; el
 * diálogo sigue abierto debajo para corregir sin perder lo escrito.
 */
export const SendTemplateDialog = ({ open, onClose, conversationId, contactName, windowOpen, keepsDraft }: Props) => {
  const form = useTemplateForm();
  const sendTemplate = useSendTemplate();
  const { state: errorVisible, setState, setContent } = useNoticeContext();

  const handleClose = () => {
    if (sendTemplate.isPending) return;
    form.reset();
    onClose();
  };

  // El aviso de error vive en otro portal: para el Dialog, pulsar su X (o ESC
  // con él abierto) es un «clic fuera», y cerraría el diálogo con lo escrito.
  const handleDialogClose = () => {
    if (!errorVisible) handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selected || form.missing > 0 || form.headerIssue) return;

    try {
      await sendTemplate.mutateAsync({ conversationId, ...form.buildPayload() });
      handleClose();
    } catch (err) {
      setContent(<div className="text-brand-danger text-sm"><p>{templateSendError(err)}</p></div>);
      setState(true);
    }
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} className="relative z-50">
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
                {!windowOpen && ' Fuera de la ventana de 24 h, WhatsApp solo entrega plantillas aprobadas.'}
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

          {form.isLoading ? (
            <p className="text-sm text-brand-muted mt-6">Cargando plantillas…</p>
          ) : form.approved.length === 0 ? (
            <div className="mt-6">
              <Callout tone="info" icon={<LayoutTemplate size={16} />} title="No tienes plantillas aprobadas">
                Créalas en el Administrador de WhatsApp de Meta y sincronízalas desde la
                página de Plantillas.
              </Callout>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-[18px] mt-6">
              <TemplatePicker templates={form.approved} selected={form.selected} onSelect={t => form.selectTemplate(t.name)}
                disabledReason={templateHeaderIssue} />
              {form.headerIssue && <p className="text-xs text-brand-danger -mt-2.5">{form.headerIssue}</p>}
              <TemplateFields form={form} />

              {form.selected && (
                <div className="grid gap-[7px]">
                  <span className="text-[13px] font-semibold text-brand-strong">Vista previa</span>
                  <div>
                    <TemplateBubble bodyText={form.selected.bodyText ?? ''} values={form.values} template={form.selected} />
                    <TemplateButtons buttons={form.selected.buttons} />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2.5 justify-end">
                {keepsDraft && (
                  <p className="mr-auto min-w-0 text-[13px] text-brand-muted">Lo que escribiste en el chat se queda ahí.</p>
                )}
                <div className="h-10">
                  <CustomButton variant="outline" onClick={handleClose}>Cancelar</CustomButton>
                </div>
                <div className="h-10">
                  <CustomButton type="submit" isLoading={sendTemplate.isPending} disabled={!form.selected || form.missing > 0 || Boolean(form.headerIssue)}>
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
