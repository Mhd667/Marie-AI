// Lance le serveur API et le frontend Vite en parallèle (Ctrl+C arrête les deux).
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['server', 'web'].map((workspace) =>
  spawn(npm, ['run', 'dev', '--workspace', workspace], { stdio: 'inherit', shell: process.platform === 'win32' }),
);

const stop = () => children.forEach((child) => child.kill('SIGINT'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', (code) => { if (code) { stop(); process.exitCode = code; } }));
