// 校准：par。运行：npm run calib -- par
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth } from './lib';

const result = (() => {const u=[],r=[],qu=[0,0,0,0,0],qr=[0,0,0,0,0];let both=0,one=0,momOnly=0,rur=0,momMig=0,dadMig=0;
for(let i=0;i<12000;i++){birth(91+i*7,{headless:true});(E.S.rural?r:u).push(E.S.famPC);(E.S.rural?qr:qu)[E.S.q-1]++;
 // 留守：父母都外出 / 一方外出（其中只有妈妈外出的比例）；农村父母外出务工的比例
 if(E.S.flags.lb==='both')both++; if(E.S.flags.lb==='one'){one++;if(E.S.flags.lbWho==='mom')momOnly++;}
 if(E.S.rural){rur++;if(E.S.fam.mom.jk==='migrant')momMig++;if(E.S.fam.dad.jk==='migrant')dadMig++;}}
const med=a=>Math.round(a.sort((x,y)=>x-y)[Math.floor(a.length/2)]);const pc=a=>a.map(x=>(x/a.reduce((s,y)=>s+y,0)*100).toFixed(0)+'%').join(' ');const p=(a,b)=>(a/b*100).toFixed(0)+'%';
return JSON.stringify({urbanMedian:med(u),ruralMedian:med(r),urbanQ:pc(qu),ruralQ:pc(qr),lbBothOfLb:p(both,both+one),lbMomOnlyOfOne:p(momOnly,one),ruralMomMigrant:p(momMig,rur),ruralDadMigrant:p(dadMig,rur)});})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
