const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const N=8000,o={};let teen=0,boys=0;const ur={urban:[0,0,0],rural:[0,0,0]};
for(let i=0;i<N;i++){birth(5+i*7,{headless:true});const x=o[S.order]=o[S.order]||{n:0,mom:[],first:[],gap:[],young:0,olderM:0,olderN:0,boy:0,bothGirls:0};x.n++;if(S.sex==='M'){x.boy++;boys++;}const ma=S.fam.mom.age;x.mom.push(ma);
 if(S.fam.sibs.length){const old=Math.max(...S.fam.sibs.map(s=>s.age));x.first.push(ma-old);if(ma-old<20)teen++;x.gap.push(Math.min(...S.fam.sibs.map(s=>s.age)));for(const s of S.fam.sibs){x.olderN++;if(s.sex==='M')x.olderM++;} if(S.order===3&&S.fam.sibs.every(s=>s.sex==='F'))x.bothGirls++;}else x.first.push(ma);
 const n0=S.fam.sibs.length;let g=0;while(S.phase==='life'&&S.age<15&&g++<20)runHeadlessYear();const y=S.fam.sibs.length-n0;if(y>0)x.young++;
 const fin=1+S.fam.sibs.length; ur[S.rural?'rural':'urban'][Math.min(3,fin)-1]++;}
const m=a=>a.length?(a.reduce((p,q)=>p+q,0)/a.length).toFixed(1):'-';const r={motherUnder20AtFirst:(teen/N*100).toFixed(1)+'%',srbAll:(boys/(N-boys)*100).toFixed(0)};
for(const k in o){const x=o[k];r['order'+k]={share:(x.n/N*100).toFixed(0)+'%',srb:(x.boy/(x.n-x.boy)*100).toFixed(0),momAgeAtYou:m(x.mom),momAgeAtFirst:m(x.first),gapToNearestOlder:m(x.gap),getsYoungerSib:(x.young/x.n*100).toFixed(0)+'%',olderSibsMale:x.olderN?(x.olderM/x.olderN*100).toFixed(0)+'%':'-',allOlderGirls:k==3?(x.bothGirls/x.n*100).toFixed(0)+'%':undefined};}
for(const k in ur){const t=ur[k].reduce((a,b)=>a+b,0);r['finalKids_'+k]=ur[k].map(v=>(v/t*100).toFixed(0)+'%').join(' / ');}
return JSON.stringify(r,null,1);})()`,c));
