import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check, Send } from "lucide-react";
import { CustomButton } from "../../../../components/Button/Button";
import { useNoticeContext } from "../../../../components/Notice/context/UseNoticeContext";
import { campaignErrors, useCampaignMutations } from "../../../../hooks/useCampaigns";
import { CampaignPaths } from "../../../../models/routes.models";
import type { CampaignDraft } from "../../../../utils/campaignDraft";
import { formatDuration, pluralize, suggestCampaignName } from "../../../../utils/campaignDisplay";
import { useCampaignWizard, type CampaignWizard } from "./useCampaignWizard";
import { RecipientsStep } from "./RecipientsStep";
import { MessageStep } from "./MessageStep";
import { ReviewStep } from "./ReviewStep";
import { WizardHeader } from "./WizardHeader";

type Step = CampaignDraft['step'];

/** Lo que dice el pie de cada paso: qué falta, o qué va a pasar. */
const footerHint = (wizard: CampaignWizard) => {
    const { draft, preview, template, messageErrors, showErrors } = wizard;
    if (!draft || !preview) return 'Calculando…';
    if (draft.step === 1) {
        return preview.recipients.toSend === 0
            ? 'Con 0 destinatarios no se puede continuar.'
            : 'Puedes volver atrás sin perder nada de lo elegido.';
    }
    if (draft.step === 2) {
        if (!template) return 'Elige una plantilla para continuar.';
        if (preview.recipients.toSend === 0) return 'Con 0 destinatarios no se puede continuar.';
        if (messageErrors.length > 0) {
            return showErrors
                ? `Falta completar ${pluralize(messageErrors.length, 'dato', 'datos')}.`
                : 'Indica de dónde sale cada dato.';
        }
        return 'Todo completo: cada variable tiene de dónde salir.';
    }
    return `Tarda ${formatDuration(preview.estimatedSeconds)}; puedes cerrar la pantalla, la campaña sigue.`;
};

/**
 * «Nueva campaña»: un asistente de tres pasos sobre el borrador del navegador.
 * Se llega desde Contactos (con la selección hecha) o desde la lista de
 * Campañas (para continuar el borrador). Sin borrador no hay nada que hacer aquí.
 */
export const NewCampaignPage = () => {
    const navigate = useNavigate();
    const wizard = useCampaignWizard();
    const { create } = useCampaignMutations();
    const { setState: showNotice, setContent: setNoticeContent } = useNoticeContext();
    const { draft, preview, template, update, isPreviewUpdating } = wizard;
    // La campaña recién creada. Redirigir desde aquí y no con navigate(): React
    // Router 7 navega dentro de una transición, el borrador se borra antes y
    // la página, al quedarse sin él, mandaba a la lista en vez de al detalle.
    const [createdId, setCreatedId] = useState<string | null>(null);

    if (createdId) return <Navigate to={CampaignPaths.detail(createdId)} replace />;
    if (!draft) return <Navigate to={CampaignPaths.list} replace />;

    const notify = (content: React.ReactNode) => {
        setNoticeContent(content);
        showNotice(true);
    };

    const goToStep = (step: Step) => {
        wizard.setShowErrors(false);
        update({ step });
    };

    const submit = () => {
        if (!template || !wizard.previewInput) return;
        create.mutate(
            { ...wizard.previewInput, templateId: template.templateId, name: draft.name.trim() },
            {
                onSuccess: (campaign) => {
                    setCreatedId(campaign.id);
                    wizard.discard();
                    notify(
                        <div className="text-sm">
                            <p className="font-semibold text-brand-text">Campaña iniciada.</p>
                            <p className="text-brand-muted mt-0.5">Avanza en segundo plano: puedes seguir trabajando o cerrar la pantalla.</p>
                        </div>,
                    );
                },
                onError: (err) => notify(
                    <div className="text-sm text-brand-danger grid gap-1">
                        {campaignErrors(err).map(e => <p key={`${e.field}-${e.message}`}>{e.message}</p>)}
                    </div>,
                ),
            },
        );
    };

    const handleNext = () => {
        if (draft.step === 1) {
            // Al seguir, el número de ahora pasa a ser el «antes» del aviso de cambios.
            update({ step: 2, selectedCount: preview?.recipients.selected ?? draft.selectedCount });
        } else if (draft.step === 2) {
            if (wizard.messageErrors.length > 0) {
                wizard.setShowErrors(true);
            } else {
                wizard.setShowErrors(false);
                update({ step: 3, name: draft.name || suggestCampaignName(template!.name) });
            }
        } else if (wizard.nameMissing || wizard.messageErrors.length > 0) {
            wizard.setShowErrors(true);
        } else {
            submit();
        }
    };

    // Sin nadie a quien enviar no se avanza en ningún paso: en el 2, una
    // plantilla de marketing puede dejar fuera a todos los dados de baja.
    const hasRecipients = (preview?.recipients.toSend ?? 0) > 0 && !preview?.errors.some(e => e.field === 'recipients');
    const canAdvance = Boolean(preview) && !isPreviewUpdating && hasRecipients && (draft.step === 1 || Boolean(template));

    const nextLabel = draft.step === 3
        ? <><Send size={15} />Enviar a {pluralize(preview?.recipients.toSend ?? 0, 'contacto', 'contactos')}</>
        : 'Siguiente';

    return (
        <div className="min-h-full flex flex-col">
            <div className="flex-1 mx-auto w-full max-w-6xl px-5 sm:px-8 pt-6 sm:pt-8 pb-10">
                <WizardHeader
                    step={draft.step}
                    description="Una plantilla aprobada para muchos contactos a la vez."
                    aside={
                        <span className="flex items-center gap-1.5 text-[12.5px] text-brand-muted">
                            <Check size={14} className="text-brand-success" />Borrador guardado
                        </span>
                    }
                />

                {draft.step === 1 && <RecipientsStep wizard={wizard} />}
                {draft.step === 2 && <MessageStep wizard={wizard} />}
                {draft.step === 3 && <ReviewStep wizard={wizard} />}
            </div>

            <footer className="sticky bottom-0 z-10 bg-brand-surface border-t border-brand-border
                shadow-[0_-8px_20px_rgba(14,17,22,0.04)]">
                <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="hidden sm:block flex-1 min-w-0 text-[13px] text-brand-muted">{footerHint(wizard)}</span>
                    <div className="flex gap-2">
                        <div className="h-11 sm:h-[42px]">
                            <CustomButton
                                variant="outline"
                                onClick={() => (draft.step === 1 ? navigate(CampaignPaths.list) : goToStep((draft.step - 1) as Step))}
                            >
                                {draft.step === 1 ? 'Salir' : 'Atrás'}
                            </CustomButton>
                        </div>
                        <div className="h-11 sm:h-[42px] flex-1 sm:flex-none">
                            <CustomButton onClick={handleNext} disabled={!canAdvance} isLoading={create.isPending}>
                                {nextLabel}
                            </CustomButton>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};
