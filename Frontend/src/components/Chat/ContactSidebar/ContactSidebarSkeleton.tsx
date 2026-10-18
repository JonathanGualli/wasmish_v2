import { SkeletonBox, SkeletonLine } from "../../Skeleton/Skeleton";
import { SkeletonFrame } from "../../Skeleton/SkeletonFrame";
import { SidebarCard } from "./SidebarCard";
import { ContactNotesSkeleton } from "../../Contact/ContactNotes/ContactNotesCard";

const DATA_LABELS = ['Email', 'Empresa', 'Origen', 'Desde'];
const DATA_WIDTHS = ['72%', '56%', '40%', '32%'];

/** La identidad en la cabecera verde: avatar, nombre, teléfono y etiquetas. */
export const ContactIdentitySkeleton = () => (
    <>
        <div className="flex gap-3 items-center">
            <SkeletonBox tone="deep" className="w-[52px] h-[52px] rounded-[13px]" />
            <div className="flex-1 grid gap-2">
                <SkeletonBox tone="deep" width="62%" className="h-3.5 rounded-[7px]" />
                <SkeletonBox tone="deep" width="44%" className="h-2 rounded-[4px]" />
            </div>
        </div>
        <div className="flex gap-1.5">
            {['72px', '56px', '64px'].map(width => <SkeletonBox key={width} tone="deep" width={width} className="h-[22px] rounded-[6px]" />)}
        </div>
    </>
);

/** El cuerpo de la ficha mientras carga: sus tarjetas, con sus títulos y etiquetas reales (diseño 3.3). */
export const ContactSidebarSkeleton = () => (
    <SkeletonFrame label="Cargando la ficha del contacto" className="flex-1 min-h-0 p-3.5 grid gap-2.5 content-start">
        <ContactNotesSkeleton />
        <SidebarCard title="Datos">
            <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2.5 gap-y-[7px] text-[13px] leading-[1.5]">
                {DATA_LABELS.map((label, i) => (
                    <div key={label} className="contents">
                        <dt className="text-brand-muted">{label}</dt>
                        <dd className="flex items-center"><SkeletonLine width={DATA_WIDTHS[i]} /></dd>
                    </div>
                ))}
            </dl>
        </SidebarCard>
        <div className="bg-brand-surface rounded-xl px-3.5 py-3 flex gap-6">
            {['36px', '28px', '44px'].map(width => <SkeletonBox key={width} width={width} className="h-[15px] rounded-[4px]" />)}
        </div>
    </SkeletonFrame>
);
