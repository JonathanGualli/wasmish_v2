import { useMemo, useState } from "react";
import type { AxiosError } from "axios";
import { useTemplates } from "./useTemplates";
import { extractPlaceholders, isPositional, buttonsNeedingValue } from "../utils/templatePlaceholders";
import type { Template, TemplateButtonParam } from "../models/template.model";
import { templateHeaderIssue } from "../utils/templateHeader";
import { whatsappErrorLabel } from "../utils/whatsappErrors";

interface ErrorItem { message: string; errorCode?: string | null; errorDetail?: string | null }

interface InitialValues {
    templateName?: string;
    values?: Record<string, string>;
    buttonValues?: Record<number, string>;
}

/**
 * Estado del formulario de envío de plantilla: cuál se eligió, los valores del
 * cuerpo y los de los botones. Lo comparten el diálogo de la ventana cerrada
 * (`SendTemplateDialog`) y la conversación nueva (`NewConversationPanel`), que
 * lo arranca con lo que tenía guardado el borrador.
 */
export const useTemplateForm = (initial?: InitialValues) => {
    const { templates, isLoading } = useTemplates();

    const [selectedName, setSelectedName] = useState(initial?.templateName ?? '');
    const [values, setValues] = useState<Record<string, string>>(initial?.values ?? {});
    const [buttonValues, setButtonValues] = useState<Record<number, string>>(initial?.buttonValues ?? {});

    // Solo las aprobadas se pueden enviar; el resto Meta las rechaza.
    const approved = useMemo(
        () => (templates as Template[]).filter(t => t.status === 'APPROVED'),
        [templates],
    );

    const selected = useMemo(
        () => approved.find(t => t.name === selectedName),
        [approved, selectedName],
    );

    const placeholders = useMemo(
        () => extractPlaceholders(selected?.bodyText),
        [selected],
    );

    // Una plantilla de OTP, de cupón o con URL dinámica no se puede enviar sin el
    // valor de su botón: Meta la rechaza. Los pedimos aquí en vez de fallar luego.
    const buttonFields = useMemo(
        () => buttonsNeedingValue(selected?.buttons),
        [selected],
    );

    // Cambiar de plantilla invalida lo escrito: los marcadores son otros.
    const selectTemplate = (name: string) => {
        setSelectedName(name);
        setValues({});
        setButtonValues({});
    };

    const missing = placeholders.filter(p => !values[p]?.trim()).length
        + buttonFields.filter(({ index }) => !buttonValues[index]?.trim()).length;

    /** Lo que espera el backend. Solo tiene sentido con `selected` y sin `missing`. */
    const buildPayload = () => {
        // Los posicionales van ordenados por su número ({{2}} después de {{1}});
        // los nombrados llevan su nombre, que es como Meta los identifica.
        const parameters = isPositional(placeholders)
            ? [...placeholders].sort((a, b) => Number(a) - Number(b)).map(p => values[p].trim())
            : placeholders.map(p => ({ name: p, value: values[p].trim() }));

        // El backend deduce el sub_type de la definición guardada; aquí solo va el
        // índice del botón y su valor.
        const buttons: TemplateButtonParam[] = buttonFields.map(({ index }) => ({
            index,
            parameters: [buttonValues[index].trim()],
        }));

        return { templateName: selected!.name, language: selected!.language, parameters, buttons };
    };

    // Una plantilla con la cabecera sin archivo no sale en los selectores, pero
    // puede venir elegida de un borrador anterior.
    const headerIssue = selected ? templateHeaderIssue(selected) : null;

    return {
        // `selectedName` es lo elegido aunque la plantilla aún no haya cargado
        // (o ya no esté aprobada); `selected` solo existe cuando sí. El borrador
        // guarda el primero: con el segundo, al montarse con las plantillas
        // cargando, se borraría lo que tenía guardado.
        selectedName,
        approved, isLoading, selected, placeholders, buttonFields,
        values, setValues, buttonValues, setButtonValues,
        selectTemplate, missing, headerIssue,
        reset: () => selectTemplate(''),
        buildPayload,
    };
};

export type TemplateForm = ReturnType<typeof useTemplateForm>;

/**
 * El error del envío en una frase. Si fue WhatsApp quien lo rechazó (502), el
 * motivo en palabras y su código; si no conocemos el código, el detalle que
 * mandó Meta. Lo demás (400 de validación, 409 sin WhatsApp) ya viene en español.
 */
export const templateSendError = (err: unknown) => {
    const data = (err as AxiosError<ErrorItem[] | ErrorItem>).response?.data;
    const first = Array.isArray(data) ? data[0] : data;
    if (first?.errorCode) {
        const label = whatsappErrorLabel(first.errorCode);
        return label
            ? `WhatsApp rechazó el mensaje: ${label} (código ${first.errorCode}).`
            : `WhatsApp rechazó el mensaje (código ${first.errorCode})${first.errorDetail ? `: ${first.errorDetail}` : '.'}`;
    }
    return first?.message ?? 'No se pudo enviar la plantilla. Inténtalo de nuevo.';
};
