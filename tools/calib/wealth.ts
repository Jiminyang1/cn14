// 校准：wealth。运行：npm run calib -- wealth
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, rural } from './lib';

const result = (() => {const g={urban:{m:[],d:0,n:0,dti:[]},rural:{m:[],d:0,n:0,dti:[]}};for(let i=0;i<12000;i++){birth(91+i*7,{headless:true});const k=E.S.rural?'rural':'urban',x=g[k];x.n++;x.m.push(E.S.famMoney);if(E.S.famDebt>0){x.d++;x.dti.push(E.S.famDebt/(E.S.famPC*E.S.famSize));}}
const med=a=>Math.round(a.slice().sort((p,q)=>p-q)[Math.floor(a.length/2)]);const r={};for(const k in g){const x=g[k];r[k]={savingsMedian:med(x.m),debtShare:(x.d/x.n*100).toFixed(0)+'%',debtToIncomeMedian:(x.dti.slice().sort((p,q)=>p-q)[Math.floor(x.dti.length/2)]).toFixed(2)};}return JSON.stringify(r);})();
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
