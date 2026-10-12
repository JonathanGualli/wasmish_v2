import { useState } from "react";
import { AlertCircle, ChevronDown, Pencil } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { Pill } from "../../../../components/Pill/Pill";
import { useLines } from "../../../../hooks/useLines";
import { useCopyToClipboard } from "../../../../hooks/useCopyToClipboard";
import { useNoticeContext } from "../../../../components/Notice/context/UseNoticeContext";
import { apiErrorOf, type ApiError } from "../../../../utils/apiError";
import { lineLabel } from "../../../../utils/lineDisplay";
import { LineNameEditor } from "./LineNameEditor";
import { LineActionsMenu } from "./LineActionsMenu";
import { LineDetails } from "./LineDetails";
import { isBusy } from "./lineActionError";

interface Props {
    line: Line;
    colorClass: string;
    /** «Por defecto» solo dice algo con varias líneas. */
    showDefault: boolean;
    onDisconnect: (line: Line) => void;
}

/** El error de una acción sobre esta línea, debajo de ella (ámbar con «Reintentar» si la cuenta estaba ocupada). */
const RowError = ({ error, onRetry }: { error: ApiError; onRetry: () => void }) => (
    <div role="alert" className={`sm:ml-6 flex flex-wrap items-center gap-2 text-[13px]
        ${isBusy(error) ? 'text-brand-warning' : 'text-brand-danger'}`}>
        <AlertCircle size={14} className="flex-none" />
        <span>{error.message}</span>
        {isBusy(error) && (
            <button type="button" onClick={onRetry} className="font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
        )}
    </div>
);

/** Una línea conectada: su nombre (editable en el sitio), su número, su estado, sus detalles y su menú. */
export const LineRow = ({ line, colorClass, showDefault, onDisconnect }: Props) => {
    const { rename, makeDefault } = useLines();
    const { copy } = useCopyToClipboard();
    const { setState, setContent } = useNoticeContext();
    const [isEditing, setIsEditing] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [failure, setFailure] = useState<{ error: ApiError; retry: () => void } | null>(null);

    const label = lineLabel(line);

    const saveName = (name: string | null) => {
        setFailure(null);
        rename.mutate({ id: line.id, name }, {
            onSuccess: () => setIsEditing(false),
            onError: (error) => setFailure({ error: apiErrorOf(error), retry: () => saveName(name) }),
        });
    };

    const setAsDefault = () => {
        setFailure(null);
        makeDefault.mutate(line.id, {
            onError: (error) => setFailure({ error: apiErrorOf(error), retry: setAsDefault }),
        });
    };

    const copyId = async () => {
        await copy(line.id);
        setContent(<p className="text-brand-accent-strong">ID de la línea copiado.</p>);
        setState(true);
    };

    return (
        <div className="relative bg-brand-surface px-[18px] py-4 max-sm:px-3.5 grid gap-3 first:rounded-t-[10px] last:rounded-b-[10px]">
            <div className="flex items-center gap-3.5 max-sm:gap-3">
                <LineSwatch colorClass={colorClass} />
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <LineNameEditor
                            initialName={line.name ?? ''}
                            isSaving={rename.isPending}
                            onSave={saveName}
                            onCancel={() => { setIsEditing(false); setFailure(null); }}
                        />
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold text-brand-text break-words">{label}</span>
                            {showDefault && line.isDefault && <Pill tone="positive">Por defecto</Pill>}
                            <button type="button" onClick={() => setIsEditing(true)} title="Cambiar nombre" aria-label="Cambiar nombre"
                                className="max-sm:hidden flex p-0.5 text-brand-subtle hover:text-brand-accent-strong transition-colors cursor-pointer">
                                <Pencil size={14} />
                            </button>
                        </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-brand-muted">
                        {line.displayPhoneNumber
                            ? <span className="font-mono text-brand-gray-600">{line.displayPhoneNumber}</span>
                            : <span>Sin número visible · línea antigua</span>}
                        {line.verifiedName && line.verifiedName !== label && (
                            <span>En WhatsApp: <span className="text-brand-strong">{line.verifiedName}</span></span>
                        )}
                    </div>
                </div>
                <span className="max-sm:hidden flex-none inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-accent-strong">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-success" />Conectada
                </span>
                <button type="button" onClick={() => setDetailsOpen(open => !open)} aria-expanded={detailsOpen}
                    className={`max-sm:hidden flex-none flex items-center gap-1 h-8 px-2 rounded-[8px] text-[13px] font-semibold
                        text-brand-gray-600 hover:bg-brand-bg transition-colors cursor-pointer ${detailsOpen ? 'bg-brand-bg' : ''}`}>
                    Detalles
                    <ChevronDown size={14} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </button>
                <LineActionsMenu
                    line={line}
                    colorClass={colorClass}
                    onRename={() => setIsEditing(true)}
                    onMakeDefault={setAsDefault}
                    onShowDetails={() => setDetailsOpen(true)}
                    onCopyId={copyId}
                    onDisconnect={() => onDisconnect(line)}
                />
            </div>
            {detailsOpen && <LineDetails line={line} />}
            {failure && <RowError error={failure.error} onRetry={failure.retry} />}
        </div>
    );
};
