import { useState } from "react";
import { useTemplates } from "../../../hooks/useTemplates";
import { DataTable } from "../../../components/DataTable/DataTable";
import { CustomButton } from "../../../components/Button/Button";
import { templateColumns } from "./TemplateColumns";

export const TemplatesPage = () => {

    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 10,
    });

    const { templates, isLoading, isSyncing, sync } = useTemplates();

    return (
        <div className="m-6 p-6 rounded-xl shadow bg-white">
            <div className="flex flex-row gap-8 justify-between mb-5">
                <h1 className="flex items-center text-xl font-semibold">Plantillas</h1>
                <div className="flex justify-end h-10 min-w-50">
                    <CustomButton isLoading={isSyncing} onClick={sync} type="button">Actualizar Plantillas</CustomButton>
                </div>
            </div>
            <DataTable
                data={templates}
                columns={templateColumns}
                totalCount={templates.length}
                pagination={pagination}
                setPagination={setPagination}
                isLoading={isLoading || isSyncing}
            ></DataTable>
        </div>
    );
}