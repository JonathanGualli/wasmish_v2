import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Copy, Check, Trash2, KeyRound, Plug, ChevronRight, AlertTriangle } from "lucide-react";
import type { AxiosError } from "axios";
import { CustomButton } from "../../../components/Button/Button";
import { CustomInput } from "../../../components/Input/Input";
import { Callout } from "../../../components/Callout/Callout";
import { PageShell, PageHeader, SectionTitle } from "../../../components/Page/PageShell";
import { useUpdateWhatsappToken } from "../../../hooks/useUpdateWhatsappToken";
import { useAuthContext } from "../../../context/auth.context";
import { useModalContext } from "../../../components/Modal/context/UseModalContext";
import { useApiKey } from "../../../hooks/useApiKey";
import { useConnectWhatsapp } from "../../../hooks/useConnectWhatsapp";
import type { ApiKey } from "../../../models/apikey.model";

interface ErrorItem {
  message: string;
}

/** Tarjeta de sección — el lenguaje de card del manual: borde, sin sombra. */
const Card = ({ children }: { children: React.ReactNode }) => (
    <section className="rounded-xl border border-brand-border bg-brand-surface p-6">
        {children}
    </section>
);

export const SettingsPage = () => {

    const [token, setToken] = useState('');
    const [phoneNumberId, setPhoneNumberId] = useState('');
    const [waBusinessId, setWaBusinessId] = useState('');
    const connectWhatsapp = useConnectWhatsapp();

    const updateTokenWhatsappMutation = useUpdateWhatsappToken();
    const { user } = useAuthContext();
    const { setState, setContent } = useModalContext();

    const { apiKeys, isLoading: apiKeysLoading, generate, revoke } = useApiKey();
    const [apiKeyName, setApiKeyName] = useState('');
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isConnected = Boolean(user?.phoneNumberId);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateTokenWhatsappMutation.mutate({ tokenWhatsapp: token, phoneNumberId: phoneNumberId, waBusinessId: waBusinessId }, {
            onSuccess: () => {
                setContent(<div className="text-brand-accent-strong"><p>Token de WhatsApp actualizado correctamente.</p></div>);
                setState(true);
                user!.tokenWhatsapp = token;
                user!.phoneNumberId = phoneNumberId;
                user!.waBusinessId = waBusinessId;
            }, onError: (error: Error) => {
                setContent(
                    <div className="text-brand-danger">
                        {(error as AxiosError<ErrorItem[]>).response?.data.map((err, i) => (
                            <p key={i}>{err.message}</p>
                        )) || <p>Ha ocurrido un error, inténtalo de nuevo más tarde</p>}
                    </div>)
                setState(true);
            }
        });
    }

    const handleGenerateKey = () => {
        if (!apiKeyName.trim()) return;
        generate.mutate(apiKeyName.trim(), {
            onSuccess: (data) => {
                setNewKey((data as { key: string }).key);
                setCopied(false);
                setApiKeyName('');
            },
            onError: (error: Error) => {
                setContent(
                    <div className="text-brand-danger">
                        {(error as AxiosError<ErrorItem[]>).response?.data?.map((err, i) => (
                            <p key={i}>{err.message}</p>
                        )) || <p>No se pudo generar la API key.</p>}
                    </div>)
                setState(true);
            }
        });
    }

    const handleCopyKey = async () => {
        if (!newKey) return;
        await navigator.clipboard.writeText(newKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    useEffect(() => {
        if (user?.tokenWhatsapp) setToken(user.tokenWhatsapp);
        if (user?.phoneNumberId) setPhoneNumberId(user.phoneNumberId);
        if (user?.waBusinessId) setWaBusinessId(user.waBusinessId);
    }, [user]);

    useEffect(() => {
        if (connectWhatsapp.isSuccess) {
            setContent(<div className="text-brand-accent-strong"><p>WhatsApp conectado correctamente.</p></div>);
            setState(true);
        }
    }, [connectWhatsapp.isSuccess]);

    useEffect(() => {
        if (connectWhatsapp.isError) {
            setContent(<div className="text-brand-danger"><p>No se pudo conectar WhatsApp. Intenta de nuevo.</p></div>);
            setState(true);
        }
    }, [connectWhatsapp.isError]);

    return (
        <PageShell>
            <PageHeader
                icon={<SettingsIcon size={20} />}
                title="Ajustes"
                description="Conecta tu número de WhatsApp Business y gestiona las claves con las que tus sistemas envían mensajes."
            />

            <div className="flex flex-col gap-6">

                {/* ── WhatsApp ── */}
                <Card>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <SectionTitle
                            className="mb-0"
                            description="Vincula tu cuenta iniciando sesión con Facebook. Las credenciales se configuran solas."
                        >
                            WhatsApp Business
                        </SectionTitle>

                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5
                            text-[11px] font-bold uppercase tracking-[0.05em] flex-none
                            ${isConnected
                                ? 'bg-brand-accent-soft text-brand-accent-strong'
                                : 'bg-brand-raised text-brand-muted'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full
                                ${isConnected ? 'bg-brand-success' : 'bg-brand-subtle'}`} />
                            {isConnected ? 'Conectado' : 'Sin conectar'}
                        </span>
                    </div>

                    <div className="mt-5 w-full sm:w-[240px] h-10">
                        <CustomButton
                            type="button"
                            onClick={() => connectWhatsapp.connect()}
                            isLoading={connectWhatsapp.isPending}
                        >
                            <Plug size={16} />
                            {isConnected ? 'Volver a conectar' : 'Conectar WhatsApp'}
                        </CustomButton>
                    </div>

                    {isConnected && (
                        <dl className="mt-6 grid gap-4 sm:grid-cols-2 border-t border-brand-border pt-5">
                            <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">
                                    ID de teléfono
                                </dt>
                                <dd className="font-mono text-[13px] text-brand-text mt-1 break-all">
                                    {user?.phoneNumberId}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">
                                    WhatsApp Business ID
                                </dt>
                                <dd className="font-mono text-[13px] text-brand-text mt-1 break-all">
                                    {user?.waBusinessId || '—'}
                                </dd>
                            </div>
                        </dl>
                    )}

                    {/* Carga manual — la vía antigua, plegada para no competir
                        con el Embedded Signup, que es el camino principal. */}
                    <details className="group mt-6 border-t border-brand-border pt-5">
                        <summary className="flex items-center gap-1.5 cursor-pointer list-none
                            text-sm font-semibold text-brand-gray-600 hover:text-brand-text transition-colors">
                            <ChevronRight size={16} className="transition-transform group-open:rotate-90" />
                            Cargar credenciales a mano
                        </summary>

                        <form onSubmit={handleSubmit} className="grid gap-[18px] mt-5">
                            <CustomInput
                                label="Token de acceso a WhatsApp"
                                type="text"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                            />
                            <div className="grid gap-[18px] sm:grid-cols-2">
                                <CustomInput
                                    label="ID de teléfono de WhatsApp"
                                    type="text"
                                    value={phoneNumberId}
                                    onChange={(e) => setPhoneNumberId(e.target.value)}
                                />
                                <CustomInput
                                    label="ID de WhatsApp Business"
                                    type="text"
                                    value={waBusinessId}
                                    onChange={(e) => setWaBusinessId(e.target.value)}
                                />
                            </div>
                            <div className="w-full sm:w-40 h-10 sm:justify-self-end">
                                <CustomButton variant="secondary" type="submit" isLoading={updateTokenWhatsappMutation.isPending}>
                                    Guardar
                                </CustomButton>
                            </div>
                        </form>
                    </details>
                </Card>

                {/* ── API Keys ── */}
                <Card>
                    <SectionTitle description="Genera claves para enviar plantillas desde tus sistemas mediante la API pública.">
                        API keys
                    </SectionTitle>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                        <div className="flex-1">
                            <CustomInput
                                label="Nombre de la key"
                                type="text"
                                placeholder="produccion"
                                value={apiKeyName}
                                onChange={(e) => setApiKeyName(e.target.value)}
                            />
                        </div>
                        <div className="w-full sm:w-40 h-10">
                            <CustomButton type="button" isLoading={generate.isPending} onClick={handleGenerateKey}>
                                <KeyRound size={16} /> Generar
                            </CustomButton>
                        </div>
                    </div>

                    {/* Key recién generada — se muestra una sola vez */}
                    {newKey && (
                        <div className="mt-5">
                            <Callout
                                tone="warning"
                                icon={<AlertTriangle size={16} />}
                                title="Copia tu API key ahora"
                            >
                                <p>No se volverá a mostrar: solo guardamos su hash.</p>
                                <div className="flex items-center gap-2 mt-3">
                                    <code className="flex-1 min-w-0 font-mono text-[13px] text-brand-text
                                        bg-brand-surface border border-brand-border rounded-lg
                                        px-3 py-2.5 overflow-x-auto whitespace-nowrap">
                                        {newKey}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={handleCopyKey}
                                        className={`flex items-center gap-1.5 flex-none cursor-pointer
                                            text-sm font-semibold rounded-lg px-3 py-2.5 border transition-colors
                                            ${copied
                                                ? 'bg-brand-accent-soft border-brand-accent text-brand-accent-strong'
                                                : 'bg-brand-surface border-brand-border-strong text-brand-accent-strong hover:bg-brand-bg'}`}
                                    >
                                        {copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}
                                    </button>
                                </div>
                            </Callout>
                        </div>
                    )}

                    {/* Listado de keys */}
                    <div className="mt-5 border border-brand-border rounded-xl overflow-hidden">
                        {apiKeysLoading ? (
                            <p className="text-sm text-brand-muted p-5">Cargando…</p>
                        ) : apiKeys.length === 0 ? (
                            <p className="text-sm text-brand-muted p-5">
                                Aún no tienes API keys. Genera una para empezar a usar la API.
                            </p>
                        ) : (
                            apiKeys.map((k: ApiKey) => (
                                <div
                                    key={k.id}
                                    className="flex items-center justify-between gap-3 px-4 py-3.5
                                        border-b border-brand-border last:border-b-0
                                        hover:bg-brand-bg transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-brand-text truncate">{k.name}</p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                                            <code className="font-mono text-[12px] text-brand-muted">
                                                {k.keyPreview || "—"}
                                            </code>
                                            <span className="text-[12px] text-brand-subtle">
                                                {k.lastUsedAt
                                                    ? `Usada el ${new Date(k.lastUsedAt).toLocaleDateString('es-EC')}`
                                                    : "Sin uso"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-none">
                                        <span className={`rounded-full px-2.5 py-1
                                            text-[11px] font-bold uppercase tracking-[0.05em]
                                            ${k.status === "active"
                                                ? "bg-brand-accent-soft text-brand-accent-strong"
                                                : "bg-brand-danger-soft text-brand-danger"}`}>
                                            {k.status === "active" ? "Activa" : "Inactiva"}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => revoke.mutate(k.id)}
                                            disabled={revoke.isPending}
                                            className="text-brand-subtle hover:text-brand-danger transition-colors
                                                disabled:opacity-40 cursor-pointer"
                                            title="Revocar"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>
        </PageShell>
    );
}
