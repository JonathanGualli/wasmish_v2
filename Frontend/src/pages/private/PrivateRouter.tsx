import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RoutesWithNotFound } from "../../components/RoutersWithNotFound/RoutesWithNotFound";
import { AppRoutes } from "../../models/routes.models";
import { PrivateLayout } from "../../components/Layout/PrivateLayout";
import { QuickStart } from "./QuickStart/QuickStart";
import { SettingsPage } from "./Settings/SettingsPage";
import { ChatPage } from "./Chats/ChatPage";
import { ContactsPage } from "./Contacts/ContactsPage";
import { CampaignsPage } from "./Campaigns/CampaignsPage";
import { NewCampaignPage } from "./Campaigns/NewCampaign/NewCampaignPage";
import { CampaignDetailPage } from "./Campaigns/Detail/CampaignDetailPage";
import { TemplatesPage } from "./Templates/TemplatesPage";
import { DocsPage } from "./Docs/DocsPage";
import { AdminPage } from "./Admin/AdminPage";
import { AutoRepliesPage } from "./AutoReplies/AutoRepliesPage";
import { useAuthContext } from "../../context/auth.context";

// Aparte del resto: trae la lista de países y los formatos de teléfono, que
// solo hacen falta aquí (lo que lee el Excel y el CSV se carga al elegir el archivo).
const ImportContactsPage = lazy(() =>
    import("./Contacts/Import/ImportContactsPage").then(m => ({ default: m.ImportContactsPage })));

// Lo que el rol no puede usar no existe para él (Fase 3): si entra a la ruta a
// mano, o le quitan el permiso con la página abierta, vuelve a Inicio rápido.
const RequirePermission = ({ action, children }: { action: string; children: ReactNode }) => {
    const { can } = useAuthContext();
    return can(action) ? children : <Navigate to={`${AppRoutes.private.root}/${AppRoutes.private.quickStart}`} replace />;
};

export const PrivateRouter = () => {
    const { user } = useAuthContext();

    return (
        <PrivateLayout>
            <RoutesWithNotFound>
                {user?.isSuperadmin && (
                    <Route path={AppRoutes.private.admin} element={<AdminPage />} />
                )}
                <Route path="/" element={<Navigate to={AppRoutes.private.quickStart} />} />
                <Route path={AppRoutes.private.quickStart} element={<QuickStart />} />
                <Route path={AppRoutes.private.settings} element={<SettingsPage />} />
                <Route path={AppRoutes.private.chats} element={<ChatPage />} />
                <Route path={AppRoutes.private.contacts} element={<ContactsPage />} />
                <Route
                    path={`${AppRoutes.private.contacts}/import`}
                    element={<RequirePermission action="contacts.import"><Suspense fallback={null}><ImportContactsPage /></Suspense></RequirePermission>}
                />
                <Route path={AppRoutes.private.campaigns} element={<RequirePermission action="campaigns.manage"><CampaignsPage /></RequirePermission>} />
                <Route path={`${AppRoutes.private.campaigns}/new`} element={<RequirePermission action="campaigns.manage"><NewCampaignPage /></RequirePermission>} />
                <Route path={`${AppRoutes.private.campaigns}/:id`} element={<RequirePermission action="campaigns.manage"><CampaignDetailPage /></RequirePermission>} />
                <Route path={AppRoutes.private.templates} element={<TemplatesPage />} />
                <Route path={AppRoutes.private.autoReplies} element={<RequirePermission action="autoReplies.manage"><AutoRepliesPage /></RequirePermission>} />
                <Route path={AppRoutes.private.docs} element={<DocsPage />} />
            </RoutesWithNotFound>
        </PrivateLayout>

    );
}