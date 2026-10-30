export const AppRoutes = {
    login: '/login',
    register: '/register',
    // Aceptar una invitación al equipo (Fase 3): pública, con el token en la ruta.
    invite: '/invite',
    private: {
        root: '/private',
        quickStart: 'quickStart',
        settings: 'settings',
        chats: 'chats',
        contacts: 'contacts',
        campaigns: 'campaigns',
        templates: 'templates',
        autoReplies: 'auto-replies',
        docs: 'docs',
        admin: 'admin',
    }
}
/** Lo que el `PrivateGuard` le pasa al login: a dónde se iba sin sesión. */
export interface LoginNavigationState {
    from?: string;
}

/** A dónde ir después de entrar: lo que se pedía, si es una página privada; si no, el inicio. */
export const afterLoginPath = (state: unknown) => {
    const from = (state as LoginNavigationState | null)?.from;
    // Solo rutas propias: nada de URLs de fuera ni `//otro-sitio`.
    return typeof from === 'string' && from.startsWith(`${AppRoutes.private.root}/`)
        ? from
        : `${AppRoutes.private.root}/${AppRoutes.private.quickStart}`;
};

const privatePath = (path: string) => `${AppRoutes.private.root}/${path}`;

/** Rutas completas de Campañas, para navegar a ellas. */
export const CampaignPaths = {
    list: privatePath(AppRoutes.private.campaigns),
    create: privatePath(`${AppRoutes.private.campaigns}/new`),
    detail: (id: string) => privatePath(`${AppRoutes.private.campaigns}/${id}`),
};

export const ContactsPath = privatePath(AppRoutes.private.contacts);
export const ContactImportPath = privatePath(`${AppRoutes.private.contacts}/import`);
export const ChatsPath = privatePath(AppRoutes.private.chats);
export const SettingsPath = privatePath(AppRoutes.private.settings);
export const TemplatesPath = privatePath(AppRoutes.private.templates);
export const AutoRepliesPath = privatePath(AppRoutes.private.autoReplies);
