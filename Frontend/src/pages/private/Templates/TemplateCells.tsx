import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Pill } from "../../../components/Pill/Pill";
import { CategoryPill } from "../../../components/Chat/TemplateFields";
import type { Template } from "../../../models/template.model";
import { templateDetailPath } from "../../../models/routes.models";
import { languageName, templateStatusWords } from "../../../utils/templateDisplay";
import { TemplateLinesCell } from "./TemplateLinesCell";

/** La píldora de estado, corta: «Borrada en Meta» manda sobre el último estado. */
export const TemplateStatusPill = ({ template }: { template: Template }) => {
    const status = templateStatusWords(template);
    return <Pill tone={status.tone}>{status.short}</Pill>;
};

/**
 * Subir, cambiar o quitar el archivo no abre la fila. Los diálogos que abre
 * van en un portal, pero sus clics también suben por aquí (React los lleva
 * por el árbol de componentes), así que tampoco la abren.
 */
export const StopRowClick = ({ children }: { children: ReactNode }) => (
    <div onClick={event => event.stopPropagation()}>{children}</div>
);

/**
 * El nombre, como enlace al detalle: la fila entera se abre con el ratón, pero
 * con el teclado solo se llega a un enlace (revisión de Codex del PR #196). El
 * clic no sube a la fila, que navegaría otra vez.
 */
const TemplateNameLink = ({ template, className }: { template: Template; className: string }) => (
    <Link to={templateDetailPath(template.templateId)} onClick={event => event.stopPropagation()} title={template.name}
        className={`block truncate font-mono font-medium rounded-[3px] hover:underline
            focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-accent-soft
            ${template.deletedInMetaAt ? 'text-brand-muted' : 'text-brand-text'} ${className}`}>
        {template.name}
    </Link>
);

/** El nombre (lo que se copia a la API) con su ID debajo, los dos en mono. */
export const TemplateNameCell = ({ template }: { template: Template }) => (
    <div className="min-w-[150px] max-w-[170px]">
        <TemplateNameLink template={template} className="text-[13px]" />
        <div className="font-mono text-[11.5px] text-brand-subtle tabular-nums mt-0.5">{template.templateId}</div>
    </div>
);

/** En el teléfono, cada plantilla como tarjeta: la tabla no cabe a 390 px. */
export const TemplateMobileRow = ({ template, showLines }: { template: Template; showLines: boolean }) => (
    <div className="grid gap-2 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
                <TemplateNameLink template={template} className="text-[13.5px]" />
                <div className="font-mono text-[11.5px] text-brand-subtle tabular-nums mt-0.5">{template.templateId}</div>
            </div>
            <TemplateStatusPill template={template} />
        </div>
        <div className="text-[13.5px] leading-[1.45] text-brand-muted line-clamp-2">{template.bodyText}</div>
        <div className="flex flex-wrap items-center gap-2">
            <CategoryPill category={template.category} />
            <span className="text-[12.5px] text-brand-muted">{languageName(template.language)}</span>
            {showLines && <TemplateLinesCell template={template} />}
        </div>
    </div>
);
