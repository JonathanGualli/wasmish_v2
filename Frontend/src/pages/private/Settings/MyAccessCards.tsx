import { useAuthContext } from "../../../context/auth.context";
import { useLines } from "../../../hooks/useLines";
import { LineSwatch } from "../../../components/Line/LineSwatch";
import { lineLabel, lineNumber } from "../../../utils/lineDisplay";
import { ROLE_LABEL } from "../../../utils/roleDisplay";
import { SettingsCard } from "./SettingsCard";
import { LINE_SWATCH_SKELETON, SettingsListSkeleton } from "./SettingsListSkeleton";

/** «Jonathan Gualli (owner) o a Ana Pérez (admin)»: a quién pedirle más acceso. */
const managersText = (managers: { name: string; role: string }[]) => {
    const names = managers.map(manager => `${manager.name} (${manager.role})`);
    if (names.length <= 1) return names[0] ?? 'un administrador';
    return `${names.slice(0, -1).join(', ')} o a ${names[names.length - 1]}`;
};

/**
 * Los Ajustes de quien no gestiona las líneas (supervisor y agente, Fase 3;
 * diseño: «Wasmish Equipo», marco 4f): sus líneas, para consultar, y su acceso.
 */
export const MyAccessCards = () => {
    const { user } = useAuthContext();
    const { activeLines, colorOf, isLoading } = useLines();
    const managers = user?.account?.managers ?? [];

    return (
        <>
            <SettingsCard>
                <div className="grid gap-[18px]">
                    <div>
                        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-brand-text">Tus líneas</h2>
                        <p className="mt-1 text-sm leading-[1.5] text-brand-muted">
                            Ves las conversaciones de estas líneas. Las conecta y gestiona un admin.
                        </p>
                    </div>
                    {isLoading ? (
                        <SettingsListSkeleton label="Cargando las líneas" rows={3}
                            avatar={LINE_SWATCH_SKELETON} pillBelow rowClassName="px-[18px] py-[15px] max-sm:px-3.5" />
                    ) : activeLines.length === 0 ? (
                        <p className="text-sm text-brand-gray-600">Todavía no tienes ninguna línea asignada.</p>
                    ) : (
                        <div className="rounded-[10px] border border-brand-border overflow-hidden divide-y divide-brand-raised">
                            {activeLines.map(line => (
                                <div key={line.id} className="flex items-center gap-3.5 bg-brand-surface px-[18px] py-[15px] max-sm:px-3.5">
                                    <LineSwatch colorClass={colorOf(line.id)} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[15px] font-semibold text-brand-text break-words">{lineLabel(line)}</div>
                                        <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[13px] text-brand-muted">
                                            <span className="font-mono text-brand-gray-600">{lineNumber(line)}</span>
                                            {line.verifiedName && line.verifiedName !== lineLabel(line) && (
                                                <span>En WhatsApp: <span className="text-brand-strong">{line.verifiedName}</span></span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="max-sm:hidden flex-none inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-accent-strong">
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-success" />Conectada
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SettingsCard>

            <SettingsCard>
                <div className="grid gap-4">
                    <h2 className="text-[17px] font-bold tracking-[-0.01em] text-brand-text">Tu acceso</h2>
                    <dl className="grid gap-4 sm:grid-cols-3 rounded-[10px] bg-brand-bg px-4 py-3.5">
                        {[
                            { label: 'Rol', value: user?.role ? ROLE_LABEL[user.role] : '—' },
                            { label: 'Cuenta', value: user?.account?.name ?? '—' },
                            { label: 'Correo', value: user?.email ?? '—' },
                        ].map(fact => (
                            <div key={fact.label} className="min-w-0">
                                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{fact.label}</dt>
                                <dd className="mt-1 text-sm font-medium text-brand-text break-words">{fact.value}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-[13.5px] leading-[1.55] text-brand-gray-600">
                        Para ver otra línea o cambiar tu rol, pídeselo a {managersText(managers)}.
                    </p>
                </div>
            </SettingsCard>
        </>
    );
};
