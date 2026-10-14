import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getLinePinService } from "../services/api.service";

/**
 * El PIN de dos pasos de una línea, pedido solo cuando se va a enseñar. Va con
 * una mutación y no con una query: así no queda en la caché de React Query y
 * desaparece con el componente (al cerrar «Detalles» o salir de Ajustes).
 */
export const useLinePin = (lineId: string) => {
    const [pin, setPin] = useState<string | null>(null);
    const load = useMutation({ mutationFn: () => getLinePinService(lineId), onSuccess: setPin });

    return {
        /** El PIN a la vista; `null` mientras está oculto. */
        pin,
        isLoading: load.isPending,
        error: load.isError ? load.error : null,
        /** El servidor respondió que no hay PIN (se borró entre la lista y la petición). */
        isMissing: load.isSuccess && load.data === null,
        reveal: () => load.mutate(),
        hide: () => { setPin(null); load.reset(); },
    };
};
