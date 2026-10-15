import { Menu } from "lucide-react";
import { Logo, LogoLockup } from "../Logo/Logo";
import { PageShell } from "../Page/PageShell";
import { SkeletonBox, SkeletonLine } from "./Skeleton";
import { SkeletonFrame } from "./SkeletonFrame";
import { AVATAR_LG, AVATAR_SM, SkeletonListRow } from "./SkeletonListRow";

// Los anchos de los accesos de la barra, del diseño (3.1a): todavía no se sabe
// el rol, así que no se escriben.
const NAV_WIDTHS = ['64px', '52px', '70px', '66px', '74px', '90px'];
const ROWS = Array.from({ length: 9 }, (_, i) => i);

/** Un acceso de la barra: el icono y, con la barra abierta, su nombre. */
const NavItem = ({ width }: { width: string }) => (
    <div className="flex items-center justify-center min-[1180px]:justify-start gap-[11px] py-2.5 min-[1180px]:px-3">
        <SkeletonBox tone="deep" className="w-[18px] h-[18px] rounded-[5px]" />
        <span className="hidden min-[1180px]:block"><SkeletonBox tone="deep" width={width} className="h-[9px] rounded-[5px]" /></span>
    </div>
);

/** La barra oscura, con las medidas de `Sidebar`: 236 px, o 76 colapsada por debajo de 1180. */
const SidebarSkeleton = () => (
    <aside className="hidden md:flex flex-col flex-none w-[76px] min-[1180px]:w-[236px] bg-brand-deep
        px-[14px] pt-[calc(20px+var(--safe-top))] pb-[calc(16px+var(--safe-bottom))]">
        <div className="px-2">
            <span className="hidden min-[1180px]:block"><LogoLockup onDeep /></span>
            <Logo className="w-[34px] h-[34px] mx-auto min-[1180px]:hidden" variant="mint" />
        </div>
        <div className="mt-7 px-2 pb-2.5 hidden min-[1180px]:block">
            <SkeletonBox tone="deep" className="h-[7px] w-[54px] rounded-[4px]" />
        </div>
        <div className="grid gap-[3px] max-[1179px]:mt-7">
            {NAV_WIDTHS.map(width => <NavItem key={width} width={width} />)}
        </div>
        <div className="mt-auto grid gap-[3px]">
            <div className="h-px bg-brand-deep-active mx-2 mb-3" />
            <NavItem width="52px" />
            <div className="mt-2.5 flex items-center justify-center min-[1180px]:justify-start gap-2.5 rounded-[9px] bg-brand-ink p-2 min-[1180px]:px-3 min-[1180px]:py-2.5">
                <SkeletonBox tone="deep-hover" className="w-[30px] h-[30px] rounded-lg" />
                <div className="hidden min-[1180px]:grid flex-1 gap-1.5">
                    <SkeletonBox tone="deep-hover" width="70%" className="h-[9px] rounded-[5px]" />
                    <SkeletonBox tone="deep-dim" width="88%" className="h-[7px] rounded-[4px]" />
                </div>
            </div>
        </div>
    </aside>
);

/** Una página cualquiera de Wasmish: su cabecera y una lista. */
const PageSkeleton = () => (
    <PageShell width="wide">
        <div className="flex gap-4 mb-10">
            <SkeletonBox className="w-10 h-10 rounded-[10px]" />
            <div className="grid gap-3 content-start pt-2">
                <SkeletonBox width="180px" className="h-3.5 rounded-[7px]" />
                <SkeletonLine soft width="300px" />
            </div>
        </div>
        <div className="rounded-xl border border-brand-border overflow-hidden divide-y divide-brand-border">
            <div className="h-10 bg-brand-bg" />
            {ROWS.map(i => <SkeletonListRow key={i} index={i} avatar={AVATAR_SM} />)}
        </div>
    </PageShell>
);

/**
 * Lo que se ve al abrir Wasmish mientras se comprueba la sesión (diseño 3.1):
 * el marco de la app, no una página en blanco. En el teléfono, la cabecera y
 * una lista.
 */
export const AppBootSkeleton = () => (
    <SkeletonFrame label="Cargando Wasmish" className="flex h-[var(--app-height,100dvh)] bg-brand-bg">
        <SidebarSkeleton />
        <div className="flex-1 min-w-0 flex flex-col bg-brand-surface">
            <header className="md:hidden h-[calc(56px+var(--safe-top))] pt-[var(--safe-top)] border-b border-brand-border
                flex items-center gap-3 px-4 flex-none">
                <Menu size={20} className="text-brand-muted" />
                <LogoLockup size="sm" />
            </header>
            <div className="md:hidden divide-y divide-brand-border overflow-hidden">
                {ROWS.map(i => <SkeletonListRow key={i} index={i} avatar={AVATAR_LG} trailing="time" className="px-4 py-3" />)}
            </div>
            <div className="hidden md:block flex-1 overflow-hidden"><PageSkeleton /></div>
        </div>
    </SkeletonFrame>
);
