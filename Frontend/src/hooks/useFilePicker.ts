import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

/**
 * Elegir un archivo con el selector del sistema o soltándolo encima. Devuelve
 * lo que se pone en el `<input type="file">` oculto (`inputProps`), lo que va
 * en la zona donde se suelta (`dropProps`) y `open`, para un botón propio.
 * `isDragging` dice si hay un archivo encima, para marcar la zona.
 */
export const useFilePicker = (onFile: (file: File) => void) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';   // elegir el mismo archivo otra vez también avisa
        if (file) onFile(file);
    };

    const handleDrop = (event: DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
    };

    return {
        open: () => inputRef.current?.click(),
        isDragging,
        inputProps: { ref: inputRef, type: 'file' as const, className: 'hidden', onChange: handleChange },
        dropProps: {
            onDragOver: (event: DragEvent) => {
                event.preventDefault();
                setIsDragging(true);
            },
            // Solo al salir de la zona, no al pasar por encima de un hijo suyo.
            onDragLeave: (event: DragEvent) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            },
            onDrop: handleDrop,
        },
    };
};
