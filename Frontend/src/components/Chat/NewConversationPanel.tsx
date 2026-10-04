import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, LayoutTemplate, LoaderCircle, Plus, Send, X } from 'lucide-react';
import { AuthField } from '../Auth/AuthField';
import { CustomButton } from '../Button/Button';
import { Callout } from '../Callout/Callout';
import { useModalContext } from '../Modal/context/UseModalContext';
import { useConversations } from '../../hooks/useConversations';
import { useStartConversation } from '../../hooks/useSendTemplate';
import { useTemplateForm, templateSendError } from '../../hooks/useTemplateForm';
import { AppRoutes } from '../../models/routes.models';
import { TemplatePicker, TemplateFields } from './TemplateFields';
import { TemplateBubble, TemplateButtons } from './TemplatePreview';
import type { ConversationDraft } from '../../utils/conversationDraft';
import { PHONE_RE } from '../../utils/contactDisplay';

interface Props {
  /** Lo guardado del borrador: el panel arranca con eso al volver a abrirlo. */
  initialDraft: ConversationDraft;
  /** Descartar el borrador. */
  onClose: () => void;
  /** Volver a la bandeja en móvil, sin descartar: el borrador se queda guardado. */
  onBack?: () => void;
  /** La primera plantilla salió: abrir la conversación que creó. */
  onCreated: (conversationId: string) => void;
  /** El número ya tiene conversación en la bandeja. */
  onOpenExisting: (conversationId: string) => void;
  /** Cada cambio, para guardarlo y para la fila «Borrador» de la bandeja. */
  onDraftChange: (draft: ConversationDraft) => void;
}

/**
 * Conversación nueva, en el sitio del hilo y con su misma forma: cabecera con
 * el destinatario, lienzo con la vista previa como burbuja propia, y abajo el
 * composer — que aquí es la plantilla, porque a un número que nunca escribió
 * WhatsApp no le entrega otra cosa. La conversación no existe hasta que la
 * plantilla sale; mientras tanto la bandeja la enseña como «Borrador», y lo
 * escrito se guarda (ver `utils/conversationDraft.ts`) para no perderlo al
 * abrir otra conversación.
 */
export const NewConversationPanel = ({ initialDraft, onClose, onBack, onCreated, onOpenExisting, onDraftChange }: Props) => {
  const [phone, setPhone] = useState(initialDraft.phone);
  const [name, setName] = useState(initialDraft.name);
  const { setState, setContent } = useModalContext();

  const form = useTemplateForm(initialDraft);
  const startConversation = useStartConversation();
  const { data: conversations } = useConversations();

  const digits = phone.replace(/\D/g, '');
  const phoneValid = PHONE_RE.test(digits);

  // Con dos conversaciones del mismo número no se puede (índice único en el
  // backend): enviar aquí escribiría en la que ya existe. Mejor ofrecer abrirla.
  const existing = useMemo(
    () => (phoneValid ? conversations?.find(c => c.phone === digits) : undefined),
    [conversations, digits, phoneValid],
  );

  const { selectedName, values, buttonValues } = form;
  useEffect(() => {
    onDraftChange({ phone, name, templateName: selectedName, values, buttonValues });
  }, [phone, name, selectedName, values, buttonValues, onDraftChange]);

  const status = !digits ? 'Escribe el número de destino.'
    : !phoneValid ? 'El número parece incompleto: lleva código de país.'
    : form.isLoading ? 'Cargando plantillas…'
    : form.approved.length === 0 ? 'Necesitas una plantilla aprobada.'
    : !form.selected ? 'Elige una plantilla.'
    : form.missing === 1 ? 'Falta 1 valor por completar.'
    : form.missing > 1 ? `Faltan ${form.missing} valores por completar.`
    : 'Listo para enviar.';
  const ready = phoneValid && Boolean(form.selected) && form.missing === 0;

  const handleClose = () => {
    if (!startConversation.isPending) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;

    try {
      const message = await startConversation.mutateAsync({
        destinationNumber: digits,
        contactName: name.trim() || undefined,
        ...form.buildPayload(),
      });
      onCreated(message.conversationId);
    } catch (err) {
      // El error va al modal global, como el resto de la app. Lo escrito no se
      // pierde: el panel sigue montado debajo y se puede corregir y reenviar.
      setContent(<div className="text-brand-danger text-sm"><p>{templateSendError(err)}</p></div>);
      setState(true);
    }
  };

  const renderComposer = () => {
    if (form.isLoading) {
      return (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-[10px] bg-brand-bg border border-brand-border
          text-sm text-brand-muted">
          <LoaderCircle size={16} className="animate-spin text-brand-subtle" />
          Cargando plantillas…
        </div>
      );
    }
    if (form.approved.length === 0) {
      return (
        <Callout tone="info" icon={<LayoutTemplate size={16} />} title="No tienes plantillas aprobadas">
          Créalas en el Administrador de WhatsApp de Meta. Cuando Meta las apruebe, pulsa{' '}
          <span className="font-semibold text-brand-strong">Sincronizar</span> en la página{' '}
          <Link
            to={`${AppRoutes.private.root}/${AppRoutes.private.templates}`}
            className="font-semibold text-brand-accent-strong underline underline-offset-2"
          >
            Plantillas
          </Link>.
        </Callout>
      );
    }
    return (
      <div className="grid gap-3.5">
        <TemplatePicker form={form} />
        <TemplateFields form={form} />
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="bg-brand-bg h-full w-full flex flex-col min-h-0">
      {/* Cabecera: el destinatario */}
      <div className="bg-brand-surface border-b border-brand-border px-4 md:px-6 pt-3.5 pb-4 flex-none">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              title="Volver a la bandeja"
              className="md:hidden -ml-1 text-brand-strong hover:text-brand-text
                transition-colors cursor-pointer flex-none"
            >
              <ChevronLeft size={22} strokeWidth={2.2} />
            </button>
          )}
          <div className="w-9 h-9 rounded-[9px] border border-dashed border-brand-border-strong
            text-brand-muted flex items-center justify-center flex-none">
            <Plus size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-brand-text">Conversación nueva</div>
            <div className="text-[11px] text-brand-muted">Se crea al enviar la primera plantilla</div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title="Descartar"
            className="ml-auto text-brand-subtle hover:text-brand-text transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3.5 mt-3.5">
          <AuthField
            label="Número de WhatsApp"
            placeholder="593987654321"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            mono
            hint={existing ? (
              <>
                Ya tienes una conversación con este número.{' '}
                <button
                  type="button"
                  onClick={() => onOpenExisting(existing.id)}
                  className="font-semibold text-brand-accent-strong underline underline-offset-2 cursor-pointer"
                >
                  Abrirla
                </button>
              </>
            ) : 'Con código de país, sin «+» ni espacios.'}
            required
          />
          <AuthField
            label={<>Nombre del contacto <span className="ml-1 font-normal text-brand-subtle">(opcional)</span></>}
            placeholder="Ferretería La Estrella"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            hint="Así aparecerá en la bandeja."
          />
        </div>
      </div>

      {/* Lienzo: la vista previa, donde va a quedar el mensaje */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 py-[22px] flex flex-col gap-3">
        <div className="self-center text-[10px] font-bold uppercase tracking-[0.08em]
          text-brand-muted bg-brand-border rounded-full px-[13px] py-[5px]">
          Primer contacto · solo plantillas aprobadas
        </div>

        {form.selected ? (
          <div className="mt-auto self-end w-full max-w-[85%] md:max-w-[62%]">
            <div className="flex items-baseline justify-end gap-1.5 mb-1.5 text-[11px] text-brand-muted">
              <span className="font-semibold uppercase tracking-[0.1em]">Vista previa</span>
              <span className="font-mono">· {form.selected.name} · {form.selected.language}</span>
            </div>
            <TemplateBubble bodyText={form.selected.bodyText ?? ''} values={form.values} />
            <TemplateButtons buttons={form.selected.buttons} />
            <p className="text-[11px] text-brand-subtle text-right mt-1.5">
              Si la plantilla tiene encabezado, no se ve aquí — pero sí se envía.
            </p>
          </div>
        ) : (
          <p className="m-auto max-w-[320px] text-center text-sm leading-[1.5] text-brand-muted">
            Elige una plantilla abajo. Aquí verás el mensaje tal y como quedará en este hilo.
          </p>
        )}
      </div>

      {/* Composer: la plantilla */}
      <div className="bg-brand-surface border-t border-brand-border px-4 md:px-6 py-3.5 flex-none
        max-h-[60%] overflow-y-auto">
        {renderComposer()}

        <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
          <span className="text-[13px] text-brand-muted mr-auto">{status}</span>
          <div className="h-10">
            <CustomButton variant="outline" onClick={handleClose}>Descartar</CustomButton>
          </div>
          <div className="h-10">
            <CustomButton type="submit" isLoading={startConversation.isPending} disabled={!ready}>
              <Send size={16} />
              Enviar plantilla
            </CustomButton>
          </div>
        </div>
      </div>
    </form>
  );
};
