// 校准：crisis（35岁被裁）。运行：npm run calib -- crisis [N]
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { JOBS, birth, runHeadlessYear } from './lib';
const N = +process.argv[3] || 6000;

const result = (() => {
  // pyAll：22–60 岁年初在私企工作的人年；py：其中 35–48 岁的；hit：这些年里出了「35岁」抉择
  let pyAll = 0, hitAll = 0, py = 0, hit = 0, at35 = 0, at35hit = 0, ever = 0, everHit = 0;
  const byAge = {}, byJob = {};
  for (let i = 0; i < N; i++) {
    birth(3000 + i * 7, { headless: true }); const L = E.S;
    let g = 0, priv35 = false, everPriv = false, job35 = null;
    while (L.phase === 'life' && L.age <= 60 && g++ < 130) {
      const a = L.age, priv = !!(JOBS[L.job] && JOBS[L.job].priv);
      if (a === 35 && priv) { priv35 = true; job35 = L.job; }
      if (priv && a >= 35 && a <= 48) everPriv = true;
      runHeadlessYear();
      if (!priv || a < 22) continue;
      const h = L.done.dec_crisis === a;
      pyAll++; if (h) hitAll++;
      if (a >= 35 && a <= 48) { py++; if (h) { hit++; byAge[a] = (byAge[a] || 0) + 1; } }
    }
    const got = L.done.dec_crisis != null;
    if (priv35) { at35++; if (got) at35hit++; const j = byJob[JOBS[job35].n] = byJob[JOBS[job35].n] || [0, 0]; j[0]++; if (got) j[1]++; }
    if (everPriv) { ever++; if (got) everHit++; }
  }
  const p = (x, n) => (x / n * 100).toFixed(1) + '%';
  return {
    N, privYears22to60: pyAll, crisisShareOfPrivYears22to60: p(hitAll, pyAll),
    perYearHit35to48: p(hit, py),
    everHit_privAt35: p(at35hit, at35) + ` of ${at35}`,
    everHit_privAnyYear35to48: p(everHit, ever) + ` of ${ever}`,
    everHit_byJobAt35: Object.fromEntries(Object.entries(byJob).map(([k, [n, h]]) => [k, p(h, n) + ` of ${n}`])),
    hitsByAge: byAge,
  };
})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
