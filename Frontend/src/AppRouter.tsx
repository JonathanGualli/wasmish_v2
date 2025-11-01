import { BrowserRouter, Navigate, Route } from "react-router-dom";
import { RoutesWithNotFound } from "./components/RoutersWithNotFound/RoutesWithNotFound";
import { AppRoutes } from "./models/routes.models";
import { LoginPage } from "./pages/public/LoginPage/LoginPage";
import { PrivateGuard } from "./guard/PrivateGuard";
import { PrivateRouter } from "./pages/private/PrivateRouter";
import { SignUpPage } from "./pages/public/SignUpPage/SignUpPage";

export const AppRouter = () => {
    return (
        <BrowserRouter>
            <RoutesWithNotFound>
                <Route path="/" element={<Navigate to={AppRoutes.private.root} />} />
                <Route path={AppRoutes.login} element={<LoginPage />} />
                <Route path={AppRoutes.register} element={<SignUpPage/>}></Route>
                <Route element={< PrivateGuard />}>
                    <Route path={`${AppRoutes.private.root}/*`} element={<PrivateRouter/>}/>
            </ Route>
            </RoutesWithNotFound>
        </BrowserRouter>
    );
}
