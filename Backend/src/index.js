import 'dotenv/config';
import app from './app.js';
import { connectDB } from './db.js';
import { startCampaignWorker, stopCampaignWorker } from './workers/campaign.worker.js';
import { startAutoReplyWorker, stopAutoReplyWorker } from './workers/auto.reply.worker.js';
import { startHistoryWorker, stopHistoryWorker } from './workers/history.worker.js';

await connectDB();
startCampaignWorker();
startAutoReplyWorker();
startHistoryWorker();

app.listen(3001);
console.log('Server on port', 3001);

// Al parar el contenedor (deploy) Docker manda SIGTERM y espera 10 s: se deja
// terminar el mensaje de campaña en curso para no dejar un destinatario a medias,
// las respuestas automáticas que se están enviando y la pieza del historial en
// curso (como mucho 8 s cada uno, a la vez).
const shutdown = async (signal) => {
    console.log(`${signal}: parando los workers de campañas, respuestas automáticas e historial…`);
    await Promise.all([stopCampaignWorker(), stopAutoReplyWorker(), stopHistoryWorker()]);
    process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
