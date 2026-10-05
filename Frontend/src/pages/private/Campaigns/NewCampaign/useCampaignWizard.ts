import { useCallback, useMemo, useState } from "react";
import { useCampaignDraft } from "../../../../hooks/useCampaignDraft";
import { useCampaignPreview } from "../../../../hooks/useCampaigns";
import { useTemplates } from "../../../../hooks/useTemplates";
import { useHeaderMediaUpload } from "../../../../hooks/useHeaderMediaUpload";
import type { CampaignDraftInput, CampaignFill } from "../../../../models/campaign.model";
import type { Template } from "../../../../models/template.model";
import type { CampaignDraft } from "../../../../utils/campaignDraft";
import { buttonsNeedingValue, orderedPlaceholders } from "../../../../utils/templatePlaceholders";
import { headerMediaRule, templateHeaderIssue, type HeaderSource } from "../../../../utils/templateHeader";

const EMPTY_FILL: CampaignFill = { source: 'fixed', value: '', fallback: '' };

/**
 * Las de autenticación llevan un código por persona: no tiene sentido
 * mandarlas en masivo. Una cabecera con archivo no bloquea aunque la plantilla
 * no tenga ninguno guardado: se sube en el paso 2. Sí bloquea un formato que
 * Wasmish no sabe enviar.
 */
export const bulkDisabledReason = (template: Template) => {
    if (template.category === 'AUTHENTICATION') return 'Las plantillas de autenticación no se pueden enviar de forma masiva.';
    return headerMediaRule(template) ? null : templateHeaderIssue(template);
};

/**
 * El estado del asistente de «Nueva campaña». Todo vive en el borrador (y por
 * tanto en el navegador): cada cambio se guarda al momento, así que salir y
 * volver deja todo donde estaba. La validación la hace el backend en la
 * vista previa, que es la misma que se aplica al crear la campaña.
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
    const headerMediaId = draft?.headerMedia?.id ?? null;

    const previewInput = useMemo((): CampaignDraftInput | null => (
        recipients ? { templateId, variables: variables ?? [], buttons: buttons ?? [], excludeOptedOut, recipients, headerMediaId } : null
    ), [templateId, variables, buttons, excludeOptedOut, recipients, headerMediaId]);

    const preview = useCampaignPreview(previewInput);
    const errors = preview.data?.errors ?? [];
    const messageErrors = errors.filter(e => e.field !== 'recipients');

    // La cabecera de esta campaña: un archivo subido aquí, sin tocar el de la
    // plantilla (salvo que se marque la casilla, y eso al crear la campaña).
    const headerUpload = useHeaderMediaUpload(template, media => update({ headerMedia: media, saveHeaderAsDefault: false }));
    const resetHeaderToTemplate = () => update({ headerMedia: null, saveHeaderAsDefault: false });
    const toggleSaveHeaderAsDefault = () => update({ saveHeaderAsDefault: !draft?.saveHeaderAsDefault });

    const selectTemplate = (next: Template) => {
        if (next.templateId === templateId) return;
        setShowErrors(false);
        // Lo que se subía o se subió era para la cabecera de la otra plantilla.
        headerUpload.reset();
        update({
            templateId: next.templateId,
            templateName: next.name,
            variables: orderedPlaceholders(next.bodyText).map(key => ({ key, ...EMPTY_FILL })),
            buttons: buttonsNeedingValue(next.buttons).map(({ index }) => ({ index, ...EMPTY_FILL })),
            headerMedia: null,
            saveHeaderAsDefault: false,
        });
    };

    // El archivo que se mandará y de dónde sale; `null` si la cabecera no
    // lleva archivo o todavía falta.
    const headerMedia = draft?.headerMedia ?? template?.headerMedia ?? null;
    const headerSource: HeaderSource | null = !headerMediaRule(template) || !headerMedia
        ? null
        : draft?.headerMedia ? 'campaign' : 'template';

    // La plantilla tal como saldrá: con el archivo elegido para esta campaña,
    // si lo hay. Es la que pintan las vistas previas.
    const headerTemplate = useMemo(
        () => (template && draft?.headerMedia ? { ...template, headerMedia: draft.headerMedia } : template),
        [template, draft?.headerMedia],
    );

    const setVariable = (key: string, fill: CampaignFill) =>
        update({ variables: (variables ?? []).map(v => (v.key === key ? { ...v, ...fill } : v)) });

    const setButton = (index: number, fill: CampaignFill) =>
        update({ buttons: (buttons ?? []).map(b => (b.index === index ? { ...b, ...fill } : b)) });

    // El nombre es lo único que no valida la vista previa (no lo necesita).
    const nameMissing = !draft?.name.trim();

    /** El error de un campo (`variables.1`, `buttons.0`, `name`…), solo si ya toca enseñarlo. */
    const fieldError = (field: string) => {
        if (!showErrors) return undefined;
        if (field === 'name') return nameMissing ? 'Ponle un nombre a la campaña.' : undefined;
        return errors.find(e => e.field === field)?.message;
    };

    return {
        draft, update, discard,
        templates: approved, templatesLoading, syncTemplates: () => sync(), isSyncing, template, selectTemplate,
        setVariable, setButton, headerTemplate, headerMedia, headerSource,
        headerUpload, resetHeaderToTemplate, toggleSaveHeaderAsDefault,
        preview: preview.data, isPreviewUpdating: preview.isUpdating, previewInput,
        messageErrors, nameMissing, fieldError, showErrors, setShowErrors,
    };
};

export type CampaignWizard = ReturnType<typeof useCampaignWizard>;
