import { execSync } from 'node:child_process';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { runlog } from './tools/vite-runlog.ts';

// 代码版本写进每一局的日志，重放时可以对照
function gitVersion() {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no').toString().trim() ? '-dirty' : '';
    return sha + dirty;
  } catch { return 'unknown'; }
}

export default defineConfig({
  plugins: [react(), runlog()],
  define: { __APP_VERSION__: JSON.stringify(gitVersion()) },
  // .claude/ 下面是各个会话的 worktree，里面的测试不属于这个检出
  test: { testTimeout: 60000, exclude: [...configDefaults.exclude, '.claude/**'] },
});
