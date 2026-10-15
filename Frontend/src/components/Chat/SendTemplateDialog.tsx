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
import { useLines } from '../../hooks/useLines';
import type { Line } from '../../models/line.model';
import { lineLabel } from '../../utils/lineDisplay';
import { LineSwatch } from '../Line/LineSwatch';
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useHistoryEntry } from '../../hooks/useHistoryEntry';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { TemplateFormSkeleton } from './ChatSkeletons';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  /** La línea de la conversación: se envía por ella, con las plantillas de su cuenta de WhatsApp Business. */
  line?: Line;
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
 *
 * No se elige línea: es la de la conversación. Con varias, la cabecera dice
 * cuál, y solo se ofrecen las plantillas de su cuenta de WhatsApp Business.
 *
 * En el teléfono es una hoja casi a pantalla completa (se ve que el chat sigue
 * detrás) con «Enviar plantilla» fijo abajo, sobre la barra de inicio o el
 * teclado (diseño «Wasmish Móvil», E5). El pie queda fijo también en la compu.
 */
export const SendTemplateDialog = ({ open, onClose, conversationId, line, contactName, windowOpen, keepsDraft }: Props) => {
  const form = useTemplateForm(undefined, line ? line.waBusinessId : undefined);
  const loading = useDelayedLoading(form.isLoading);
  const { showLines, colorOf } = useLines();
  const sendTemplate = useSendTemplate();
  const { state: errorVisible, setState, setContent } = useNoticeContext();

  const handleClose = () => {
    if (sendTemplate.isPending) return;
    form.reset();
    onClose();
  };

  // En el teléfono, la hoja tiene su entrada en el historial: «atrás» la
  // cierra y deja el chat, en vez de cerrar el chat con la hoja encima.
  const isPhone = useMediaQuery(PHONE_QUERY);
  useHistoryEntry(isPhone && open, 'templateSheetOpen', handleClose);

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

      <div className="fixed inset-0 flex items-center justify-center p-4 max-md:p-0 max-md:items-end max-md:pt-[calc(28px+var(--safe-top))]">
        <DialogPanel className="w-full max-w-[480px] max-h-[90vh] flex flex-col bg-brand-surface
          border border-brand-border rounded-2xl shadow-[0_18px_40px_rgba(14,17,22,0.12)]
          max-md:max-w-none max-md:h-full max-md:max-h-none max-md:rounded-b-none max-md:border-b-0">
          <div aria-hidden className="md:hidden flex-none mx-auto mt-2.5 h-1 w-9 rounded-full bg-brand-border-strong" />

          <div className="flex-none flex items-start gap-3 px-6 pt-6 max-md:px-[18px] max-md:pt-3">
            <div className="min-w-0">
              <DialogTitle className="text-[22px] max-md:text-lg font-bold tracking-[-0.02em] text-brand-text">
                Enviar plantilla
              </DialogTitle>
              <p className="text-[15px] max-md:text-sm text-brand-muted mt-1.5 max-md:mt-0.5">
                A <span className="font-semibold text-brand-strong">{contactName}</span>.
                {!windowOpen && ' Fuera de la ventana de 24 h, WhatsApp solo entrega plantillas aprobadas.'}
              </p>
              {showLines && line && (
                <p className="text-[13px] text-brand-muted mt-1">
                  Por{' '}
                  <span className="inline-flex items-center gap-1.5 align-baseline font-semibold text-brand-strong">
                    <LineSwatch colorClass={colorOf(line.id)} size="sm" />{lineLabel(line)}
                  </span>
                  , con las plantillas de su cuenta de WhatsApp Business.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="ml-auto max-md:-mr-2 max-md:w-10 max-md:h-10 flex items-center justify-center flex-none
                text-brand-subtle hover:text-brand-text transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Mientras cargan las plantillas, el formulario ya está (con su pie): solo el
              selector es skeleton, y el diálogo no crece al llegar. */}
          {loading.pending || form.approved.length > 0 ? (
            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 max-md:px-[18px] pt-6 max-md:pt-5 pb-2 grid grid-cols-[minmax(0,1fr)] gap-[18px] content-start">
                {loading.pending ? (
                  <TemplateFormSkeleton visible={loading.visible} />
                ) : (
                  <>
                    <TemplatePicker templates={form.approved} selected={form.selected} onSelect={t => form.selectTemplate(t.name)}
                      disabledReason={templateHeaderIssue} />
                    {form.headerIssue && <p className="text-xs text-brand-danger -mt-2.5">{form.headerIssue}</p>}
                    <TemplateFields form={form} />

                    {form.selected && (
                      <div className="grid gap-[7px]">
                        <span className="text-[13px] font-semibold text-brand-strong">
                          <span className="max-md:hidden">Vista previa</span><span className="md:hidden">Así le llega</span>
                        </span>
                        <div>
                          <TemplateBubble bodyText={form.selected.bodyText ?? ''} values={form.values} template={form.selected} />
                          <TemplateButtons buttons={form.selected.buttons} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex-none flex items-center gap-2.5 justify-end px-6 max-md:px-[18px] pt-3 pb-6
                max-md:pb-[calc(14px+var(--safe-bottom))] max-md:border-t max-md:border-brand-border">
                {keepsDraft && (
                  <p className="mr-auto min-w-0 text-[13px] text-brand-muted max-md:hidden">Lo que escribiste en el chat se queda ahí.</p>
                )}
                <div className="h-10 max-md:hidden">
                  <CustomButton variant="outline" onClick={handleClose}>Cancelar</CustomButton>
                </div>
                <div className="h-10 max-md:h-12 max-md:flex-1">
                  <CustomButton type="submit" isLoading={sendTemplate.isPending} disabled={!form.selected || form.missing > 0 || Boolean(form.headerIssue)}>
                    {sendTemplate.isPending ? 'Enviando…' : <><span className="max-md:hidden">Enviar</span><span className="md:hidden">Enviar plantilla</span></>}
                  </CustomButton>
                </div>
              </div>
            </form>
          ) : (
            <div className="px-6 max-md:px-[18px] py-6">
              <Callout tone="info" icon={<LayoutTemplate size={16} />} title="No tienes plantillas aprobadas">
                Créalas en el Administrador de WhatsApp de Meta y sincronízalas desde la
                página de Plantillas.
              </Callout>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
};
