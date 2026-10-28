import { useContext } from "react";
import { NoticeContext } from "./NoticeContext";

/** El aviso de arriba: `notify({ kind, text, action })`, `close()` y si se ve. */
export const useNotice = () => {
    const context = useContext(NoticeContext);

    if (!context) {
        throw new Error("useNotice se usa fuera de NoticeProvider");
    }

    return context;
};
