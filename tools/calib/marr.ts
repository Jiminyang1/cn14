// 校准：marr。运行：npm run calib -- marr
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, runHeadlessYear } from './lib';

const result = (() => {const c={},n={};const age1={};for(let i=0;i<5000;i++){birth(31+i*17,{headless:true});const L=E.S;let g=0;while(L.phase==='life'&&L.age<45&&g++<50){runHeadlessYear();
 if(L.fam.partner&&L.fam.partner.marriedAt!=null&&!L.flags.am){L.flags.am=1;(age1[L.sex]=age1[L.sex]||[]).push(L.fam.partner.marriedAt);}
 for(const a of [27,32,42]) if(L.age===a){const k=L.sex+a;n[k]=(n[k]||0)+1;if(!L.fam.partner&&!L.flags.divorced)c[k]=(c[k]||0)+1;}}}
 const r={};for(const k in n)r[k]=(c[k]/n[k]*100).toFixed(1)+'%';const m=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);return JSON.stringify({neverMarried:r,firstMarriageAge:{M:m(age1.M),F:m(age1.F)}});})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
