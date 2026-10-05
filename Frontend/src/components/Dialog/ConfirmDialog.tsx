import type { ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { CustomButton } from '../Button/Button';
import { useNoticeContext } from '../Notice/context/UseNoticeContext';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: ReactNode;
    /** Lo que hace la acción («Eliminar», «Cancelar los 211 restantes»). */
    confirmLabel: string;
    cancelLabel?: string;
    /** `danger` para lo que no se puede deshacer: botón rojo e icono en rojo. */
    tone?: 'default' | 'danger';
    icon?: ReactNode;
    /** Algo más entre el texto y los botones: una tarjeta, un resumen. */
    children?: ReactNode;
    isLoading?: boolean;
    onConfirm: () => void;
    /** Cerrar sin hacer nada: el botón secundario, Escape o pulsar fuera. */
    onCancel: () => void;
    /**
     * Si el botón secundario hace algo más que cerrar («Empezar uno nuevo»).
     * Escape y pulsar fuera siguen siendo `onCancel`.
     */
    onSecondary?: () => void;
}

/**
 * Pregunta antes de una acción con consecuencias. Las dos salidas son
 * explícitas: el texto de cada botón dice qué pasa, nunca «Aceptar».
 */
export const ConfirmDialog = ({
    open, title, description, confirmLabel, cancelLabel = 'Cancelar', tone = 'default', icon, children,
    isLoading = false, onConfirm, onCancel, onSecondary,
}: ConfirmDialogProps) => {
    const { state: notificationVisible } = useNoticeContext();

    // El aviso global vive en otro portal: para el Dialog, pulsar su X es un
    // «clic fuera». Mientras se ve, o mientras la acción está en curso, no se cierra.
    const handleClose = () => {
        if (!isLoading && !notificationVisible) onCancel();
    };

    return (
        <Dialog open={open} onClose={handleClose} className="relative z-[60]">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/50" />
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <DialogPanel className="w-full max-w-[460px] bg-brand-surface border border-brand-border rounded-2xl
                    shadow-[0_18px_40px_rgba(14,17,22,0.12)] p-6 grid gap-3.5">
                    {icon && (
                        <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center
                            ${tone === 'danger' ? 'bg-brand-danger-soft text-brand-danger' : 'bg-brand-accent-soft text-brand-accent-strong'}`}>
                            {icon}
                        </div>
                    )}
                    <div>
                        <DialogTitle className="text-lg font-bold tracking-[-0.015em] text-brand-text">{title}</DialogTitle>
                        <div className="mt-1.5 text-sm leading-[1.55] text-brand-strong">{description}</div>
                    </div>
                    {children}
                    <div className="mt-1.5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <div className="h-10"><CustomButton variant="outline" onClick={onSecondary ?? handleClose} disabled={isLoading}>{cancelLabel}</CustomButton></div>
                        <div className="h-10">
                            <CustomButton variant={tone === 'danger' ? 'danger' : 'secondary'} onClick={onConfirm} isLoading={isLoading}>
                                {confirmLabel}
                            </CustomButton>
                        </div>
                    </div>
                </DialogPanel>
            </div>
        </Dialog>
    );
};
