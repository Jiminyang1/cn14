// 校准脚本共用：引擎的全部导出。当前人生用 E.S 读取（S 是会被替换的绑定）。
export * from '../../src/engine';
// PERS=0 npm run calib -- … ：关掉性格跑，用来对照加性格前后
import { PERS } from '../../src/engine';
if (process.env.PERS === '0') PERS.on = false;
