import type { Template } from "../models/template.model";

/**
 * Si se puede enviar: aprobada por Meta y no borrada allí después. Las borradas
 * siguen en la lista de Plantillas, pero ningún selector las ofrece.
 */
export const isSendableTemplate = (template: Template) =>
    template.status === 'APPROVED' && !template.deletedInMetaAt;
