// 校准：debt。运行：npm run calib -- debt
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, runHeadlessYear } from './lib';

const result = (() => {const g={};let errs=0;for(let i=0;i<4000;i++){try{birth(77+i*13,{headless:true});if(!(E.S.famDebt>0))continue;
 const k=(E.S.rural?'rural':'urban')+'/'+(E.S.famDebtWhy==='房贷'?'mort':'other'), d0=E.S.famDebt, neg=E.S.famMoney+(E.S.famHouse.v||0)-E.S.famDebt<0; let y=null,G=0;
 while(E.S.phase==='life'&&G++<60){runHeadlessYear(); if(y==null&&!(E.S.famDebt>0)&&!E.S.flags.inherited) y=E.S.age;}
 (g[k]=g[k]||{y:[],neverBy60:0,neg:0,n:0}); const x=g[k]; x.n++; if(neg)x.neg++; if(y==null)x.neverBy60++; else x.y.push(y);}catch(e){errs++;if(errs<3)console.log(e.stack.slice(0,300));}}
 const q=(a,p)=>{a=a.slice().sort((m,n)=>m-n);return a[Math.floor(a.length*p)]};const r={errs};
 for(const k in g){const x=g[k];r[k]={n:x.n,negNetWorthAtBirth:(x.neg/x.n*100).toFixed(0)+'%',payoffAge_p25:q(x.y,.25),median:q(x.y,.5),p75:q(x.y,.75),p90:q(x.y,.9),notPaidBy60:(x.neverBy60/x.n*100).toFixed(0)+'%'};}
 return JSON.stringify(r,null,1);})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
