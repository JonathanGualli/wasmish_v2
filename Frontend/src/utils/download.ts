/** Descarga un archivo sin salir de la página: uno del propio sitio (por su URL) o uno creado aquí (un Blob). */
export const downloadFile = (source: string | Blob, fileName: string) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // El navegador ya tomó el archivo; la URL del Blob solo ocuparía memoria.
    if (typeof source !== 'string') setTimeout(() => URL.revokeObjectURL(url), 0);
};
