import { Settings as SettingsIcon } from "lucide-react";
import { PageShell, PageHeader } from "../../../components/Page/PageShell";
import { useAuthContext } from "../../../context/auth.context";
import { useLines } from "../../../hooks/useLines";
import { LinesCard } from "./Lines/LinesCard";
import { ApiKeysCard } from "./ApiKeysCard";
import { TeamCard } from "./Team/TeamCard";
import { MyAccessCards } from "./MyAccessCards";

/**
 * Ajustes. Cada rol ve lo suyo (Fase 3): owner y admin gestionan las líneas, el
 * equipo y las API keys; supervisor y agente consultan sus líneas y su acceso.
 */
export const SettingsPage = () => {
    const { isMultiLine } = useLines();
    const { can } = useAuthContext();
    const canManageLines = can('lines.manage');
    const canTeam = can('team.manage');

    const description = !canManageLines
        ? 'Tus líneas y tu acceso a esta cuenta.'
        : canTeam
            ? 'Tus números de WhatsApp, quién entra a la cuenta y las claves de la API.'
            : isMultiLine
                ? 'Conecta tus números de WhatsApp Business y gestiona las claves con las que tus sistemas envían mensajes.'
                : 'Conecta tu número de WhatsApp Business y gestiona las claves con las que tus sistemas envían mensajes.';

    return (
        <PageShell>
            <PageHeader icon={<SettingsIcon size={20} />} title="Ajustes" description={description} />

            <div className="flex flex-col gap-6">
                {canManageLines ? <LinesCard /> : <MyAccessCards />}
                {canTeam && <TeamCard />}
                {can('apiKeys.manage') && (
                    <ApiKeysCard description={isMultiLine
                        ? 'Genera claves para enviar plantillas desde tus sistemas. Envían por la línea por defecto, salvo que indiquen el ID de otra.'
                        : 'Genera claves para enviar plantillas desde tus sistemas mediante la API pública.'} />
                )}
            </div>
        </PageShell>
    );
}
