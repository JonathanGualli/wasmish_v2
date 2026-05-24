import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  text: string;
  collapsed: boolean;
  onTap: () => void;
  isSelected: boolean;
}

export const SidebarItem = ({ icon, text, collapsed, onTap, isSelected }: Props) => (
  <button
    onClick={onTap}
    type="button"
    title={collapsed ? text : undefined}
    className={`
      flex items-center w-full rounded-md text-sm transition-colors
      border-l-2
      ${collapsed ? 'justify-center py-2.5 px-0' : 'gap-3 px-3 py-2.5'}
      ${isSelected
        ? 'bg-brand-accent/10 text-brand-accent font-medium border-l-brand-accent'
        : 'text-brand-muted hover:bg-brand-raised hover:text-brand-text border-l-transparent'
      }
    `}
  >
    <div className="flex-shrink-0">{icon}</div>
    {!collapsed && (
      <span className="whitespace-nowrap truncate">{text}</span>
    )}
  </button>
);
