import { useState } from "react";
import { useNotice } from "../components/Notice/context/useNotice";
import type { Template } from "../models/template.model";
import { getTemplatesUsageService } from "../services/api.service";
import { downloadFile } from "../utils/download";
import { templateExportColumns, templateExportFileName, templateExportRows } from "../utils/templateExport";
import { useLines } from "./useLines";

/**
 * «Descargar Excel» en Plantillas: pide el uso de todas al pulsar (no se
 * guarda: las cifras son las de ese momento), carga `write-excel-file` solo
 * entonces y baja el `.xlsx` de las plantillas que se le pasan (las que se
 * ven con los filtros puestos).
 */
export const useTemplatesExport = () => {
    const [isExporting, setIsExporting] = useState(false);
    const { notify } = useNotice();
    const { lines } = useLines();

    const exportTemplates = async (templates: Template[]) => {
        setIsExporting(true);
        try {
            const [data, { default: writeXlsxFile }] = await Promise.all([
                getTemplatesUsageService(),
                import('write-excel-file/browser'),
            ]);
            const rows = templateExportRows(templates, data, lines);
            const blob = await writeXlsxFile(rows, {
                columns: templateExportColumns(data.campaigns !== undefined),
                sheet: 'Plantillas',
                stickyRowsCount: 1,
            }).toBlob();
            downloadFile(blob, templateExportFileName(new Date()));
        } catch (error) {
            console.error('No se pudo preparar el Excel de plantillas:', error);
            notify({ kind: 'error', text: 'No se pudo preparar el Excel. Inténtalo de nuevo.' });
        } finally {
            setIsExporting(false);
        }
    };

    return { exportTemplates, isExporting };
};
