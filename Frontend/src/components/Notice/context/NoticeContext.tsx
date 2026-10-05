import React, { createContext, useState, type ReactNode } from "react";

const NoticeContext = createContext<{
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

const NoticeProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<boolean>(false);
    const [content, setContent] = useState<ReactNode>(null);

    return <NoticeContext.Provider value={{ state, setState, content, setContent }}>{children}</NoticeContext.Provider>
}

export {
    NoticeProvider,
    NoticeContext,
}