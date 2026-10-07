import type { ReactNode } from "react";
import { Send } from "lucide-react";
import { WizardHeader } from "../../../../components/Wizard/WizardHeader";
import { CampaignPaths } from "../../../../models/routes.models";
import { CAMPAIGN_STEPS, type CampaignDraft } from "../../../../utils/campaignDraft";

/**
 * Migas, título y pasos de «Nueva campaña». Lo comparten el asistente y
 * Contactos cuando elige los destinatarios: así elegirlos se ve como el paso 1
 * de la campaña y no como otra sección.
 */
export const CampaignWizardHeader = ({ step, description, aside }: {
    step: CampaignDraft['step'];
    description: string;
    /** A la derecha de los pasos: «Borrador guardado», «Cancelar». */
    aside?: ReactNode;
}) => (
    <WizardHeader
        parent={{ label: 'Campañas', to: CampaignPaths.list }}
        title="Nueva campaña"
        icon={<Send size={20} />}
        description={description}
        steps={CAMPAIGN_STEPS}
        step={step}
        aside={aside}
    />
);
