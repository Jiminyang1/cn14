import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { runlog } from './tools/vite-runlog.ts';

// 代码版本写进每一局的日志，重放时可以对照
function gitVersion() {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim() ? '-dirty' : '';
    return sha + dirty;
  } catch { return 'unknown'; }
}

export default defineConfig({
  plugins: [react(), runlog()],
  define: { __APP_VERSION__: JSON.stringify(gitVersion()) },
  test: { testTimeout: 60000 },
});
