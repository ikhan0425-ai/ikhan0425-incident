// 로컬 프론트엔드: appdeploy/ 를 그대로 띄우되 @appdeploy/client 만 모의 구현으로 바꾼다.
// CSS 는 미리 만든 appdeploy/src/index.css 를 쓴다 (원본을 고치면 build-css.mjs 실행).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const API = `http://localhost:${process.env.MOCK_API_PORT ?? 8787}`;

export default defineConfig({
  root: path.resolve(__dirname, '../appdeploy'),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@appdeploy/client': path.resolve(__dirname, 'mock-client.ts') } },
  server: { port: Number(process.env.MOCK_WEB_PORT ?? 5173), proxy: { '/api': API } },
  preview: { port: Number(process.env.MOCK_WEB_PORT ?? 5173), proxy: { '/api': API } },
  build: { outDir: path.resolve(__dirname, '.dist'), emptyOutDir: true },
});
