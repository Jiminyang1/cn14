// 校准：par。运行：npm run calib -- par
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth } from './lib';

const result = (() => {const u=[],r=[],qu=[0,0,0,0,0],qr=[0,0,0,0,0];for(let i=0;i<12000;i++){birth(91+i*7,{headless:true});(E.S.rural?r:u).push(E.S.famPC);(E.S.rural?qr:qu)[E.S.q-1]++;}
const med=a=>Math.round(a.sort((x,y)=>x-y)[Math.floor(a.length/2)]);const pc=a=>a.map(x=>(x/a.reduce((s,y)=>s+y,0)*100).toFixed(0)+'%').join(' ');
return JSON.stringify({urbanMedian:med(u),ruralMedian:med(r),urbanQ:pc(qu),ruralQ:pc(qr)});})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
