// 当前正在模拟的人生（S）。同一时刻只有一个；同伴的人生在后台跑完时会临时替换它（lifecycle.ts 的 runCompanion）。
// 其他模块通过 import { S } 读取（ES module 的绑定是活的），只能通过 setS 替换。
import type { Life } from './types';

export let S: Life = null;

// 替换当前人生（出生、读档、测试用）
export function setS(x: Life) { S = x; }
