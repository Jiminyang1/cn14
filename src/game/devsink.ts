// 开发时（npm run dev）把每局日志实时发给开发服务器，写到 logs/runs/（见 tools/vite-runlog.ts）。上线的版本里什么都不做。
import type { Life } from '../engine';
import type { RunEvent, RunLog } from './runlog';

const DEV = import.meta.env.DEV;
function post(path: string, body: unknown) {
  const s = JSON.stringify(body);
  // keepalive 让关页面时的最后一次也能发出去，但它有 64KB 上限
  fetch('/__runlog/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: s, keepalive: s.length < 60000 }).catch(() => {});
}
export const sink = {
  /** 当前完整状态：logs/runs/<局ID>.json（覆盖写） */
  snapshot(run: RunLog, life: Life) { if (DEV) post('snapshot', { run, life }); },
  /** 一条输入或事件：logs/runs/<局ID>.events.jsonl（追加） */
  event(id: string, ev: RunEvent) { if (DEV) post('event', { id, ev }); },
};
