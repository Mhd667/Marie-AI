import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En développement, Vite relaie /api et /media vers le serveur Node : le navigateur
// ne parle jamais directement à Groq et ne voit aucune clé.
const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API_TARGET,
      '/media': API_TARGET,
    },
  },
});
