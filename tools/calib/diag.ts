// 校准：diag。运行：npm run calib -- diag
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { DEC, birth, runHeadlessYear } from './lib';

const result = (() => {const B={};const bin=a=>a<22?'18-21':a<26?'22-25':a<30?'26-29':a<35?'30-34':'35-44';
const _r=DEC.romance.apply;DEC.romance.apply=(k,ctx)=>{const b=B[bin(E.S.age)];b.rom++;if(k==='go')b.go++;const r=_r(k,ctx);if(k==='go'&&E.S.fam.dating)b.acc++;return r;};const _m=DEC.marry.apply;DEC.marry.apply=(k,ctx)=>{const b=B[bin(E.S.age)];b.mar++;b['m_'+k]=(b['m_'+k]||0)+1;return _m(k,ctx);};
for(let i=0;i<3000;i++){birth(31+i*17,{headless:true});let g=0;while(E.S.phase==='life'&&E.S.age<45&&g++<50){const b=B[bin(E.S.age)]=B[bin(E.S.age)]||{py:0,single:0,dating:0,rom:0,go:0,acc:0,mar:0}; if(E.S.age>=18&&!E.S.fam.married){b.py++; if(E.S.fam.dating)b.dating++; else b.single++;} runHeadlessYear();}}
const r={};for(const k of ['18-21','22-25','26-29','30-34','35-44']){const b=B[k];r[k]={unmarriedPY:b.py,datingShare:(b.dating/b.py*100).toFixed(0)+'%',meetsPerSingleYear:(b.rom/b.single).toFixed(2),goRate:(b.go/b.rom*100).toFixed(0)+'%',acceptRate:(b.acc/b.go*100).toFixed(0)+'%',marryDecPerDatingYear:(b.mar/b.dating).toFixed(2),marry:Object.entries(b).filter(([x])=>x.startsWith('m_')).map(([x,v])=>x.slice(2)+':'+v).join(' ')};}
return JSON.stringify(r,null,1);})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
