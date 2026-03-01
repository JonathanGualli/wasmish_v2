import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom";
import "./Modal.css"
import { useModalContext } from "./context/UseModalContext";
import { X } from "lucide-react";

const eventListener = "keydown";

export const Modal = () => {
    const modalRef = useRef<HTMLDivElement>(null);
    const { state, setState, content } = useModalContext();
    const [exiting, setExiting] = useState(false);

    const closeModal = useCallback(() => {
        setExiting(true);
        setTimeout(() => {
            setState(false);
            setExiting(false);
        }, 300); // duración de slideFadeOut
    }, [setState]);
    
    useEffect(() => {
        if(state) {
            const timer = setTimeout(()=>{
               closeModal();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [state, closeModal]);

    const modalRoot = document.getElementById("modal");

    const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {

            if (e.key === "Escape") {
                closeModal();
            }
        }

        if (state) {
            document.addEventListener(eventListener, handleEsc)
        }

        return () => {
            document.removeEventListener(eventListener, handleEsc)
        }
    }, [state, closeModal])

    if (!state || !modalRoot) {
        return null;
    }


    
    return createPortal(
        <div className="overlay" >
            <div className={`modal ${exiting ? "exit" : ""}`} onClick={handleContentClick} ref={modalRef}>
                {content}
                <button className="close-button" onClick={closeModal}> <X className="w-6 h-6 text-red-600" /></button>
            </div>
        </div>,
        modalRoot
    )
}