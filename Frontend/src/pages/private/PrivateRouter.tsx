import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RoutesWithNotFound } from "../../components/RoutersWithNotFound/RoutesWithNotFound";
import { AppRoutes } from "../../models/routes.models";
import { PrivateLayout } from "../../components/Layout/PrivateLayout";
import { ChatPage } from "./Chats/ChatPage";
import { useAuthContext } from "../../context/auth.context";

// `lazy` pide un export por defecto, y las páginas exportan por nombre.
const lazyPage = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
    lazy(() => load().then(m => ({ default: m[name] })));

// Cada página se descarga al entrar en ella, salvo Chats: es la que más se usa
// y a la que lleva un aviso push, así que va en el paquete principal.
// Importar, además, trae la lista de países y los formatos de teléfono (lo que
// lee el Excel y el CSV se carga al elegir el archivo).
const QuickStart = lazyPage(() => import("./QuickStart/QuickStart"), "QuickStart");
const SettingsPage = lazyPage(() => import("./Settings/SettingsPage"), "SettingsPage");
const ContactsPage = lazyPage(() => import("./Contacts/ContactsPage"), "ContactsPage");
const ImportContactsPage = lazyPage(() => import("./Contacts/Import/ImportContactsPage"), "ImportContactsPage");
const CampaignsPage = lazyPage(() => import("./Campaigns/CampaignsPage"), "CampaignsPage");
const NewCampaignPage = lazyPage(() => import("./Campaigns/NewCampaign/NewCampaignPage"), "NewCampaignPage");
const CampaignDetailPage = lazyPage(() => import("./Campaigns/Detail/CampaignDetailPage"), "CampaignDetailPage");
const TemplatesPage = lazyPage(() => import("./Templates/TemplatesPage"), "TemplatesPage");
const DocsPage = lazyPage(() => import("./Docs/DocsPage"), "DocsPage");
const AdminPage = lazyPage(() => import("./Admin/AdminPage"), "AdminPage");
const AutoRepliesPage = lazyPage(() => import("./AutoReplies/AutoRepliesPage"), "AutoRepliesPage");

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
            {/* Mientras baja una página, la barra se queda y el contenido en
                blanco; al cambiar de página, la navegación (una transición)
                mantiene la anterior a la vista hasta que la nueva está lista. */}
            <Suspense fallback={null}>
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
                        element={<RequirePermission action="contacts.import"><ImportContactsPage /></RequirePermission>}
                    />
                    <Route path={AppRoutes.private.campaigns} element={<RequirePermission action="campaigns.manage"><CampaignsPage /></RequirePermission>} />
                    <Route path={`${AppRoutes.private.campaigns}/new`} element={<RequirePermission action="campaigns.manage"><NewCampaignPage /></RequirePermission>} />
                    <Route path={`${AppRoutes.private.campaigns}/:id`} element={<RequirePermission action="campaigns.manage"><CampaignDetailPage /></RequirePermission>} />
                    <Route path={AppRoutes.private.templates} element={<TemplatesPage />} />
                    <Route path={AppRoutes.private.autoReplies} element={<RequirePermission action="autoReplies.manage"><AutoRepliesPage /></RequirePermission>} />
                    <Route path={AppRoutes.private.docs} element={<DocsPage />} />
                </RoutesWithNotFound>
            </Suspense>
        </PrivateLayout>

    );
}