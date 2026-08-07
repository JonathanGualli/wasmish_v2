import { Navigate, Route } from "react-router-dom";
import { RoutesWithNotFound } from "../../components/RoutersWithNotFound/RoutesWithNotFound";
import { AppRoutes } from "../../models/routes.models";
import { PrivateLayout } from "../../components/Layout/PrivateLayout";
import { QuickStart } from "./QuickStart/QuickStart";
import { SettingsPage } from "./Settings/SettingsPage";
import { ChatPage } from "./Chats/ChatPage";
import { TemplatesPage } from "./Templates/TemplatesPage";
import { DocsPage } from "./Docs/DocsPage";

export const PrivateRouter = () => {
    return (
        <PrivateLayout>
            <RoutesWithNotFound>
                <Route path="/" element={<Navigate to={AppRoutes.private.quickStart} />} />
                <Route path={AppRoutes.private.quickStart} element={<QuickStart />} />
                <Route path={AppRoutes.private.settings} element={<SettingsPage />} />
                <Route path={AppRoutes.private.chats} element={<ChatPage />} />
                <Route path={AppRoutes.private.templates} element={<TemplatesPage />} />
                <Route path={AppRoutes.private.docs} element={<DocsPage />} />
            </RoutesWithNotFound>
        </PrivateLayout>

    );
}