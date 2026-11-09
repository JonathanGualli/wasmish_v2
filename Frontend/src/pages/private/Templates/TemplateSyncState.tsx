import { Loader2 } from "lucide-react";
import { formatTimeAgo } from "../../../utils/formatChatTime";

/**
 * El estado del sync, junto a «Sincronizar» (en la lista y en el detalle):
 * comprobando Meta, o cuándo fue el último sync completo.
 */
export const TemplateSyncState = ({ syncedAt, checking }: { syncedAt?: string | null; checking: boolean }) => {
    if (checking) {
        return (
            <span className="flex items-center gap-[7px] text-[12.5px] text-brand-info">
                <Loader2 size={14} className="motion-safe:animate-spin" />Comprobando cambios en Meta…
            </span>
        );
    }
    if (!syncedAt) return null;
    return (
        <span className="text-[12.5px] text-brand-muted">
            Sincronizado <span className="font-mono">{formatTimeAgo(Date.now() - new Date(syncedAt).getTime())}</span>
        </span>
    );
};
