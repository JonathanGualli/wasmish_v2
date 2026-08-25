import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { CustomButton } from '../Button/Button';
import { AuthField } from '../Auth/AuthField';
import { sendMessageService } from '../../services/api.service';

interface ErrorItem { message: string }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama con el id de la conversación creada para abrirla al vuelo. */
  onCreated: (conversationId: string) => void;
}

/**
 * Conversación nueva a un número que todavía no está en la bandeja.
 * Usa el mismo POST /chats/messages con `destinationNumber`: el backend crea la
 * conversación si no existe y emite `message_created` por SSE.
 */
export const NewConversationDialog = ({ open, onClose, onCreated }: Props) => {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const queryClient = useQueryClient();

  const reset = () => {
    setPhone(''); setName(''); setText(''); setError(null); setIsSending(false);
  };

  const handleClose = () => {
    if (isSending) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const destinationNumber = phone.replace(/[^\d]/g, '');
    if (!destinationNumber || !text.trim()) return;

    setIsSending(true);
    setError(null);
    try {
      const message = await sendMessageService(
        text.trim(),
        undefined,
        crypto.randomUUID(),
        name.trim() || undefined,
        destinationNumber,
      );
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (message?.conversationId) onCreated(message.conversationId);
      reset();
      onClose();
    } catch (err) {
      const data = (err as AxiosError<ErrorItem[] | ErrorItem>).response?.data;
      const messages = Array.isArray(data) ? data.map(d => d.message) : data?.message ? [data.message] : [];
      setError(messages[0] ?? 'No se pudo enviar el mensaje. Inténtalo de nuevo.');
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-ink/50" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-[440px] bg-brand-surface border border-brand-border
          rounded-2xl shadow-[0_18px_40px_rgba(14,17,22,0.12)] p-6">

          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">
                Conversación nueva
              </DialogTitle>
              <p className="text-[15px] text-brand-muted mt-1.5">
                WhatsApp solo permite texto libre si el contacto te escribió en las últimas 24 h.
                Fuera de esa ventana, usa una plantilla.
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

          <form onSubmit={handleSubmit} className="grid gap-[18px] mt-6">
            <AuthField
              label="Número de WhatsApp"
              type="text"
              placeholder="593987654321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            <AuthField
              label="Nombre del contacto (opcional)"
              type="text"
              placeholder="Ferretería La Estrella"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="grid gap-[7px]">
              <span className="text-[13px] font-semibold text-brand-strong">Mensaje</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                required
                placeholder="Escribe el primer mensaje…"
                className="w-full box-border resize-none text-[15px] text-brand-text
                  bg-brand-surface border border-brand-border-strong rounded-lg px-[14px] py-[13px]
                  placeholder:text-brand-subtle
                  focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft
                  transition-colors"
              />
            </label>

            {error && <p className="text-[13px] text-brand-danger">{error}</p>}

            <div className="flex gap-2.5 justify-end">
              <div className="h-10">
                <CustomButton variant="outline" onClick={handleClose}>Cancelar</CustomButton>
              </div>
              <div className="h-10">
                <CustomButton type="submit" isLoading={isSending}>
                  {isSending ? 'Enviando…' : 'Enviar'}
                </CustomButton>
              </div>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
