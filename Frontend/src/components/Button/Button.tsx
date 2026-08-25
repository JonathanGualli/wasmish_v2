import React, { type ReactNode } from 'react';
import './Button.css';

/**
 * Manual de marca v1.0 · 04 Componentes — botones: alto 40px, radio 8px.
 *  primary   menta  #6FE3AE + texto verde 900   → la acción principal (una por vista)
 *  secondary verde profundo sólido + blanco     → acción de apoyo con peso
 *  outline   blanco + borde gris frío 300       → cancelar, descartar
 *  ghost     transparente                        → acciones terciarias
 *  danger    rojo de error                       → destructivas
 */
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

/**
 * `md` — el estándar del manual: alto 40px, texto 14.
 * `lg` — el de las pantallas de acceso: 49px en escritorio, 53px en móvil,
 *        texto 15/16 y radio 10 en móvil para acompañar a los campos.
 */
type ButtonSize = 'md' | 'lg';

const sizeClasses: Record<ButtonSize, string> = {
  md: 'h-full text-sm px-[18px] py-[11px] rounded-[8px]',
  lg: 'w-full text-base lg:text-[15px] px-[18px] py-4 lg:py-[14px] rounded-[10px] lg:rounded-[8px]',
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-brand-accent text-brand-ink hover:bg-brand-accent-hover active:bg-brand-accent-active',
  secondary: 'bg-brand-deep text-white hover:bg-brand-deep-hover active:bg-brand-ink',
  outline:   'bg-brand-surface text-brand-accent-strong border border-brand-border-strong hover:bg-brand-bg hover:border-brand-gray-400',
  ghost:     'bg-transparent text-brand-gray-600 hover:bg-brand-raised hover:text-brand-text',
  danger:    'bg-brand-danger text-white hover:brightness-110 active:brightness-95',
};

interface ButtonProps {
  children: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export const CustomButton: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  isLoading = false,
  disabled = false,
}) => (
  <div className="flex flex-col w-full h-full">
    <button
      className={`
        font-semibold transition-colors cursor-pointer
        ${sizeClasses[size]}
        disabled:bg-brand-raised disabled:text-brand-subtle
        disabled:border-transparent disabled:cursor-not-allowed
        ${isLoading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.99]'}
        ${variantClasses[variant]}
      `}
      onClick={onClick}
      type={type}
      disabled={isLoading || disabled}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <span className={`loader ${variant === 'primary' || variant === 'outline' || variant === 'ghost' ? 'loader--ink' : ''}`} />
        </div>
      ) : (
        <span className="flex items-center justify-center gap-1.5 truncate overflow-hidden">
          {children}
        </span>
      )}
    </button>
  </div>
);
