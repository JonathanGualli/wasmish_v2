import express from "express";

// Un archivo que llega crudo, con su tipo en el Content-Type: sin multipart no
// hace falta ninguna dependencia. Lo usan la cabecera de las plantillas y los
// archivos del chat. El tope fino por formato lo pone cada uno; este solo evita
// leer algo enorme a memoria, y su error sale en el formato de la API en vez de
// la página HTML de Express.
const rawFile = express.raw({ type: () => true, limit: '17mb' });

export const readRawFile = (req, res, next) => rawFile(req, res, (err) => (err
    ? res.status(err.status ?? 400).json([{
        message: err.type === 'entity.too.large' ? 'El archivo pesa demasiado: el máximo es 16 MB.' : 'No se pudo leer el archivo.',
    }])
    : next()));
