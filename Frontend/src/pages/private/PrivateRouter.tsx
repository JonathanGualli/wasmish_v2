import { lazy, Suspense } from "react";
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
import { useAuthContext } from "../../context/auth.context";

// Aparte del resto: trae la lista de países y los formatos de teléfono, que
// solo hacen falta aquí (lo que lee el Excel y el CSV se carga al elegir el archivo).
const ImportContactsPage = lazy(() =>
    import("./Contacts/Import/ImportContactsPage").then(m => ({ default: m.ImportContactsPage })));

export const PrivateRouter = () => {
    const { user } = useAuthContext();

    return (
        <PrivateLayout>
            <RoutesWithNotFound>
                {user?.rol === 'superadmin' && (
                    <Route path={AppRoutes.private.admin} element={<AdminPage />} />
                )}
                <Route path="/" element={<Navigate to={AppRoutes.private.quickStart} />} />
                <Route path={AppRoutes.private.quickStart} element={<QuickStart />} />
                <Route path={AppRoutes.private.settings} element={<SettingsPage />} />
                <Route path={AppRoutes.private.chats} element={<ChatPage />} />
                <Route path={AppRoutes.private.contacts} element={<ContactsPage />} />
                <Route
                    path={`${AppRoutes.private.contacts}/import`}
                    element={<Suspense fallback={null}><ImportContactsPage /></Suspense>}
                />
                <Route path={AppRoutes.private.campaigns} element={<CampaignsPage />} />
                <Route path={`${AppRoutes.private.campaigns}/new`} element={<NewCampaignPage />} />
                <Route path={`${AppRoutes.private.campaigns}/:id`} element={<CampaignDetailPage />} />
                <Route path={AppRoutes.private.templates} element={<TemplatesPage />} />
                <Route path={AppRoutes.private.docs} element={<DocsPage />} />
            </RoutesWithNotFound>
        </PrivateLayout>

    );
}