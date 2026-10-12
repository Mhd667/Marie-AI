import { config } from './config.js';
import { GroqClient } from './ai/GroqClient.js';
import { createServices } from './container.js';
import { createApp } from './http/app.js';

const llm = new GroqClient(config.groqApiKey, config.groqModel);
const services = createServices({ dataDir: config.dataDir, catalogAdapter: config.catalogAdapter, llm });
const app = createApp(services, { webDistDir: config.webDistDir });

app.listen(config.port, () => {
  console.log(`Marie Glam Assistant — API sur http://localhost:${config.port}`);
  console.log(`  Catalogue : ${services.repo.info.label}`);
  console.log(`  Données locales : ${config.dataDir}`);
  console.log(
    llm.configured
      ? `  IA : Groq (${llm.model})`
      : '  IA : non configurée — renseignez GROQ_API_KEY dans .env pour activer l’assistante.',
  );
});
