import { useEffect, useRef } from 'react';

interface InputProps {
    label?: string,
    required?: boolean,
    type?: 'text' | 'email' | 'password' | 'number' | 'date',
    placeholder?: string,
    value?: string,
    onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void,
    /**
     * Número máximo de líneas visibles antes de mostrar scroll.
     * Si es 1 (por defecto), se renderiza un <input> de una sola línea.
     * Si es mayor a 1, se renderiza un <textarea> que auto-ajusta su altura
     * hasta el límite indicado y luego habilita scroll.
     */
    maxLines?: number,
    sendOnEnter?: boolean,
    onEnter?: () => void,
}

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
}) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Ajusta la altura del textarea automáticamente hasta el límite de líneas.
    useEffect(() => {
        if (maxLines <= 1) return;
        const el = textareaRef.current;
        if (!el) return;

        // Resetear altura para recalcular scrollHeight correctamente
        el.style.height = 'auto';

        // Altura máxima basada en line-height aproximada (22px)
        const lineHeight = 22; // px
        const maxHeight = maxLines * lineHeight;

        // Ajuste de altura dinámico con límite
        const nextHeight = Math.min(el.scrollHeight, maxHeight);
        el.style.height = `${nextHeight}px`;
        el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [value, maxLines]);

    // Manejador de Ender vs Alt+Enter para enviar o nueva línea
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (!sendOnEnter) return;
        
        if (e.key === 'Enter') {

            if(e.shiftKey) return;
            e.preventDefault();
            onEnter?.();
        }

    };

    return (
        <div className={`w-full h-full flex flex-col`}>
            {label && 
            <label className="flex flex-row items-center gap-1 pb-1 text-sm font-medium text-gray-900">
                {label} { required && <span className="text-red-500">*</span>}
            </label>
            }
            {maxLines <= 1 ? (
                <input
                    type={type}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    className='border border-gray-300 rounded-md p-2 w-full h-full'
                    onKeyDown={handleKeyDown}
                />
            ) : (
                <textarea
                    ref={textareaRef}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange as (e: React.ChangeEvent<HTMLTextAreaElement>) => void}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className='border border-gray-300 rounded-md p-2 w-full resize-none'
                    style={{ lineHeight: '22px' }}
                />
            )}
            
        </div>
    );
}