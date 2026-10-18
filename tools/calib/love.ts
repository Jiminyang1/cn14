// 校准：love。运行：npm run calib -- love
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, myEdu, runHeadlessYear } from './lib';

const result = (() => {const N=4000;let exes=[],eduSame=0,eduN=0,gap=[],ptInc=[],myInc=[],errs=0,firstDate=[],relBefore=[];
for(let i=0;i<N;i++){try{birth(31+i*17,{headless:true});let g=0,fd=null,nRel=0,last=null;while(E.S.phase==='life'&&E.S.age<45&&g++<50){runHeadlessYear(); if(E.S.fam.dating&&E.S.fam.dating!==last){last=E.S.fam.dating;nRel++; if(fd==null)fd=E.S.age;} if(E.S.fam.partner&&E.S.fam.partner.marriedAt!=null&&!E.S.flags.am2){E.S.flags.am2=1;const p=E.S.fam.partner;eduN++;if(p.edu===myEdu())eduSame++;gap.push((E.S.sex==='M'?1:-1)*(p.age-E.S.age));relBefore.push(nRel);}}
 exes.push((E.S.loves||[]).filter(l=>l.kind==='love'&&l.end!=null).length); if(fd!=null)firstDate.push(fd); if(E.S.fam.partner&&E.S.fam.partner.alive&&E.S.fam.partner.inc&&E.S.income){ptInc.push(E.S.fam.partner.inc);myInc.push(E.S.income);}}catch(e){errs++;if(errs<3)console.log(e.stack.slice(0,400));}}
const m=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);const med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
return JSON.stringify({errs,exesBy45:m(exes),relationshipsBeforeMarriage:m(relBefore),firstDatingAge:m(firstDate),spouseSameEdu:(eduSame/eduN*100).toFixed(0)+'%',spouseAgeGap_wifeYounger:m(gap),medianSpouseInc:med(ptInc),medianOwnInc:med(myInc)});})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
