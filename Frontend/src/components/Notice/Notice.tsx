import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom";
import "./Notice.css"
import { useNoticeContext } from "./context/UseNoticeContext";
import { X } from "lucide-react";

const eventListener = "keydown";

export const Notice = () => {
    const noticeRef = useRef<HTMLDivElement>(null);
    const { state, setState, content } = useNoticeContext();
    const [exiting, setExiting] = useState(false);

    const closeNotice = useCallback(() => {
        setExiting(true);
        setTimeout(() => {
            setState(false);
            setExiting(false);
        }, 300); // duración de slideFadeOut
    }, [setState]);
    
    useEffect(() => {
        if(state) {
            const timer = setTimeout(()=>{
               closeNotice();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [state, closeNotice]);

    const noticeRoot = document.getElementById("notice");

    const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {

            if (e.key === "Escape") {
                closeNotice();
            }
        }

        if (state) {
            document.addEventListener(eventListener, handleEsc)
        }

        return () => {
            document.removeEventListener(eventListener, handleEsc)
        }
    }, [state, closeNotice])

    if (!state || !noticeRoot) {
        return null;
    }


    
    return createPortal(
        <div className="notice-overlay" >
            <div className={`notice ${exiting ? "exit" : ""}`} onClick={handleContentClick} ref={noticeRef}>
                {content}
                <button className="close-button" onClick={closeNotice}> <X className="w-6 h-6 text-red-600" /></button>
            </div>
        </div>,
        noticeRoot
    )
}