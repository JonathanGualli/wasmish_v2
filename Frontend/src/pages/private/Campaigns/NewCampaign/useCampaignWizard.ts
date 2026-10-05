import { useCallback, useMemo, useState } from "react";
import { useCampaignDraft } from "../../../../hooks/useCampaignDraft";
import { useCampaignPreview } from "../../../../hooks/useCampaigns";
import { useTemplates } from "../../../../hooks/useTemplates";
import type { CampaignDraftInput, CampaignFill } from "../../../../models/campaign.model";
import type { Template } from "../../../../models/template.model";
import type { CampaignDraft } from "../../../../utils/campaignDraft";
import { buttonsNeedingValue, orderedPlaceholders } from "../../../../utils/templatePlaceholders";
import { templateHeaderIssue } from "../../../../utils/templateHeader";

const EMPTY_FILL: CampaignFill = { source: 'fixed', value: '', fallback: '' };

/**
 * Las de autenticación llevan un código por persona: no tiene sentido
 * mandarlas en masivo. Y ninguna sale sin el archivo de su cabecera.
 */
export const bulkDisabledReason = (template: Template) =>
    template.category === 'AUTHENTICATION'
        ? 'Las plantillas de autenticación no se pueden enviar de forma masiva.'
        : templateHeaderIssue(template);

/**
 * El estado del asistente de «Nuevo envío». Todo vive en el borrador (y por
 * tanto en el navegador): cada cambio se guarda al momento, así que salir y
 * volver deja todo donde estaba. La validación la hace el backend en la
 * vista previa, que es la misma que se aplica al crear el envío.
 */
export const useCampaignWizard = () => {
    const { draft, save, discard } = useCampaignDraft();
    const { templates, isLoading: templatesLoading, sync, isSyncing } = useTemplates();
    // Los errores de los campos se enseñan después de intentar avanzar, no al
    // abrir el paso: una plantilla recién elegida está vacía y no es un error.
    const [showErrors, setShowErrors] = useState(false);

    const approved = useMemo(() => (templates as Template[]).filter(t => t.status === 'APPROVED'), [templates]);
    const template = approved.find(t => t.templateId === draft?.templateId);

    const update = useCallback((changes: Partial<CampaignDraft>) => {
        if (draft) save({ ...draft, ...changes });
    }, [draft, save]);

    const templateId = draft?.templateId ?? null;
    const variables = draft?.variables;
    const buttons = draft?.buttons;
    const excludeOptedOut = draft?.excludeOptedOut ?? false;
    const recipients = draft?.recipients;

    const previewInput = useMemo((): CampaignDraftInput | null => (
        recipients ? { templateId, variables: variables ?? [], buttons: buttons ?? [], excludeOptedOut, recipients } : null
    ), [templateId, variables, buttons, excludeOptedOut, recipients]);

    const preview = useCampaignPreview(previewInput);
    const errors = preview.data?.errors ?? [];
    const messageErrors = errors.filter(e => e.field !== 'recipients');

    const selectTemplate = (next: Template) => {
        if (next.templateId === templateId) return;
        setShowErrors(false);
        update({
            templateId: next.templateId,
            templateName: next.name,
            variables: orderedPlaceholders(next.bodyText).map(key => ({ key, ...EMPTY_FILL })),
            buttons: buttonsNeedingValue(next.buttons).map(({ index }) => ({ index, ...EMPTY_FILL })),
        });
    };

    const setVariable = (key: string, fill: CampaignFill) =>
        update({ variables: (variables ?? []).map(v => (v.key === key ? { ...v, ...fill } : v)) });

    const setButton = (index: number, fill: CampaignFill) =>
        update({ buttons: (buttons ?? []).map(b => (b.index === index ? { ...b, ...fill } : b)) });

    // El nombre es lo único que no valida la vista previa (no lo necesita).
    const nameMissing = !draft?.name.trim();

    /** El error de un campo (`variables.1`, `buttons.0`, `name`…), solo si ya toca enseñarlo. */
    const fieldError = (field: string) => {
        if (!showErrors) return undefined;
        if (field === 'name') return nameMissing ? 'Ponle un nombre al envío.' : undefined;
        return errors.find(e => e.field === field)?.message;
    };

    return {
        draft, update, discard,
        templates: approved, templatesLoading, syncTemplates: () => sync(), isSyncing, template, selectTemplate,
        setVariable, setButton,
        preview: preview.data, isPreviewUpdating: preview.isUpdating, previewInput,
        messageErrors, nameMissing, fieldError, showErrors, setShowErrors,
    };
};

export type CampaignWizard = ReturnType<typeof useCampaignWizard>;
