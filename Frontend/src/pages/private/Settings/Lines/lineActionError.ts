import { LINE_ERROR } from "../../../../models/line.model";
import type { ApiError } from "../../../../utils/apiError";

/**
 * «Hay otro cambio en las líneas en curso» no es culpa de nadie: va en ámbar y
 * con «Reintentar». El resto de errores, en rojo.
 */
export const isBusy = (error: ApiError | null) => error?.code === LINE_ERROR.busy;
