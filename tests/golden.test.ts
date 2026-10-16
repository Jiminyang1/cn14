// 重构不应改变任何一个人生：固定 seed 下最终状态的哈希必须与 golden.json 一致。
// 有意修改了模拟规则、结果本来就该变时，确认无误后运行 `UPDATE_GOLDEN=1 npm test` 重新生成。
import { writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import golden from './golden.json';
import { runAll } from './harness.ts';
import * as E from '../src/engine';

test('engine matches golden snapshot', () => {
  const out = runAll({ ...E, getS: () => E.S });
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
    return;
  }
  expect(out).toEqual(golden);
});
