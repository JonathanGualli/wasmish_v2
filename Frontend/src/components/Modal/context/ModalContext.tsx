import React, { createContext, useState, type ReactNode } from "react";

const ModalContext = createContext<{
    state: boolean;
    setState: React.Dispatch<React.SetStateAction<boolean>>;
    content: ReactNode;
    setContent: React.Dispatch<React.SetStateAction<ReactNode>>

}>({
    state: false,
    setState: () => null,
    content: null,
    setContent: () => null,
})

const ModalProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<boolean>(false);
    const [content, setContent] = useState<ReactNode>(null);

    return <ModalContext.Provider value={{ state, setState, content, setContent }}>{children}</ModalContext.Provider>
}

export {
    ModalProvider,
    ModalContext,
}