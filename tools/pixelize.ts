// 把一张图（AI 生成的参考图、照片、草稿）变成我们的像素图：缩到目标尺寸，每个颜色换成调色板里最近的一个。
//
//   npm run pixelize -- 输入.png [--size 192x108] [--out logs/pixel/px.png] [--preview 4] [--colors 24] [--clean 1]
//
// 缩小用 macOS 自带的 sips（按面积取平均，比最近邻干净），再在这里按调色板量化。
// --colors：只用调色板里在这张图上最常用的前 N 种，画面更统一（默认全部）。
// 输出两张：px.png 是真实尺寸，px@N.png 是放大 N 倍、方便看的预览。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { C } from '../src/ui/pixel/pix';
import { WEAR } from '../src/ui/pixel/kit';

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const [w, h] = opt('--size', '192x108').split('x').map(Number);
const out = opt('--out', 'logs/pixel/px.png'), zoom = +opt('--preview', '4'), keepN = +opt('--colors', '0'), clean = +opt('--clean', '1');
const input = argv[0];
if (!input) { console.error('用法：npm run pixelize -- 输入.png [--size 192x108]'); process.exit(1); }

// ---------- 调色板：C 和衣服配色里的所有颜色 ----------
// EARTH：砖、瓦、土墙、木头这些中间色，量化房子时用得上（原调色板里缺）
const EARTH = ['#a8706a', '#94605a', '#7a4e48', '#6e665c', '#4a4540', '#3a3632', '#d9c7a6', '#b8a98c', '#8f7d63', '#e9e6df', '#a9b9c4', '#6a7884'];
const hexes = new Set<string>([...Object.values(C), ...Object.values(WEAR).flatMap(o => Object.values(o)), ...EARTH].filter(v => /^#[0-9a-f]{6}$/i.test(v)));
const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
let PAL = [...hexes].map(rgb);

// ---------- 缩小并转成 BMP（好解析） ----------
const dir = mkdtempSync(join(tmpdir(), 'pixelize-'));
const bmp = join(dir, 'a.bmp');
execFileSync('sips', ['-s', 'format', 'bmp', '-z', String(h), String(w), input, '--out', bmp], { stdio: 'ignore' });
const B = readFileSync(bmp);
const off = B.readUInt32LE(10), bw = B.readInt32LE(18), bhRaw = B.readInt32LE(22), bpp = B.readUInt16LE(28);
const bh = Math.abs(bhRaw), stride = Math.ceil(bw * bpp / 32) * 4;
const px: number[][] = [];
for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
  const row = bhRaw > 0 ? bh - 1 - y : y, k = off + row * stride + x * (bpp / 8);
  px.push([B[k + 2], B[k + 1], B[k]]);
}

// ---------- 量化：按人眼的权重找最近的调色板颜色 ----------
const dist = (a: number[], b: number[]) => { const r = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db; };
const nearest = (c: number[]) => { let bi = 0, bd = Infinity; PAL.forEach((p, i) => { const d = dist(c, p); if (d < bd) { bd = d; bi = i; } }); return bi; };
if (keepN) {
  const count = new Map<number, number>(); px.forEach(c => { const i = nearest(c); count.set(i, (count.get(i) || 0) + 1); });
  PAL = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, keepN).map(([i]) => PAL[i]);
}
let qi = px.map(c => nearest(c));
// 去杂点：一个像素和上下左右都不一样，而它们里有三个以上是同一种颜色，就换成那种颜色（--clean 0 关掉）
for (let pass = 0; pass < clean; pass++) qi = qi.map((v, k) => {
  const x = k % bw, y = Math.floor(k / bw); if (!x || !y || x === bw - 1 || y === bh - 1) return v;
  const nb = [qi[k - 1], qi[k + 1], qi[k - bw], qi[k + bw]]; if (nb.includes(v)) return v;
  const cnt = new Map<number, number>(); nb.forEach(n => cnt.set(n, (cnt.get(n) || 0) + 1));
  const [best, n] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]; return n >= 3 ? best : v;
});
const q = qi.map(i => PAL[i]);

// ---------- 写 PNG ----------
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
function png(file: string, W: number, H: number, at: (x: number, y: number) => number[]) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y), k = y * (W * 3 + 1) + 1 + x * 3; raw[k] = r; raw[k + 1] = g; raw[k + 2] = b; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
png(out, bw, bh, (x, y) => q[y * bw + x]);
const prev = out.replace(/\.png$/, `@${zoom}.png`);
png(prev, bw * zoom, bh * zoom, (x, y) => q[Math.floor(y / zoom) * bw + Math.floor(x / zoom)]);
console.log(`${out}（${bw}×${bh}，${new Set(q.map(c => c.join())).size} 种颜色）  预览：${prev}`);
