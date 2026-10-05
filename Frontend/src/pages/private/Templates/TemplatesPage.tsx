import { useState } from "react";
import { AlertTriangle, ImageUp, LayoutTemplate, RefreshCw } from "lucide-react";
import { useTemplates } from "../../../hooks/useTemplates";
import { DataTable } from "../../../components/DataTable/DataTable";
import { CustomButton } from "../../../components/Button/Button";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { templateColumns } from "./TemplateColumns";
import { Callout } from "../../../components/Callout/Callout"
import { headerMediaRule } from "../../../utils/templateHeader";

export const TemplatesPage = () => {
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
    const { templates, isLoading, isSyncing, sync, syncError } = useTemplates();
    const missingMedia = templates.filter(t => headerMediaRule(t) && !t.headerMedia).length;

    return (
        <PageShell width="wide">
            <PageHeader
                icon={<LayoutTemplate size={20} />}
                title="Plantillas"
                description="Las plantillas aprobadas por Meta que tienes disponibles para enviar. Sincroniza para traer los cambios más recientes."
                actions={
                    <div className="w-full sm:w-[220px] h-10">
                        <CustomButton isLoading={isSyncing} onClick={() => sync()} type="button">
                            <RefreshCw size={16} /> Sincronizar
                        </CustomButton>
                    </div>
                }
            />
            {syncError && (
                <div className="mb-6">
                    <Callout tone="danger" icon={<AlertTriangle size={16} />} title="No se pudo sincronizar">
                        {syncError}
                    </Callout>
                </div>
            )}  
            {missingMedia > 0 && (
                <div className="mb-6">
                    <Callout tone="warning" icon={<ImageUp size={16} />}
                        title={missingMedia === 1
                            ? 'Una plantilla no se puede enviar hasta que subas el archivo de su cabecera.'
                            : `${missingMedia} plantillas no se pueden enviar hasta que subas el archivo de su cabecera.`}>
                        WhatsApp aprueba que la cabecera lleve una imagen (o un vídeo, o un documento), pero no cuál:
                        el archivo va en cada envío. Sube el que quieras usar en la columna «Cabecera»; puedes cambiarlo cuando quieras.
                    </Callout>
                </div>
            )}
            <DataTable
                data={templates}
                columns={templateColumns}
                totalCount={templates.length}
                pagination={pagination}
                setPagination={setPagination}
                isLoading={isLoading || isSyncing}
            />
        </PageShell>
    );
};
