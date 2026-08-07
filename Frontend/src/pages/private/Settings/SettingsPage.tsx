import { useEffect, useState } from "react";
import { CustomButton } from "../../../components/Button/Button";
import { CustomInput } from "../../../components/Input/Input";
import { useUpdateWhatsappToken } from "../../../hooks/useUpdateWhatsappToken";
import { useAuthContext } from "../../../context/auth.context";
import type { AxiosError } from "axios";
import { useModalContext } from "../../../components/Modal/context/UseModalContext";
import { useApiKey } from "../../../hooks/useApiKey";
import { useConnectWhatsapp } from "../../../hooks/useConnectWhatsapp";
import type { ApiKey } from "../../../models/apikey.model";
import { Copy, Check, Trash2 } from "lucide-react";

interface ErrorItem {
  message: string;
}

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
                        )) || <p>A ocurrido un error, intentalo de nuevo más tarde</p>}
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
        <>
        <div className="m-6 p-6 rounded-xl shadow border border-brand-border bg-brand-surface">
            <h2 className="text-xl font-semibold text-brand-text mb-4">Configuración de WhatsApp</h2>

            <div className="mb-6 pb-6 border-b border-brand-border">
                <p className="text-sm text-brand-muted mb-3">
                    Conecta tu WhatsApp Business en un clic. Iniciarás sesión con Facebook
                    y tus credenciales se configurarán automáticamente.
                </p>
                <div className="h-10 w-52">
                    <CustomButton
                        type="button"
                        onClick={() => connectWhatsapp.connect()}
                        isLoading={connectWhatsapp.isPending}
                    >
                        Conectar WhatsApp
                    </CustomButton>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col items-end gap-4">
                <div className="w-full">
                    <CustomInput
                        label="Token de acceso a Whatapp"
                        type="text"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                    />
                </div>
                <div className="flex flex-row gap-4 w-full">
                    <CustomInput
                        label="ID de teléfono de WhatsApp"
                        type="text"
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                    />
                    <CustomInput
                        label="ID Watsapp Business"
                        type="text"
                        value={waBusinessId}
                        onChange={(e) => setWaBusinessId(e.target.value)}
                    />
                </div>
                <div className="flex flex-col justify-center h-10 w-40">
                    <CustomButton type="submit" isLoading={updateTokenWhatsappMutation.isPending}>
                        Guardar
                    </CustomButton>
                </div>
            </form>
        </div>

        {/* ── API Keys ── */}
        <div className="m-6 p-6 rounded-xl shadow border border-brand-border bg-brand-surface">
            <h2 className="text-xl font-semibold text-brand-text mb-1">API Keys</h2>
            <p className="text-sm text-brand-muted mb-5">
                Genera claves para enviar mensajes desde tus sistemas mediante la API.
            </p>

            {/* Generar */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-5">
                <div className="flex-1">
                    <CustomInput
                        label="Nombre de la key"
                        type="text"
                        placeholder="produccion"
                        value={apiKeyName}
                        onChange={(e) => setApiKeyName(e.target.value)}
                    />
                </div>
                <div className="h-10 w-40">
                    <CustomButton type="button" isLoading={generate.isPending} onClick={handleGenerateKey}>
                        Generar key
                    </CustomButton>
                </div>
            </div>

            {/* Key recién generada — se muestra una sola vez */}
            {newKey && (
                <div className="mb-5 rounded-lg border border-brand-accent-strong/40 bg-brand-accent/10 p-4">
                    <p className="text-sm font-medium text-brand-accent-strong mb-2">
                        Copia tu API key ahora — no se volverá a mostrar:
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm text-brand-text bg-brand-raised border border-brand-border rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap">
                            {newKey}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopyKey}
                            className="flex items-center gap-1.5 text-sm text-brand-text bg-brand-raised border border-brand-border rounded-md px-3 py-2 hover:bg-brand-border transition-colors flex-shrink-0"
                        >
                            {copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Listado de keys */}
            <div className="border border-brand-border rounded-lg overflow-hidden">
                {apiKeysLoading ? (
                    <p className="text-sm text-brand-muted p-4">Cargando...</p>
                ) : apiKeys.length === 0 ? (
                    <p className="text-sm text-brand-subtle p-4">Aún no tienes API keys.</p>
                ) : (
                    apiKeys.map((k: ApiKey) => (
                        <div key={k.id} className="flex items-center justify-between gap-3 p-3 border-b border-brand-border last:border-b-0">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-brand-text truncate">{k.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <code className="text-xs text-brand-muted">{k.keyPreview || "—"}</code>
                                    <span className="text-xs text-brand-subtle">
                                        {k.lastUsedAt ? `Usada ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Sin uso"}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${k.status === "active" ? "bg-brand-accent/10 text-brand-accent-strong" : "bg-brand-danger/10 text-brand-danger"}`}>
                                    {k.status === "active" ? "activa" : "inactiva"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => revoke.mutate(k.id)}
                                    disabled={revoke.isPending}
                                    className="text-brand-subtle hover:text-brand-danger transition-colors disabled:opacity-40"
                                    title="Revocar"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
        </>
    );
}
