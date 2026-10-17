// 不开浏览器出图：把像素场景按几帧画成一张 PNG 拼图，几秒钟看完所有插画。
//
//   npm run pixel                          所有场景，帧 0/3/6/9，输出 logs/pixel/sheet.png
//   npm run pixel -- kinder primary        只画这几张（也可以写前缀，如 sch* 不支持，直接列名字）
//   npm run pixel -- --frames 0-15         连续 16 帧（看动画节奏）；也可以 0,4,8
//   npm run pixel -- --var "sex=F,rural=1" --var "sex=M"   每张图画几个版本（每个版本一行）
//   npm run pixel -- --scale 4 --out logs/pixel/a.png
//   npm run pixel -- --save base           记下每一格的指纹到 logs/pixel/base.json
//   npm run pixel -- --compare base        和记下的指纹比，列出变了的格子（重构素材时确认画面没变）
//
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { H, SCENES, W, type SceneCtx, type SceneId } from '../src/ui/pixel/scenes';

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const opts = (k: string) => { const r: string[] = []; let v; while ((v = opt(k)) != null) r.push(v); return r; };
const range = (s: string) => s.split(',').flatMap(p => { const [a, b] = p.split('-').map(Number); return b == null ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); });
const frames = range(opt('--frames') || '0,3,6,9');
const scale = +(opt('--scale') || 3);
const out = opt('--out') || 'logs/pixel/sheet.png';
const save = opt('--save'), compare = opt('--compare');
const vars: [string, SceneCtx][] = opts('--var').map(v => [v, Object.fromEntries(v.split(',').map(kv => {
  const [k, x] = kv.split('='); return [k, k === 'sex' || k === 'season' ? x : k === 'rural' ? x === '1' || x === 'true' : +x];
}))]);
if (!vars.length) vars.push(['sex=M', { sex: 'M', seed: 2 }]);
const all = Object.keys(SCENES) as SceneId[];
const ids = argv.length ? argv.filter(a => { if (!(a in SCENES)) { console.error(`没有这个场景：${a}（有：${all.join(' ')}）`); process.exit(1); } return true; }) as SceneId[] : all;

// ---------- 画 ----------
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const PAD = 6 * scale, LABEL = 7 * 2, cw = W * scale, ch = H * scale;
const rows = ids.flatMap(id => vars.map(([vn, ctx]) => ({ id, vn, ctx })));
const SW = PAD + frames.length * (cw + PAD), SH = PAD + rows.length * (LABEL + ch + PAD);
const img = Buffer.alloc(SW * SH * 4);
const put = (x: number, y: number, [r, g, b]: number[]) => { if (x < 0 || y < 0 || x >= SW || y >= SH) return; const k = (y * SW + x) * 4; img[k] = r; img[k + 1] = g; img[k + 2] = b; img[k + 3] = 255; };
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, [243, 234, 216]);

// 标签用 3×5 的小字（只有字母、数字和几个符号）
const F: Record<string, string> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111', f: '111100110100100',
  g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010', k: '101101110101101', l: '100100100100111',
  m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100', q: '010101101110011', r: '110101110101101',
  s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101',
  y: '101101010010010', z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  '=': '000111000111000', ',': '000000000010100', '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', ' ': '000000000000000',
};
const text = (s: string, x: number, y: number, k = 2) => [...s.toLowerCase()].forEach((c, n) => {
  const g = F[c] || F[' ']; for (let i = 0; i < 15; i++) if (g[i] === '1') for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) put(x + (n * 4 + i % 3) * k + a, y + Math.floor(i / 3) * k + b, [90, 75, 60]);
});

const prints: Record<string, string> = {};
rows.forEach(({ id, vn, ctx }, r) => {
  const y0 = PAD + r * (LABEL + ch + PAD);
  text(`${id}  ${vn}`, PAD, y0);
  frames.forEach((t, c) => {
    const x0 = PAD + c * (cw + PAD), pic = SCENES[id](ctx, t);
    text(`t=${t}`, x0 + cw - 24, y0);
    prints[`${id}|${vn}|${t}`] = createHash('md5').update(pic.d.join(',')).digest('hex').slice(0, 12);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const col = pic.d[j * W + i]; if (!col) continue;
      const rgb = hex(col); for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) put(x0 + i * scale + a, y0 + LABEL + j * scale + b, rgb);
    }
  });
});

// ---------- PNG ----------
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((SW * 4 + 1) * SH);
for (let y = 0; y < SH; y++) img.copy(raw, y * (SW * 4 + 1) + 1, y * SW * 4, (y + 1) * SW * 4);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}  ${rows.length} 行 × ${frames.length} 帧（${SW}×${SH}）`);

// ---------- 指纹 ----------
const fp = (name: string) => `logs/pixel/${name}.json`;
if (save) { writeFileSync(fp(save), JSON.stringify(prints, null, 1)); console.log(`指纹存到 ${fp(save)}`); }
if (compare) {
  const old = JSON.parse(readFileSync(fp(compare), 'utf8'));
  const changed = Object.keys(prints).filter(k => k in old && old[k] !== prints[k]);
  console.log(changed.length ? `和 ${compare} 比，变了 ${changed.length} 格：\n  ${changed.join('\n  ')}` : `和 ${compare} 比，画面完全一样`);
}
