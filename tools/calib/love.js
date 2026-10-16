const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const N=4000;let exes=[],eduSame=0,eduN=0,gap=[],ptInc=[],myInc=[],errs=0,firstDate=[],relBefore=[];
for(let i=0;i<N;i++){try{birth(31+i*17,{headless:true});let g=0,fd=null,nRel=0,last=null;while(S.phase==='life'&&S.age<45&&g++<50){runHeadlessYear(); if(S.fam.dating&&S.fam.dating!==last){last=S.fam.dating;nRel++; if(fd==null)fd=S.age;} if(S.fam.partner&&S.fam.partner.marriedAt!=null&&!S.flags.am2){S.flags.am2=1;const p=S.fam.partner;eduN++;if(p.edu===myEdu())eduSame++;gap.push((S.sex==='M'?1:-1)*(p.age-S.age));relBefore.push(nRel);}}
 exes.push(S.flags.exes||0); if(fd!=null)firstDate.push(fd); if(S.fam.partner&&S.fam.partner.alive&&S.fam.partner.inc&&S.income){ptInc.push(S.fam.partner.inc);myInc.push(S.income);}}catch(e){errs++;if(errs<3)console.log(e.stack.slice(0,400));}}
const m=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);const med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
return JSON.stringify({errs,exesBy45:m(exes),relationshipsBeforeMarriage:m(relBefore),firstDatingAge:m(firstDate),spouseSameEdu:(eduSame/eduN*100).toFixed(0)+'%',spouseAgeGap_wifeYounger:m(gap),medianSpouseInc:med(ptInc),medianOwnInc:med(myInc)});})()`,c));
