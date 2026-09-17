import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log(">>> DB is connected");
    } catch (error) {
        // Salir, no seguir. Antes esto solo imprimía el error y el servidor
        // arrancaba igual: sin base de datos, aceptando peticiones y devolviendo
        // 500 en todas, indefinidamente y sin que nada lo reiniciara. Con el
        // exit, `restart: unless-stopped` del compose lo levanta otra vez, que es
        // lo que hay que hacer cuando el Mongo compartido aún no está listo.
        console.error('No se pudo conectar a MongoDB:', error.message);
        process.exit(1);
    }
}