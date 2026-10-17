// 校准：sim。运行：npm run calib -- sim [N]
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { BIG, EDU_LV, birth, mainJob, runHeadlessYear } from './lib';
const N = +process.argv[3] || 3000;

const result = (() => {
  const agesM=[],agesF=[],ages=[],edu={},cause={},job={},tier={}; let mar=0,kids=0,mar40=0,hasHouse=0,lb=0,mig=0,big=0,errs=0; const peri={'15-34':[0,0,15,35],'35-59':[0,0,35,60]};
 for(let i=0;i<N;i++){ try{ birth(1000+i*7,{headless:true}); const L=E.S; let g=0; while(L.phase==='life'&&g++<130){ runHeadlessYear(); if(L.age===40&&(L.fam.married||L.flags.divorced))mar40++; }
  ages.push(L.death.age); (L.sex==='M'?agesM:agesF).push(L.death.age); edu[EDU_LV[L.edu]]=(edu[EDU_LV[L.edu]]||0)+1; cause[L.death.cause]=(cause[L.death.cause]||0)+1;
  const mj=mainJob(L)||'(none)'; job[mj]=(job[mj]||0)+1; if(L.flags.tier) tier[L.flags.tier]=(tier[L.flags.tier]||0)+1;
  if(L.fam.partner||L.flags.divorced) mar++; kids+=L.fam.kids.length; if(L.house) hasHouse++; if(L.flags.lb) lb++; if(L.flags.mig) mig++; if(L.places.some(c=>BIG[c])) big++;
  // 女性在怀孕中或产后一年内的月份占比（孕产期并发症的死因倍数 MATERNAL_K 用）：每个孩子算出生前 9 个月到出生后 12 个月
  if(L.sex==='F'){const dM=L.age*12+L.month; for(const k in peri){const P=peri[k],lo=P[2]*12,hi=Math.min(P[3]*12,dM); if(hi<=lo) continue; P[1]+=hi-lo; for(const kd of L.fam.kids) P[0]+=Math.max(0,Math.min(hi,kd.bornM+12)-Math.max(lo,kd.bornM-9));}}
 }catch(e){errs++; if(errs<4) console.log('ERR',e.stack.split('\n').slice(0,3).join(' | '));} }
 const n=ages.length, mean=ages.reduce((a,b)=>a+b,0)/n; const pct=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(v/n*100).toFixed(1)+'%').join(', ');
 const a40=ages.filter(a=>a>=40).length;
 const mn=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1); return {n,errs,meanM:mn(agesM),meanF:mn(agesF),meanDeathAge:mean.toFixed(1),u5:(ages.filter(a=>a<5).length/n*1000).toFixed(1)+'‰',edu:pct(edu),tier:pct(tier),cause:pct(cause),job:pct(job),everMarried:(mar/n*100).toFixed(0)+'%',married40:(mar40/a40*100).toFixed(0)+'% of survivors',kidsPer:(kids/n).toFixed(2),house:(hasHouse/n*100).toFixed(0)+'%',leftBehind:(lb/n*100).toFixed(1)+'%',migrantKid:(mig/n*100).toFixed(1)+'%',livedBigCity:(big/n*100).toFixed(0)+'%',perinatalShare:Object.entries(peri).map(([k,P])=>k+' '+(P[0]/P[1]*100).toFixed(1)+'%').join(', ')};
})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
