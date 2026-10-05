import 'dotenv/config';
import app from './app.js';
import { connectDB } from './db.js';
import { startCampaignWorker, stopCampaignWorker } from './workers/campaign.worker.js';

await connectDB();
startCampaignWorker();

app.listen(3001);
console.log('Server on port', 3001);

// Al parar el contenedor (deploy) Docker manda SIGTERM y espera 10 s: se deja
// terminar el mensaje de campaña en curso para no dejar un destinatario a medias.
const shutdown = async (signal) => {
    console.log(`${signal}: parando el worker de campañas…`);
    await stopCampaignWorker();
    process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
