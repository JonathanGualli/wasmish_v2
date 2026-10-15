import { useState } from "react";
import { Copy, Check, Trash2, KeyRound, AlertTriangle } from "lucide-react";
import { CustomButton } from "../../../components/Button/Button";
import { CustomInput } from "../../../components/Input/Input";
import { Callout } from "../../../components/Callout/Callout";
import { SectionTitle } from "../../../components/Page/PageShell";
import { useNoticeContext } from "../../../components/Notice/context/UseNoticeContext";
import { useApiKey } from "../../../hooks/useApiKey";
import { useCopyToClipboard } from "../../../hooks/useCopyToClipboard";
import { apiErrorOf } from "../../../utils/apiError";
import type { ApiKey } from "../../../models/apikey.model";
import { SettingsCard } from "./SettingsCard";
import { SettingsListSkeleton } from "./SettingsListSkeleton";

/** Las API keys de la cuenta: generarlas (la key se ve una sola vez), listarlas y revocarlas. */
export const ApiKeysCard = ({ description }: { description: string }) => {
    const { setState, setContent } = useNoticeContext();
    const { apiKeys, isLoading: apiKeysLoading, generate, revoke } = useApiKey();
    const [apiKeyName, setApiKeyName] = useState('');
    const [newKey, setNewKey] = useState<string | null>(null);
    const { copied, copy } = useCopyToClipboard(2000);

    const handleGenerateKey = () => {
        if (!apiKeyName.trim()) return;
        generate.mutate(apiKeyName.trim(), {
            onSuccess: (data) => {
                setNewKey((data as { key: string }).key);
                setApiKeyName('');
            },
            onError: (error: Error) => {
                setContent(<div className="text-brand-danger"><p>{apiErrorOf(error, 'No se pudo generar la API key.').message}</p></div>);
                setState(true);
            }
        });
    }

    const handleCopyKey = () => {
        if (newKey) copy(newKey);
    }

    return (
        <SettingsCard>
            <SectionTitle description={description}>
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
                    <SettingsListSkeleton label="Cargando las API keys" rows={2}
                        rowClassName="px-4 py-3.5" bordered={false} />
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
        </SettingsCard>
    );
}
