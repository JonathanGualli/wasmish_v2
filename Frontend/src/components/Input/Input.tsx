import { useEffect, useRef } from 'react';

interface InputProps {
  label?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'password' | 'number' | 'date';
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /**
   * Si es 1 (default) renderiza <input>. Si es mayor, renderiza <textarea>
   * que auto-ajusta su altura hasta el límite y luego muestra scroll.
   */
  maxLines?: number;
  sendOnEnter?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
}

const baseInputClasses = `
  bg-brand-raised border border-brand-border text-brand-text
  placeholder:text-brand-subtle rounded-md p-2.5 w-full
  focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30
  transition-colors text-sm
`.trim();

export const CustomInput: React.FC<InputProps> = ({
  label,
  required = false,
  type = 'text',
  placeholder = '',
  value,
  onChange,
  maxLines = 1,
  sendOnEnter = false,
  onEnter,
  autoFocus = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (maxLines <= 1) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 22;
    const maxHeight = maxLines * lineHeight;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, maxLines]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!sendOnEnter) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter?.();
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {label && (
        <label className="flex flex-row items-center gap-1 pb-1.5 text-xs font-medium text-brand-muted tracking-wide uppercase">
          {label}
          {required && <span className="text-brand-danger">*</span>}
        </label>
      )}
      {maxLines <= 1 ? (
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          className={baseInputClasses}
        />
      ) : (
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLTextAreaElement>) => void}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          rows={1}
          className={`${baseInputClasses} resize-none`}
          style={{ lineHeight: '22px' }}
        />
      )}
    </div>
  );
};
