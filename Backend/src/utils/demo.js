// Las cuentas de demostración de `seed:demo` (services/demo.service.js): lo que
// no toca la BD. Los datos de cada cuenta están en scripts/fixtures/demo.scenarios.js.

// La marca de una cuenta de demostración (`Account.plan`): `seed:demo` solo
// borra o rehace una cuenta que la lleva.
export const DEMO_PLAN = 'Demostración';

// Teléfonos inventados (59300077xxxx): no son números de Ecuador y nada sale a
// Meta desde una cuenta de demostración (su número y su token son falsos).
export const demoPhone = (n) => `59300077${String(n).padStart(4, '0')}`;

// Ecuador no cambia de hora: siempre UTC-5.
const ECUADOR_OFFSET_MS = -5 * 3600e3;
const UNIT_MS = { m: 60e3, h: 3600e3, d: 86400e3 };

/**
 * La fecha de una hora del escenario, contada desde `now`: '45m', '3h' y '12d'
 * (hace tanto), o '2d 21:34' (hace 2 días, a esa hora de Ecuador).
 */
export const demoTime = (spec, now) => {
    const clock = /^(\d+)d (\d{2}):(\d{2})$/.exec(spec);
    if (clock) {
        const [, days, hours, minutes] = clock.map(Number);
        // El día de Ecuador de `now`, a medianoche de Ecuador.
        const local = new Date(now.getTime() + ECUADOR_OFFSET_MS);
        const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ECUADOR_OFFSET_MS;
        return new Date(midnight - days * UNIT_MS.d + (hours * 60 + minutes) * UNIT_MS.m);
    }
    const relative = /^(\d+)([mhd])$/.exec(spec);
    if (!relative) throw new Error(`Hora de la demostración no válida: «${spec}»`);
    return new Date(now.getTime() - Number(relative[1]) * UNIT_MS[relative[2]]);
};

export const firstNameOf = (contact) => (contact.name ?? contact.profileName ?? '').split(' ')[0] || 'cliente';

/** El texto de una plantilla con sus valores: `{{1}}` → `values[0]`. */
export const renderDemoBody = (bodyText, values) => bodyText.replace(/\{\{(\d+)\}\}/g, (_, k) => values[Number(k) - 1] ?? '');

/** Los contactos de relleno de un escenario (`bulk`), siempre los mismos. */
export const demoBulkContacts = ({ from, count, first, last, companies, tags }) =>
    Array.from({ length: count }, (_, i) => ({
        key: `bulk${i}`,
        n: from + i,
        // El apellido avanza uno cada vuelta de los nombres: ningún nombre se repite.
        name: `${first[i % first.length]} ${last[(i + Math.floor(i / first.length)) % last.length]}`,
        company: companies[i % companies.length],
        tags: tags[i % tags.length],
    }));

/**
 * Cómo le fue a cada destinatario de la campaña: los últimos `failed`
 * fallaron, los `delivered` de antes quedaron entregados y el resto, leídos.
 */
export const demoCampaignResults = (count, { failed = 0, delivered = 0 }) =>
    Array.from({ length: count }, (_, i) => {
        if (i >= count - failed) return 'failed';
        if (i >= count - failed - delivered) return 'delivered';
        return 'read';
    });

/** Quién recibe la campaña: con alguna de las etiquetas, o con todas si `all`. */
export const demoCampaignRecipients = (contacts, { tags, all = false }) =>
    contacts.filter(c => (all ? tags.every(t => c.tags.includes(t)) : tags.some(t => c.tags.includes(t))));

/**
 * Qué hacer con una cuenta de demostración al sembrarla. `owner`: el usuario
 * con el correo del dueño del escenario (o null); `account`: su cuenta;
 * `agentTaken`: el correo del agente ya es de un usuario de OTRA cuenta.
 * Nunca se borra ni se pisa una cuenta que no lleve la marca.
 */
export const demoSeedAction = ({ owner, account, agentTaken, reset }) => {
    if (owner && account?.plan !== DEMO_PLAN) return { action: 'refuse', reason: 'el correo del dueño es de una cuenta que no es de demostración' };
    if (agentTaken) return { action: 'refuse', reason: 'el correo del agente es de otra cuenta' };
    if (owner && !reset) return { action: 'refuse', reason: 'ya existe: usa --reset para rehacerla' };
    return { action: owner ? 'reset' : 'create' };
};
