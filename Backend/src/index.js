import 'dotenv/config';
import app from './app.js';
import { connectDB } from './db.js';
import { startCampaignWorker, stopCampaignWorker } from './workers/campaign.worker.js';
import { startAutoReplyWorker, stopAutoReplyWorker } from './workers/auto.reply.worker.js';

await connectDB();
startCampaignWorker();
startAutoReplyWorker();

app.listen(3001);
console.log('Server on port', 3001);

// Al parar el contenedor (deploy) Docker manda SIGTERM y espera 10 s: se deja
// terminar el mensaje de campaña en curso para no dejar un destinatario a medias,
// y las respuestas automáticas que se están enviando (como mucho 8 s).
const shutdown = async (signal) => {
    console.log(`${signal}: parando los workers de campañas y de respuestas automáticas…`);
    await Promise.all([stopCampaignWorker(), stopAutoReplyWorker()]);
    process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
