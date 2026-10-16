const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const g={};let errs=0;for(let i=0;i<4000;i++){try{birth(77+i*13,{headless:true});if(!(S.famDebt>0))continue;
 const k=(S.rural?'rural':'urban')+'/'+(S.famDebtWhy==='房贷'?'mort':'other'), d0=S.famDebt, neg=S.famMoney+(S.famHouse.v||0)-S.famDebt<0; let y=null,G=0;
 while(S.phase==='life'&&G++<60){runHeadlessYear(); if(y==null&&!(S.famDebt>0)&&!S.flags.inherited) y=S.age;}
 (g[k]=g[k]||{y:[],neverBy60:0,neg:0,n:0}); const x=g[k]; x.n++; if(neg)x.neg++; if(y==null)x.neverBy60++; else x.y.push(y);}catch(e){errs++;if(errs<3)console.log(e.stack.slice(0,300));}}
 const q=(a,p)=>{a=a.slice().sort((m,n)=>m-n);return a[Math.floor(a.length*p)]};const r={errs};
 for(const k in g){const x=g[k];r[k]={n:x.n,negNetWorthAtBirth:(x.neg/x.n*100).toFixed(0)+'%',payoffAge_p25:q(x.y,.25),median:q(x.y,.5),p75:q(x.y,.75),p90:q(x.y,.9),notPaidBy60:(x.neverBy60/x.n*100).toFixed(0)+'%'};}
 return JSON.stringify(r,null,1);})()`,c));
