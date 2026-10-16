// 开发服务器插件：接收浏览器发来的局日志，写到 logs/runs/（只在 npm run dev 时生效）。
//   <局ID>.json          这一局最新的完整状态和输入记录（每过一年、每次抉择后覆盖写）
//   <局ID>.events.jsonl  按时间顺序追加的输入和事件（读档、报错……），没跑完、刷新过页面也都在
//   LATEST               最近一次写入的局 ID
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const ID = /^[0-9a-z-]{6,40}$/;

export function runlog(dir = 'logs/runs'): Plugin {
  return {
    name: 'cn14-runlog',
    apply: 'serve',
    configureServer(server) {
      const root = path.resolve(server.config.root, dir);
      fs.mkdirSync(root, { recursive: true });
      server.middlewares.use('/__runlog', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        // 先收齐字节再解码：按块拼字符串会把跨块的中文切坏
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => { chunks.push(c); });
        req.on('end', () => {
          try {
            const msg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (req.url === '/snapshot') {
              const id = msg.run && msg.run.id;
              if (!ID.test(id)) throw new Error('bad id');
              fs.writeFileSync(path.join(root, id + '.json'), JSON.stringify({ savedAt: new Date().toISOString(), ...msg }, null, 1));
              fs.writeFileSync(path.join(root, 'LATEST'), id + '\n');
            } else if (req.url === '/event') {
              if (!ID.test(msg.id)) throw new Error('bad id');
              fs.appendFileSync(path.join(root, msg.id + '.events.jsonl'), JSON.stringify(msg.ev) + '\n');
              fs.writeFileSync(path.join(root, 'LATEST'), msg.id + '\n');
            } else throw new Error('unknown');
            res.end('ok');
          } catch (e) {
            res.statusCode = 400; res.end(String(e));
          }
        });
      });
    },
  };
}
