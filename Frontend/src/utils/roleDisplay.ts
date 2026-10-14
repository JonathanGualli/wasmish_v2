import type { AccountRole, User } from "../models/user.mode";

/** El nombre de cada rol de la cuenta (Fase 3), como lo dice la UI. */
export const ROLE_LABEL: Record<AccountRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    supervisor: 'Supervisor',
    agent: 'Agente',
};

/** Hay más de una persona en la cuenta: la UI enseña el rol y quién respondió. */
export const hasTeam = (user: User | null | undefined) => (user?.account?.memberCount ?? 1) > 1;
