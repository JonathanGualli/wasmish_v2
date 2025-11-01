import { Navigate, Route } from "react-router-dom";
import { RoutesWithNotFound } from "../../components/RoutersWithNotFound/RoutesWithNotFound";
import { AppRoutes } from "../../models/routes.models";
import { DashboardPage } from "./DashboardPage/DashboardPage";
import { PrivateLayout } from "../../components/Layout/PrivateLayout";
import { QuickStart } from "./QuickStart/QuickStart";
import { SettingsPage } from "./Settings/SettingsPage";
import { ChatPage } from "./Chats/ChatPage.tsx";

export const PrivateRouter = () => {
    return (
        <PrivateLayout>
            <RoutesWithNotFound>
                <Route path="/" element={<Navigate to={AppRoutes.private.dashboard} />} />
                <Route path={AppRoutes.private.dashboard} element={<DashboardPage />} />
                <Route path={AppRoutes.private.quickStart} element={<QuickStart />} />
                <Route path={AppRoutes.private.settings} element={<SettingsPage />} />
                <Route path={AppRoutes.private.chats} element={<ChatPage />} />
                <Route path={`${AppRoutes.private.chats}/:id`} element={<ChatPage />} />
            </RoutesWithNotFound>
        </PrivateLayout>
        
    );
}