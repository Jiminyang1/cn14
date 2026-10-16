const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const city={},kind={},n={all:0,cross:0},byReg={},hn={};let mig=0,N=20000,same=0,both=0;
for(let i=0;i<N;i++){birth(3+i*11,{headless:true}); if(S.flags.mig)mig++; for(const k of ['dad','mom']){const p=S.fam[k]; if(p.jk!=='migrant')continue; const L=parentWorkLoc(p); n.all++; const x=L.p!==S.home.p; if(x)n.cross++; const r=REGION_OF[S.home.p]||'west'; byReg[r]=byReg[r]||[0,0]; byReg[r][0]++; if(x)byReg[r][1]++; city[L.city]=(city[L.city]||0)+1; kind[L.kind]=(kind[L.kind]||0)+1; if(S.home.p==='HN'&&!x) hn[L.city]=(hn[L.city]||0)+1;}
 if(S.fam.dad.jk==='migrant'&&S.fam.mom.jk==='migrant'){both++; if(parentWorkLoc(S.fam.dad).city===parentWorkLoc(S.fam.mom).city)same++;}}
const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>k+' '+(v/n.all*100).toFixed(1)+'%').join(', ');
const hnT=Object.values(hn).reduce((a,b)=>a+b,0);
return JSON.stringify({migrantParents:n.all, crossShare:(n.cross/n.all*100).toFixed(1)+'%', byRegion:Object.fromEntries(Object.entries(byReg).map(([k,[a,b]])=>[k,(b/a*100).toFixed(0)+'%'])), kind:top(kind), topCities:top(city), hunanInProv:Object.entries(hn).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(v/hnT*100).toFixed(0)+'%').join(', '), coupleSameCity:(same/both*100).toFixed(0)+'%', migKid:(mig/N*100).toFixed(1)+'%'},null,1);})()`,c));
