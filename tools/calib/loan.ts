// 校准：loan。运行：npm run calib -- loan
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, isWorking, runHeadlessYear } from './lib';

const result = (() => {const N=4000;let bought=0,kinds={},prepay=0,arrears=0,fore=0,sold=0,hpf30=0,w30=0,bal30=[],buyAge=[],hold=0,first=[];
 for(let i=0;i<N;i++){birth(91+i*13,{headless:true});const L=E.S;let g=0,had=false;
  while(L.phase==='life'&&g++<130){runHeadlessYear();
   if(L.age===30&&isWorking()){w30++;if(L.hpfOn){hpf30++;bal30.push(L.hpf||0);}}
   if(L.house&&!had){had=true;bought++;buyAge.push(L.age);const k=(L.loans||[]).map(l=>l.kind).sort().join('+')||'cash';kinds[k]=(kinds[k]||0)+1;}
  }
  for(const e of L.log){ if(e.t.includes('提前还了')||e.t.includes('一次还清'))prepay++; if(e.t.includes('法院拍卖'))fore++; if(e.t.includes('急着出手'))sold++; if(e.t.includes('东拼西凑'))hold++; }
 }
 const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
 return JSON.stringify({everBought:(bought/N*100).toFixed(0)+'%',medianBuyAge:med(buyAge),loanMix:Object.fromEntries(Object.entries(kinds).map(([k,v])=>[k,(v/bought*100).toFixed(0)+'%'])),hpfCoverageAt30:(hpf30/w30*100).toFixed(0)+'%',medianHpfBalanceAt30:Math.round(med(bal30)),prepayEvents:(prepay/N*100).toFixed(1)+'%',arrearsHold:(hold/N*100).toFixed(1)+'%',distressSale:(sold/N*100).toFixed(1)+'%',foreclosure:(fore/N*100).toFixed(1)+'%'});})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
