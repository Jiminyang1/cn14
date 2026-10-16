// 一次性脚本：用重构前的 js/*.js（经典脚本、全局作用域）生成 tests/golden.json。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { runAll } from './harness.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ctx = { console, Math, JSON, Object, Array, Set, Number, String };
vm.createContext(ctx);
for (const f of ['data.js', 'real.js', 'engine.js', 'loans.js', 'parents.js', 'gaokao.js', 'content.js'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
const api = vm.runInContext('({ birth, runHeadlessYear, newLife, tick, resolveDec, autoPick, getS: () => S })', ctx);
const out = runAll(api);
fs.writeFileSync(path.join(root, 'tests', 'golden.json'), JSON.stringify(out, null, 1) + '\n');
console.log('headless', Object.keys(out.headless).length, 'main', Object.keys(out.main).length);
