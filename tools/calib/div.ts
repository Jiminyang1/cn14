// 校准：div（离婚、父母离婚、被欺负）。运行：npm run calib -- div [N]
// 看：活到 60 岁的人里离过婚的比例（目标 12–15%）、离婚时的婚龄和年龄、每 100 个已婚人年几次；16 岁前父母离婚、被欺负过的比例。依据见 DATA.md「离婚」「校园欺凌」
// 用无界面的人生（抉择自动做掉）
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, runHeadlessYear } from './lib';
const N = +process.argv[3] || 4000;
let n16 = 0, par16 = 0, bully16 = 0, n60 = 0, div60 = 0, divN = 0, marPY = 0;
const dur = {}, age = {};
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (let i = 0; i < N; i++) {
  birth(7000 + i * 13, { headless: true });
  const L = E.S;
  for (let g = 0; L.phase === 'life' && g < 130; g++) {
    if (L.fam.married && L.fam.partner && L.fam.partner.alive) marPY++;
    // 离婚现在有两条路（抉择 split、Ta 提离婚），看 flags.divorced 有没有变
    const prev = L.flags.divorced, mAt = L.fam.partner?.marriedAt;
    runHeadlessYear();
    if (L.flags.divorced != null && L.flags.divorced !== prev && mAt != null) {
      const d = L.flags.divorced - mAt; divN++;
      bump(dur, d < 2 ? '0–1年' : d < 8 ? '2–7年' : d < 15 ? '8–14年' : d < 25 ? '15–24年' : '25年以上'); bump(age, L.flags.divorced < 60 ? `${Math.floor(L.flags.divorced / 10) * 10}多岁` : '60岁以后');
    }
    if (L.phase !== 'life') break;
    if (L.age === 16) { n16++; if (L.flags.parDiv) par16++; if (L.done.bully != null) bully16++; }
    if (L.age === 60) { n60++; if (L.flags.divorced) div60++; }
  }
}
const pct = (a, b) => (a / b * 100).toFixed(1) + '%';
const share = o => { const n = Object.values(o).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, pct(v, n)])); };
console.log(JSON.stringify({
  N, '活到60岁离过婚': `${pct(div60, n60)}（${n60}人）`, '每100个已婚人年离婚': +(divN / marPY * 100).toFixed(3),
  '离婚时的婚龄': share(dur), '离婚时的年龄': share(age),
  '16岁前父母离婚': pct(par16, n16), '16岁前被欺负过': pct(bully16, n16),
}, null, 1));
