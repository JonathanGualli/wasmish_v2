import { useEffect, useState } from "react";

/** El valor, pero solo cuando lleva `delay` ms sin cambiar: para no pedir a la API en cada tecla. */
export const useDebouncedValue = <T,>(value: T, delay = 300) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);

    return debounced;
};
