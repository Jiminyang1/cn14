const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[2];
const c={console,Math,JSON,Object,Array,Set,Number,String};vm.createContext(c);
for(const f of ['data.js','real.js','engine.js','loans.js','parents.js','gaokao.js','content.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
console.log(vm.runInContext(`(()=>{const B={};const bin=a=>a<22?'18-21':a<26?'22-25':a<30?'26-29':a<35?'30-34':'35-44';
const _o=resolveDec;resolveDec=function(id,d,k){const b=B[bin(S.age)];if(id==='romance'){b.rom++;if(k==='go')b.go++;} if(id==='marry'){b.mar++; b['m_'+k]=(b['m_'+k]||0)+1;} const before=!!S.fam.dating; _o(id,d,k); if(id==='romance'&&k==='go'&&S.fam.dating)b.acc++;};
for(let i=0;i<3000;i++){birth(31+i*17,{headless:true});let g=0;while(S.phase==='life'&&S.age<45&&g++<50){const b=B[bin(S.age)]=B[bin(S.age)]||{py:0,single:0,dating:0,rom:0,go:0,acc:0,mar:0}; if(S.age>=18&&!S.fam.married){b.py++; if(S.fam.dating)b.dating++; else b.single++;} runHeadlessYear();}}
const r={};for(const k of ['18-21','22-25','26-29','30-34','35-44']){const b=B[k];r[k]={unmarriedPY:b.py,datingShare:(b.dating/b.py*100).toFixed(0)+'%',meetsPerSingleYear:(b.rom/b.single).toFixed(2),goRate:(b.go/b.rom*100).toFixed(0)+'%',acceptRate:(b.acc/b.go*100).toFixed(0)+'%',marryDecPerDatingYear:(b.mar/b.dating).toFixed(2),marry:Object.entries(b).filter(([x])=>x.startsWith('m_')).map(([x,v])=>x.slice(2)+':'+v).join(' ')};}
return JSON.stringify(r,null,1);})()`,c));
