import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaignDraft } from "../../../../hooks/useCampaignDraft";
import { useLines } from "../../../../hooks/useLines";
import type { Line } from "../../../../models/line.model";
import { lineLabel } from "../../../../utils/lineDisplay";
import { useCampaignPreview } from "../../../../hooks/useCampaigns";
import { useTemplates } from "../../../../hooks/useTemplates";
import { useHeaderMediaUpload } from "../../../../hooks/useHeaderMediaUpload";
import type { CampaignDraftInput, CampaignFill } from "../../../../models/campaign.model";
import type { Template } from "../../../../models/template.model";
import type { CampaignDraft } from "../../../../utils/campaignDraft";
import { buttonsNeedingValue, orderedPlaceholders } from "../../../../utils/templatePlaceholders";
import { headerMediaRule, templateHeaderIssue, type HeaderSource } from "../../../../utils/templateHeader";

const EMPTY_FILL: CampaignFill = { source: 'fixed', value: '', fallback: '' };

/** Sin plantilla: lo que se quita al pasar a una línea de otra cuenta de WhatsApp Business. */
const NO_TEMPLATE: Partial<CampaignDraft> = {
    templateId: null, templateName: null, variables: [], buttons: [], headerMedia: null, saveHeaderAsDefault: false,
};

/**
 * El borrador volvió y su línea cambió: la suya se desconectó
 * (`disconnected`), o era uno sin línea guardada y la por defecto pasó a otra
 * cuenta de WhatsApp Business (`defaultChanged`). Ahora sale por la por
 * defecto, quizá sin la plantilla.
 */
export interface LineResumeNotice {
    reason: 'disconnected' | 'defaultChanged';
    /** La etiqueta de la que tenía; `null` si ya no existe o no la guardó. */
    from: string | null;
    to: string;
    droppedTemplate: string | null;
}

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
 *
 * La línea (Fase 2c): la del borrador si sigue conectada; si no, la por
 * defecto. Las plantillas son las de su cuenta de WhatsApp Business. Pasar a
 * una línea de otra cuenta con una plantilla elegida se confirma antes
 * (`pendingLine`), porque se pierde lo rellenado.
 */
export const useCampaignWizard = () => {
    const { draft, save, discard } = useCampaignDraft();
    const { templates, isLoading: templatesLoading, sync, isSyncing } = useTemplates();
    const { activeLines, defaultLine, lineById, isLoading: linesLoading, isError: linesError } = useLines();
    // Los errores de los campos se enseñan después de intentar avanzar, no al
    // abrir el paso: una plantilla recién elegida está vacía y no es un error.
    const [showErrors, setShowErrors] = useState(false);
    const [pendingLine, setPendingLine] = useState<Line | null>(null);
    const [lineNotice, setLineNotice] = useState<LineResumeNotice | null>(null);

    const draftLineId = draft?.lineId ?? null;
    const line = activeLines.find(l => l.id === draftLineId) ?? defaultLine ?? undefined;

    const allApproved = useMemo(() => (templates as Template[]).filter(t => t.status === 'APPROVED'), [templates]);
    const approved = useMemo(
        () => (line ? allApproved.filter(t => t.waBusinessId === line.waBusinessId) : allApproved),
        [allApproved, line],
    );
    const template = approved.find(t => t.templateId === draft?.templateId);

    const update = useCallback((changes: Partial<CampaignDraft>) => {
        if (draft) save({ ...draft, ...changes });
    }, [draft, save]);

    // Desde el paso del mensaje, el borrador guarda la línea por la que sale,
    // también si es la por defecto sin tocar el selector: si después cambia la
    // por defecto, la campaña no cambia de número sin decirlo.
    //
    // Si al volver su línea ya no está conectada, o es uno sin línea guardada
    // y la por defecto es ahora de otra cuenta, pasa a la por defecto, sin la
    // plantilla si no sale por ella, y vuelve al paso del mensaje con un aviso:
    // el remitente cambió y hay que verlo antes de enviar (Codex, PR #23).
    // Espera a las líneas y a las plantillas para no decidirlo a ciegas.
    useEffect(() => {
        if (!draft || draft.step < 2 || linesLoading || linesError || templatesLoading || !defaultLine) return;
        if (draft.lineId && activeLines.some(l => l.id === draft.lineId)) return;
        const disconnected = Boolean(draft.lineId);
        const chosen = allApproved.find(t => t.templateId === draft.templateId);
        const dropsTemplate = Boolean(draft.templateId) && chosen?.waBusinessId !== defaultLine.waBusinessId;
        const changed = disconnected || dropsTemplate;
        if (changed) {
            const previous = lineById(draft.lineId);
            setLineNotice({
                reason: disconnected ? 'disconnected' : 'defaultChanged',
                from: previous ? lineLabel(previous) : null,
                to: lineLabel(defaultLine),
                droppedTemplate: dropsTemplate ? draft.templateName : null,
            });
        }
        save({
            ...draft,
            lineId: defaultLine.id,
            ...(dropsTemplate ? NO_TEMPLATE : {}),
            ...(changed ? { step: 2 as const } : {}),
        });
    }, [draft, save, activeLines, defaultLine, lineById, allApproved, linesLoading, linesError, templatesLoading]);

    const templateId = draft?.templateId ?? null;
    const variables = draft?.variables;
    const buttons = draft?.buttons;
    const excludeOptedOut = draft?.excludeOptedOut ?? false;
    const recipients = draft?.recipients;
    const headerMediaId = draft?.headerMedia?.id ?? null;

    // Mientras cargan las líneas, la del borrador tal cual: el backend la resuelve igual.
    const lineId = line?.id ?? draftLineId;
    const previewInput = useMemo((): CampaignDraftInput | null => (
        recipients ? { templateId, variables: variables ?? [], buttons: buttons ?? [], excludeOptedOut, recipients, headerMediaId, lineId } : null
    ), [templateId, variables, buttons, excludeOptedOut, recipients, headerMediaId, lineId]);

    const preview = useCampaignPreview(previewInput);
    const errors = preview.data?.errors ?? [];
    const messageErrors = errors.filter(e => e.field !== 'recipients');

    // La cabecera de esta campaña: un archivo subido aquí, sin tocar el de la
    // plantilla (salvo que se marque la casilla, y eso al crear la campaña).
    const headerUpload = useHeaderMediaUpload(template, media => update({ headerMedia: media, saveHeaderAsDefault: false }));
    const resetHeaderToTemplate = () => update({ headerMedia: null, saveHeaderAsDefault: false });
    const toggleSaveHeaderAsDefault = () => update({ saveHeaderAsDefault: !draft?.saveHeaderAsDefault });

    const applyLine = (next: Line, dropTemplate: boolean) => {
        setPendingLine(null);
        setLineNotice(null);
        if (dropTemplate) {
            setShowErrors(false);
            headerUpload.reset();
        }
        update({ lineId: next.id, ...(dropTemplate ? NO_TEMPLATE : {}) });
    };

    const changeLine = (nextId: string) => {
        const next = lineById(nextId);
        if (!next || next.id === line?.id) return;
        // Entre líneas de la misma cuenta se cambia sin preguntar: la plantilla sirve.
        if (template && template.waBusinessId !== next.waBusinessId) setPendingLine(next);
        else applyLine(next, false);
    };

    const selectTemplate = (next: Template) => {
        if (next.templateId === templateId) return;
        setLineNotice(null);
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
        line, changeLine, pendingLine, lineNotice,
        confirmLineChange: () => pendingLine && applyLine(pendingLine, true),
        cancelLineChange: () => setPendingLine(null),
        templates: approved, templatesLoading, syncTemplates: () => sync(), isSyncing, template, selectTemplate,
        setVariable, setButton, headerTemplate, headerMedia, headerSource,
        headerUpload, resetHeaderToTemplate, toggleSaveHeaderAsDefault,
        preview: preview.data, isPreviewUpdating: preview.isUpdating, previewInput,
        messageErrors, nameMissing, fieldError, showErrors, setShowErrors,
    };
};

export type CampaignWizard = ReturnType<typeof useCampaignWizard>;
