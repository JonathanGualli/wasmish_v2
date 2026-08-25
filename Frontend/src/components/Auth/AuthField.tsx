import { useState, type ReactNode } from 'react';

/**
 * Campos de las pantallas de acceso — «06 · Acceso» del manual de marca v1.0.
 * Escritorio: 15px, radio 8px, padding 13/14. Móvil: 16px (evita el zoom de iOS),
 * radio 10px, padding 15/14. Reposo en blanco con borde gris frío 300; al enfocar,
 * borde verde 600 y anillo de 3px en verde 100.
 */
const fieldClasses = `
  w-full box-border text-base lg:text-[15px] text-brand-text
  bg-brand-surface border rounded-[10px] lg:rounded-[8px]
  px-[14px] py-[15px] lg:py-[13px]
  placeholder:text-brand-subtle
  focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft
  transition-colors
`;

interface FieldProps {
  label: string;
  /** Enlace o acción alineada a la derecha del label (ej. «¿La olvidaste?»). */
  labelAction?: ReactNode;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoComplete?: string;
  /** Mensaje de error: pinta el borde en rojo y lo muestra debajo. */
  error?: string;
}

export const AuthField = ({
  label,
  labelAction,
  type = 'text',
  placeholder,
  value,
  onChange,
  required,
  autoComplete,
  error,
}: FieldProps) => (
  <label className="grid gap-[7px]">
    <span className="flex items-baseline text-[13px] font-semibold text-brand-strong">
      {label}
      {labelAction && <span className="ml-auto">{labelAction}</span>}
    </span>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      autoComplete={autoComplete}
      aria-invalid={error ? true : undefined}
      className={`${fieldClasses} ${error ? 'border-brand-danger' : 'border-brand-border-strong'}`}
    />
    {error && <span className="text-[13px] text-brand-danger">{error}</span>}
  </label>
);

/** 0–3. Longitud suficiente, mezcla de mayúsculas/minúsculas, y dígito o símbolo. */
const passwordStrength = (pw: string) => {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[\d\W]/.test(pw)) score++;
  return score;
};

const STRENGTH_COLORS = ['bg-brand-danger', 'bg-brand-warning', 'bg-brand-success'];

interface PasswordProps extends Omit<FieldProps, 'type'> {
  /** Medidor de fuerza de 3 barras — solo en el registro. */
  showStrength?: boolean;
}

export const AuthPasswordField = ({
  label,
  labelAction,
  placeholder,
  value,
  onChange,
  required,
  autoComplete,
  error,
  showStrength = false,
}: PasswordProps) => {
  const [show, setShow] = useState(false);
  const score = passwordStrength(value);

  return (
    <label className="grid gap-[7px]">
      <span className="flex items-baseline text-[13px] font-semibold text-brand-strong">
        {label}
        {labelAction && <span className="ml-auto">{labelAction}</span>}
      </span>

      <span className="relative block">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={`${fieldClasses} pr-[78px] lg:pr-[74px]
            ${error ? 'border-brand-danger' : 'border-brand-border-strong'}`}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
          className="absolute right-[14px] top-1/2 -translate-y-1/2 cursor-pointer
            text-sm lg:text-[13px] font-semibold text-brand-gray-600
            hover:text-brand-deep transition-colors"
        >
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>

      {showStrength && (
        <span className="flex gap-1 mt-[2px] lg:mt-[3px]" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={`flex-1 h-[3px] rounded-[2px] transition-colors
                ${i < score ? STRENGTH_COLORS[score - 1] : 'bg-brand-border'}`}
            />
          ))}
        </span>
      )}

      {error && <span className="text-[13px] text-brand-danger">{error}</span>}
    </label>
  );
};

/** Enlace de texto de las pantallas de acceso. */
export const AuthLink = ({ children, ...props }: React.ComponentProps<'a'>) => (
  <a {...props} className="font-semibold text-brand-accent-strong hover:underline">
    {children}
  </a>
);
