/** «1,4 MB», «312 KB», «5 MB». Mono al pintarlo: es un dato, no prosa. */
export const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',').replace(/,0$/, '')} MB`;
