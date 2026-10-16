const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const g={urban:{m:[],d:0,n:0,dti:[]},rural:{m:[],d:0,n:0,dti:[]}};for(let i=0;i<12000;i++){birth(91+i*7,{headless:true});const k=S.rural?'rural':'urban',x=g[k];x.n++;x.m.push(S.famMoney);if(S.famDebt>0){x.d++;x.dti.push(S.famDebt/(S.famPC*S.famSize));}}
const med=a=>Math.round(a.slice().sort((p,q)=>p-q)[Math.floor(a.length/2)]);const r={};for(const k in g){const x=g[k];r[k]={savingsMedian:med(x.m),debtShare:(x.d/x.n*100).toFixed(0)+'%',debtToIncomeMedian:(x.dti.slice().sort((p,q)=>p-q)[Math.floor(x.dti.length/2)]).toFixed(2)};}return JSON.stringify(r);})()`,c));
