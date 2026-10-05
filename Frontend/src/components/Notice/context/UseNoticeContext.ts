import { useContext } from "react";
import { NoticeContext } from "./NoticeContext";

export const useNoticeContext = () => {
    const context = useContext(NoticeContext);

    if (!context) {
        throw new Error("useNoticeContext se usa fuera de NoticeProvider");
    }

    return context;
}