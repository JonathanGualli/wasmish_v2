import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft, LayoutTemplate, MessageSquare, Plus, Send } from 'lucide-react';
import { TemplateFormSkeleton } from './ChatSkeletons';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { AuthField } from '../Auth/AuthField';
import { CustomButton } from '../Button/Button';
import { Callout } from '../Callout/Callout';
import { useNoticeContext } from '../Notice/context/UseNoticeContext';
import { useConversations } from '../../hooks/useConversations';
import { useStartConversation } from '../../hooks/useSendTemplate';
import { useTemplateForm, templateSendError } from '../../hooks/useTemplateForm';
import { AppRoutes } from '../../models/routes.models';
import { TemplatePicker, TemplateFields } from './TemplateFields';
import { TemplateBubble, TemplateButtons } from './TemplatePreview';
import { templateHeaderIssue } from '../../utils/templateHeader';
import type { ConversationDraft } from '../../utils/conversationDraft';
import { formatPhone, PHONE_RE } from '../../utils/contactDisplay';
import { initials } from '../../utils/initials';
import { useLines } from '../../hooks/useLines';
import type { Line } from '../../models/line.model';
import { lineLabel } from '../../utils/lineDisplay';
import { LineSelect } from '../Line/LineSelect';

/** La plantilla que se quitó al cambiar a una línea de otra cuenta, con lo rellenado: «Volver a …» la recupera. */
interface RemovedTemplate {
  templateName: string;
  values: Record<string, string>;
  buttonValues: Record<number, string>;
  from: Line;
  to: Line;
}

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
 * Conversación nueva, en el sitio del hilo: un formulario en una columna
 * (diseño de Claude Design, «Líneas · Chats»): «Enviar desde», «Para», la
 * plantilla y, debajo, la vista previa como burbuja propia, tal y como quedará
 * en el hilo. A un número que nunca escribió WhatsApp solo le entrega una
 * plantilla. La conversación no existe hasta que la plantilla sale; mientras
 * tanto la bandeja la enseña como «Borrador», y lo escrito se guarda (ver
 * `utils/conversationDraft.ts`) para no perderlo al abrir otra conversación.
 *
 * Con más de una línea conectada, lo primero es «Enviar desde», con la por
 * defecto puesta. Las plantillas son las de la cuenta de WhatsApp Business de
 * esa línea: pasar a una de otra cuenta quita la elegida (si allí no hay una
 * con su nombre), lo dice y deja volver atrás. Si el número ya tiene
 * conversación en esa línea, la plantilla va en ella, y se dice.
 */
export const NewConversationPanel = ({ initialDraft, onClose, onBack, onCreated, onOpenExisting, onDraftChange }: Props) => {
  const [phone, setPhone] = useState(initialDraft.phone);
  const [name, setName] = useState(initialDraft.name);
  const [lineId, setLineId] = useState(initialDraft.lineId);
  const [removed, setRemoved] = useState<RemovedTemplate | null>(null);
  const { setState, setContent } = useNoticeContext();

  // La elegida si sigue conectada; si no (o sin elegir), la por defecto.
  const { hasManyLines, activeLines, defaultLine, lineById, isLoading: linesLoading, isError: linesError } = useLines();
  const line = activeLines.find(l => l.id === lineId) ?? defaultLine ?? undefined;
  // Un borrador con su línea no se envía hasta saber cuál es: sin `lineId`,
  // el backend usaría la por defecto, que puede ser otro número.
  const lineUnresolved = Boolean(lineId) && (linesLoading || linesError);

  const form = useTemplateForm(initialDraft, line ? line.waBusinessId : undefined);
  const templatesLoading = useDelayedLoading(form.isLoading);
  const startConversation = useStartConversation();
  const { data: conversations } = useConversations();

  const digits = phone.replace(/\D/g, '');
  const phoneValid = PHONE_RE.test(digits);

  // Una conversación por número y línea (índice único en el backend): enviar
  // aquí escribiría en la que ya existe en esa línea. Se dice, y se ofrece abrirla.
  const existing = useMemo(
    () => (phoneValid ? conversations?.find(c => c.phone === digits && (!line || c.lineId === line.id)) : undefined),
    [conversations, digits, phoneValid, line],
  );

  // Alguien de la bandeja con ese número (en cualquier línea): «Para» lo enseña como contacto.
  const known = useMemo(
    () => (phoneValid ? conversations?.find(c => c.phone === digits) : undefined),
    [conversations, digits, phoneValid],
  );

  const { selectedName, values, buttonValues } = form;
  useEffect(() => {
    onDraftChange({ phone, name, lineId, templateName: selectedName, values, buttonValues });
  }, [phone, name, lineId, selectedName, values, buttonValues, onDraftChange]);

  const restore = (template: RemovedTemplate) => {
    form.selectTemplate(template.templateName);
    form.setValues(template.values);
    form.setButtonValues(template.buttonValues);
    setRemoved(null);
  };

  const changeLine = (nextId: string) => {
    const next = lineById(nextId);
    if (!next || !line || next.id === line.id) return;
    setLineId(next.id);
    // Lo quitado en un cambio anterior se guarda hasta elegir otra plantilla:
    // vuelve solo si la nueva línea tiene esa plantilla.
    if (removed && !selectedName) {
      if (form.existsIn(removed.templateName, next.waBusinessId)) restore(removed);
      else setRemoved({ ...removed, to: next });
      return;
    }
    if (!selectedName || form.existsIn(selectedName, next.waBusinessId)) {
      setRemoved(null);
      return;
    }
    setRemoved({ templateName: selectedName, values, buttonValues, from: line, to: next });
    form.reset();
  };

  const undoLineChange = () => {
    if (!removed) return;
    setLineId(removed.from.id);
    restore(removed);
  };

  const selectTemplate = (templateName: string) => {
    setRemoved(null);
    form.selectTemplate(templateName);
  };

  const status = !digits ? 'Escribe el número de destino.'
    : !phoneValid ? 'El número parece incompleto: lleva código de país.'
    : lineUnresolved ? (linesError ? 'No se pudieron cargar las líneas. Recarga la página.' : 'Cargando las líneas…')
    : form.isLoading ? 'Cargando plantillas…'
    : form.approved.length === 0 ? 'Necesitas una plantilla aprobada.'
    : !form.selected ? 'Elige una plantilla.'
    : form.headerIssue ? form.headerIssue
    : form.missing === 1 ? 'Falta 1 valor por completar.'
    : form.missing > 1 ? `Faltan ${form.missing} valores por completar.`
    : 'Listo para enviar.';
  const ready = phoneValid && !lineUnresolved && Boolean(form.selected) && form.missing === 0 && !form.headerIssue;

  const handleClose = () => {
    if (!startConversation.isPending) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;

    try {
      const message = await startConversation.mutateAsync({
        destinationNumber: digits,
        // Con un contacto reconocido, el campo de nombre no se ve: lo que quedara
        // escrito para otro número no debe acabar en este contacto (Codex, PR #25).
        contactName: known ? undefined : name.trim() || undefined,
        lineId: line?.id,
        ...form.buildPayload(),
      });
      onCreated(message.conversationId);
    } catch (err) {
      // El error va al aviso global, como el resto de la app. Lo escrito no se
      // pierde: el panel sigue montado debajo y se puede corregir y reenviar.
      setContent(<div className="text-brand-danger text-sm"><p>{templateSendError(err)}</p></div>);
      setState(true);
    }
  };

  const renderComposer = () => {
    if (templatesLoading.pending) return <TemplateFormSkeleton visible={templatesLoading.visible} />;
    if (form.approved.length === 0) {
      return (
        <Callout tone="info" icon={<LayoutTemplate size={16} />}
          title={hasManyLines && line ? `${lineLabel(line)} no tiene plantillas aprobadas` : 'No tienes plantillas aprobadas'}>
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
        <TemplatePicker templates={form.approved} selected={form.selected} onSelect={t => selectTemplate(t.name)}
          disabledReason={templateHeaderIssue}
          hint={hasManyLines && line ? `${form.approved.length} de ${lineLabel(line)}` : undefined} />
        <TemplateFields form={form} />
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="bg-brand-bg h-full w-full flex flex-col min-h-0">
      {/* Cabecera: qué es esto */}
      <div className="bg-brand-surface border-b border-brand-border px-4 md:px-6 py-3.5 max-md:pt-[calc(12px+var(--safe-top))] max-md:pb-3
        flex-none flex items-center gap-3">
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
        <div className="max-md:hidden w-9 h-9 rounded-[9px] border border-dashed border-brand-border-strong
          text-brand-muted flex items-center justify-center flex-none">
          <Plus size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] max-md:text-base font-semibold text-brand-text">Conversación nueva</div>
          <div className="text-[11px] text-brand-muted">Se crea al enviar la primera plantilla</div>
        </div>
      </div>

      {/* El formulario, en una columna: desde dónde, para quién, qué plantilla y cómo queda */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 py-6">
        <div className="mx-auto w-full max-w-[580px] grid grid-cols-[minmax(0,1fr)] gap-[18px]">
          <LineSelect value={line?.id ?? null} onChange={changeLine} templateChosen={Boolean(selectedName)} />

          {known ? (
            <KnownRecipient title={known.title} phone={digits} onChange={() => { setPhone(''); setName(''); }} />
          ) : (
            <div className="grid gap-3.5">
              <AuthField
                label="Para"
                placeholder="593987654321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                mono
                hint="Número de WhatsApp con código de país, sin «+» ni espacios."
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
          )}

          {existing && (
            <Callout icon={<MessageSquare size={16} />}
              title={`${existing.title} ya tiene una conversación${hasManyLines && line ? ` por ${lineLabel(line)}` : ''}.`}
              action={<button type="button" onClick={() => onOpenExisting(existing.id)}
                className="text-[13px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">Abrirla</button>}>
              La plantilla se envía en esa conversación y el historial sigue junto.
            </Callout>
          )}

          {renderComposer()}

          {removed && (
            <Callout tone="warning" icon={<AlertCircle size={16} />} title={`Quitamos «${removed.templateName}».`}
              action={<button type="button" onClick={undoLineChange}
                className="text-[13px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                Volver a {lineLabel(removed.from)}
              </button>}>
              Es de otra cuenta de WhatsApp Business y no se puede enviar por {lineLabel(removed.to)}.
              {form.approved.length > 0 && ` Elige una de las de ${lineLabel(removed.to)}.`}
            </Callout>
          )}

          {/* Vista previa: el mensaje tal y como quedará en el hilo */}
          {form.selected && (
            <div className="justify-self-end w-full max-w-[85%] md:max-w-[75%]">
              <TemplateBubble bodyText={form.selected.bodyText ?? ''} values={form.values} template={form.selected} />
              <TemplateButtons buttons={form.selected.buttons} />
              {form.selected.header && (
                <p className="text-[11px] text-brand-subtle text-right mt-1.5">
                  La cabecera de la plantilla no se ve aquí, pero sí se envía.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* El pie, fijo abajo: en el teléfono, sobre la barra de inicio o el teclado (diseño E6). */}
      <div className="flex-none px-4 md:px-6 max-md:bg-brand-surface max-md:border-t max-md:border-brand-border
        max-md:pb-[calc(14px+var(--safe-bottom))] md:pb-5">
        <div className="mx-auto w-full max-w-[580px] md:border-t md:border-brand-border pt-4 max-md:pt-3
          flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] text-brand-muted mr-auto max-md:w-full max-md:text-center">{status}</span>
          <div className="h-10 max-md:h-12">
            <CustomButton variant="outline" onClick={handleClose}>Descartar</CustomButton>
          </div>
          <div className="h-10 max-md:h-12 max-md:flex-1">
            <CustomButton type="submit" isLoading={startConversation.isPending} disabled={!ready}>
              <Send size={16} />
              {existing ? 'Enviar en su conversación' : 'Enviar plantilla'}
            </CustomButton>
          </div>
        </div>
      </div>
    </form>
  );
};

/**
 * «Para» cuando el número ya es de alguien de la bandeja: se enseña el
 * contacto, como en el diseño, en vez del número suelto. «Cambiar» vuelve a
 * los campos para escribir otro.
 */
const KnownRecipient = ({ title, phone, onChange }: { title: string; phone: string; onChange: () => void }) => {
  const number = formatPhone(phone);
  return (
    <div className="grid gap-[7px]">
      <span className="text-[13px] font-semibold text-brand-strong">Para</span>
      <div className="flex items-center gap-2 min-h-[50px] pl-2 pr-3.5 py-1.5 rounded-[10px] lg:rounded-[8px]
        border border-brand-border-strong bg-brand-surface">
        <span className="inline-flex items-center gap-2 min-w-0 rounded-[6px] bg-brand-bg pl-1 pr-2.5 py-1">
          <span className="w-6 h-6 rounded-[6px] bg-brand-accent-soft text-brand-accent-strong text-[10px] font-bold
            flex items-center justify-center flex-none">
            {initials(title)}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-brand-text">{title}</span>
          {title !== number && (
            <span className="hidden sm:inline flex-none font-mono text-[12.5px] text-brand-muted tabular-nums">{number}</span>
          )}
        </span>
        <button type="button" onClick={onChange}
          className="ml-auto flex-none text-[13px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
          Cambiar
        </button>
      </div>
    </div>
  );
};
