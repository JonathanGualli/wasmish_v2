import React, { type ReactNode } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-brand-accent text-black hover:bg-brand-accent/85 focus-visible:ring-brand-accent/40',
  secondary: 'bg-brand-indigo text-white hover:bg-brand-indigo/85 focus-visible:ring-brand-indigo/40',
  ghost:     'bg-transparent border border-brand-border text-brand-muted hover:bg-brand-raised hover:text-brand-text focus-visible:ring-brand-border/50',
  danger:    'bg-brand-danger text-white hover:bg-brand-danger/85 focus-visible:ring-brand-danger/40',
};

interface ButtonProps {
  children: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  onClick?: () => void;
  isLoading?: boolean;
}

export const CustomButton: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  onClick,
  type = 'button',
  isLoading = false,
}) => (
  <div className="flex flex-col w-full h-full">
    <button
      className={`
        rounded-md font-medium text-sm transition-all
        h-full px-4 py-2 cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isLoading ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.98]'}
        ${variantClasses[variant]}
      `}
      onClick={onClick}
      type={type}
      disabled={isLoading}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <span className="loader" />
        </div>
      ) : (
        <span className="truncate text-center justify-center flex overflow-hidden">
          {children}
        </span>
      )}
    </button>
  </div>
);
