const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const u=[],r=[],qu=[0,0,0,0,0],qr=[0,0,0,0,0];for(let i=0;i<12000;i++){birth(91+i*7,{headless:true});(S.rural?r:u).push(S.famPC);(S.rural?qr:qu)[S.q-1]++;}
const med=a=>Math.round(a.sort((x,y)=>x-y)[Math.floor(a.length/2)]);const pc=a=>a.map(x=>(x/a.reduce((s,y)=>s+y,0)*100).toFixed(0)+'%').join(' ');
return JSON.stringify({urbanMedian:med(u),ruralMedian:med(r),urbanQ:pc(qu),ruralQ:pc(qr)});})()`,c));
