import { Settings as SettingsIcon } from "lucide-react";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { useLines } from "../../../hooks/useLines";
import { LinesCard } from "./Lines/LinesCard";
import { ApiKeysCard } from "./ApiKeysCard";

export const SettingsPage = () => {
    const { isMultiLine } = useLines();

    return (
        <PageShell>
            <PageHeader
                icon={<SettingsIcon size={20} />}
                title="Ajustes"
                description={isMultiLine
                    ? 'Conecta tus números de WhatsApp Business y gestiona las claves con las que tus sistemas envían mensajes.'
                    : 'Conecta tu número de WhatsApp Business y gestiona las claves con las que tus sistemas envían mensajes.'}
            />

            <div className="flex flex-col gap-6">
                <LinesCard />
                <ApiKeysCard description={isMultiLine
                    ? 'Genera claves para enviar plantillas desde tus sistemas. Envían por la línea por defecto, salvo que indiquen el ID de otra.'
                    : 'Genera claves para enviar plantillas desde tus sistemas mediante la API pública.'} />
            </div>
        </PageShell>
    );
}
