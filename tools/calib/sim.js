const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.argv[2], N=+process.argv[3]||3000;
const ctx={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(ctx);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),ctx,{filename:f});
const r=vm.runInContext(`(()=>{
 const N=${N}; const agesM=[],agesF=[],ages=[],edu={},cause={},job={},tier={}; let mar=0,kids=0,mar40=0,hasHouse=0,lb=0,mig=0,big=0,errs=0;
 for(let i=0;i<N;i++){ try{ birth(1000+i*7,{headless:true}); const L=S; let g=0; while(L.phase==='life'&&g++<130){ runHeadlessYear(); if(L.age===40&&(L.fam.married||L.flags.divorced))mar40++; }
  ages.push(L.death.age); (L.sex==='M'?agesM:agesF).push(L.death.age); edu[EDU_LV[L.edu]]=(edu[EDU_LV[L.edu]]||0)+1; cause[L.death.cause]=(cause[L.death.cause]||0)+1;
  const mj=mainJob(L)||'(none)'; job[mj]=(job[mj]||0)+1; if(L.flags.tier) tier[L.flags.tier]=(tier[L.flags.tier]||0)+1;
  if(L.fam.partner||L.flags.divorced) mar++; kids+=L.fam.kids.length; if(L.house) hasHouse++; if(L.flags.lb) lb++; if(L.flags.mig) mig++; if(L.places.some(c=>BIG[c])) big++;
 }catch(e){errs++; if(errs<4) console.log('ERR',e.stack.split('\\n').slice(0,3).join(' | '));} }
 const n=ages.length, mean=ages.reduce((a,b)=>a+b,0)/n; const pct=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(v/n*100).toFixed(1)+'%').join(', ');
 const a40=ages.filter(a=>a>=40).length;
 const mn=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1); return {n,errs,meanM:mn(agesM),meanF:mn(agesF),meanDeathAge:mean.toFixed(1),u5:(ages.filter(a=>a<5).length/n*1000).toFixed(1)+'‰',edu:pct(edu),tier:pct(tier),cause:pct(cause),job:pct(job),everMarried:(mar/n*100).toFixed(0)+'%',married40:(mar40/a40*100).toFixed(0)+'% of survivors',kidsPer:(kids/n).toFixed(2),house:(hasHouse/n*100).toFixed(0)+'%',leftBehind:(lb/n*100).toFixed(1)+'%',migrantKid:(mig/n*100).toFixed(1)+'%',livedBigCity:(big/n*100).toFixed(0)+'%'};
})()`,ctx);
console.log(JSON.stringify(r,null,1));
