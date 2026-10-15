import { Menu } from "lucide-react";
import { Logo, LogoLockup } from "../Logo/Logo";
import { SkeletonBox } from "./Skeleton";
import { SkeletonFrame } from "./SkeletonFrame";

// Los anchos de los accesos de la barra, del diseño (3.1a): todavía no se sabe
// el rol, así que no se escriben.
const NAV_WIDTHS = ['64px', '52px', '70px', '66px', '74px', '90px'];

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

/**
 * Lo que se ve al abrir Wasmish mientras se comprueba la sesión (diseño 3.1),
 * solo cuando el navegador no recuerda a nadie (con alguien recordado, la app
 * abre al momento): el marco de la app, no una página en blanco. El contenido
 * queda en blanco, porque aún no se sabe qué página es la que llega; cada una
 * trae su skeleton. En el teléfono, la cabecera.
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
        </div>
    </SkeletonFrame>
);
