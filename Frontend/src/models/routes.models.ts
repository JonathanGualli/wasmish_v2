export const AppRoutes = {
    login: '/login',
    register: '/register',
    private: {
        root: '/private',
        dashboard: 'dashboard',
        quickStart: 'quickStart',
        settings: 'settings',
        chats: 'chats',
        contacts: 'contacts',
        campaigns: 'campaigns',
        templates: 'templates',
        docs: 'docs',
        admin: 'admin',
    }
}
const privatePath = (path: string) => `${AppRoutes.private.root}/${path}`;

/** Rutas completas de Campañas, para navegar a ellas. */
export const CampaignPaths = {
    list: privatePath(AppRoutes.private.campaigns),
    create: privatePath(`${AppRoutes.private.campaigns}/new`),
    detail: (id: string) => privatePath(`${AppRoutes.private.campaigns}/${id}`),
};

export const ContactsPath = privatePath(AppRoutes.private.contacts);
export const ChatsPath = privatePath(AppRoutes.private.chats);
export const SettingsPath = privatePath(AppRoutes.private.settings);
export const TemplatesPath = privatePath(AppRoutes.private.templates);
