// 校准：mig。运行：npm run calib -- mig
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { REGION_OF, birth, parentWorkLoc } from './lib';

const result = (() => {const city={},kind={},n={all:0,cross:0},byReg={},hn={};let mig=0,N=20000,same=0,both=0;
for(let i=0;i<N;i++){birth(3+i*11,{headless:true}); if(E.S.flags.mig)mig++; for(const k of ['dad','mom']){const p=E.S.fam[k]; if(p.jk!=='migrant')continue; const L=parentWorkLoc(p); n.all++; const x=L.p!==E.S.home.p; if(x)n.cross++; const r=REGION_OF[E.S.home.p]||'west'; byReg[r]=byReg[r]||[0,0]; byReg[r][0]++; if(x)byReg[r][1]++; city[L.city]=(city[L.city]||0)+1; kind[L.kind]=(kind[L.kind]||0)+1; if(E.S.home.p==='HN'&&!x) hn[L.city]=(hn[L.city]||0)+1;}
 if(E.S.fam.dad.jk==='migrant'&&E.S.fam.mom.jk==='migrant'){both++; if(parentWorkLoc(E.S.fam.dad).city===parentWorkLoc(E.S.fam.mom).city)same++;}}
const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>k+' '+(v/n.all*100).toFixed(1)+'%').join(', ');
const hnT=Object.values(hn).reduce((a,b)=>a+b,0);
return JSON.stringify({migrantParents:n.all, crossShare:(n.cross/n.all*100).toFixed(1)+'%', byRegion:Object.fromEntries(Object.entries(byReg).map(([k,[a,b]])=>[k,(b/a*100).toFixed(0)+'%'])), kind:top(kind), topCities:top(city), hunanInProv:Object.entries(hn).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(v/hnT*100).toFixed(0)+'%').join(', '), coupleSameCity:(same/both*100).toFixed(0)+'%', migKid:(mig/N*100).toFixed(1)+'%'},null,1);})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
