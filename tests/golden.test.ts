import { expect, test } from 'vitest';
import golden from './golden.json';
import { runAll } from './harness.ts';
import * as E from '../src/engine/engine';

// 重构不应改变任何一个人生：固定 seed 下最终状态的哈希必须与 golden.json 一致
test('engine matches golden snapshot', () => {
  const out = runAll({ ...E, getS: () => E.S });
  expect(out).toEqual(golden);
});
