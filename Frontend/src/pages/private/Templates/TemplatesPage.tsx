import { useState } from "react";
import { AlertTriangle, LayoutTemplate, RefreshCw } from "lucide-react";
import { useTemplates } from "../../../hooks/useTemplates";
import { DataTable } from "../../../components/DataTable/DataTable";
import { CustomButton } from "../../../components/Button/Button";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { templateColumns } from "./TemplateColumns";
import { Callout } from "../../../components/Callout/Callout"

export const TemplatesPage = () => {
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
    const { templates, isLoading, isSyncing, sync, syncError } = useTemplates();

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
