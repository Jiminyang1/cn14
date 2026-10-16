// 重放一局：npm run replay -- [局ID | 日志文件] [--until 年龄] [--log] [--years]
//   不给局 ID 时用 logs/runs/LATEST（开发时最近玩的那一局）
//   --until 年龄  只跑到这个年龄，打印那时的状态（排查某一年用）
//   --log        打印完整时间线（默认只打印最后 20 条）
//   --years      打印每一年的状态（幸福、健康、存款、在做什么）
// 重放结束后和日志里记录的状态逐项对比，对不上会列出不同的字段。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CAUSE, EDU_LV, wan, type Life } from '../src/engine';
import { ReplayError, replay } from '../src/game/replay';
import type { RunLog } from '../src/game/runlog';

const RUNS = path.resolve('logs/runs');
const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const target = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--until')
  || (fs.existsSync(path.join(RUNS, 'LATEST')) ? fs.readFileSync(path.join(RUNS, 'LATEST'), 'utf8').trim() : '');
if (!target) { console.log('用法：npm run replay -- <局ID | 日志文件> [--until 年龄] [--log] [--years]'); process.exit(1); }
const file = fs.existsSync(target) ? target : path.join(RUNS, target + '.json');
if (!fs.existsSync(file)) { console.log('找不到日志：' + file); process.exit(1); }
const { run, life } = JSON.parse(fs.readFileSync(file, 'utf8')) as { run: RunLog; life: Life };
const untilAge = opt('--until') != null ? +opt('--until') : undefined;

let gitNow = 'unknown';
try { gitNow = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain').toString().trim() ? '-dirty' : ''); } catch { /* 不在 git 里 */ }

console.log(`局 ${run.id}　种子 ${run.seed}　开始于 ${run.startedAt}`);
console.log(`当时的代码 ${run.version}　现在的代码 ${gitNow}${run.version !== gitNow ? '　⚠ 版本不同，规则改过的话重放结果会不一样' : ''}`);
console.log(`输入 ${run.inputs.length} 条（抉择 ${run.inputs.filter(i => i.type === 'decide').length}）　记录的状态：${life.phase === 'end' ? `${life.death.age} 岁离世` : `${life.age} 岁，还没跑完`}`);
for (const e of run.events.filter(e => e.type === 'error' || e.type === 'warn')) console.log(`  ${e.type === 'error' ? '✖ 报错' : '⚠ 警告'} ${e.a ?? '?'} 岁：${e.message}${e.stack ? '\n    ' + String(e.stack).split('\n').slice(0, 4).join('\n    ') : ''}`);

let L: Life;
try {
  L = replay(run, { untilAge, stopAt: life.phase === 'life' ? { a: life.age, t: life.t } : undefined });
} catch (e) {
  if (!(e instanceof ReplayError)) throw e;
  console.log('\n✖ 重放中断：' + e.message);
  L = (await import('../src/engine')).S;
}

// 和记录的状态逐项对比（JSON 往返一次，去掉 undefined）。
// 浏览器和 Node 的 Math.exp / log / cos 在最后一位上可能不同，所以只差最后几位的数字单独归为「浮点末位差异」，不算不一致
const ulps: string[] = [];
const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
function diff(a: unknown, b: unknown, p: string, out: string[]) {
  if (out.length >= 20) return;
  if (typeof a === 'number' && typeof b === 'number' && a !== b && close(a, b)) { ulps.push(p); return; }
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(`${p}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`); return; }
  if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b as object)])) diff(a[k], b[k], p ? `${p}.${k}` : k, out);
  } else if (a !== b) out.push(`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
if (untilAge == null) {
  const out: string[] = [];
  diff(JSON.parse(JSON.stringify(L)), life, '', out);
  const note = ulps.length ? `（另有 ${ulps.length} 处只差浮点末位，如 ${ulps.slice(0, 3).join('、')}：浏览器和 Node 的数学函数在最后一位上算得不同，不影响剧情）` : '';
  console.log(out.length ? `\n✖ 重放结果和记录不一致（重放 ≠ 记录），前 ${out.length} 处：\n  ` + out.join('\n  ') + '\n' + note : `\n✔ 重放结果和记录一致${note}`);
}

console.log(`\n${L.name}　${L.sex === 'M' ? '男' : '女'}　${L.eth}　出生地 ${L.born}${L.rural ? '（农村）' : ''}　家境 ${L.q}/5　学历 ${EDU_LV[L.edu]}`);
console.log(L.phase === 'end' ? `${L.death.age} 岁离世：${CAUSE[L.death.cause]}` : `现在 ${L.age} 岁　存款 ${wan(L.money)}　${L.job || ''}`);
if (flag('--years')) {
  console.log('\n年龄  幸福  健康  存款          在做什么');
  for (const y of L.years) console.log(`${String(y.a).padStart(3)}  ${String(y.h).padStart(4)}  ${String(y.hl).padStart(4)}  ${wan(y.m).padStart(12)}  ${y.s}`);
}
const log = L.log.slice().reverse();
console.log(`\n时间线（${flag('--log') ? '全部' : '最后 20 条'}，共 ${log.length} 条）`);
for (const e of flag('--log') ? log : log.slice(-20)) console.log(`${String(e.a).padStart(3)}  ${e.k === 'choice' ? '▸ ' : ''}${e.t}`);
