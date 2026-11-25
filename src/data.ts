import {DAY,dateKey,midnight,mondayKey,taipeiTime,parseTaipeiTime,INGREDIENTS} from '../server/model.mjs'
import type {Floor} from './types'
export {DAY,dateKey,midnight,taipeiTime,parseTaipeiTime,INGREDIENTS}
export const floors: Floor[]=['1F','3F']
export const short=(n:number|null|undefined,digits=2)=>n==null?'—':n.toLocaleString('zh-TW',{maximumFractionDigits:digits})
export const money=(n:number|null|undefined)=>n==null?'—':'NT$ '+short(n)
export const percentage=(n:number|null|undefined)=>n==null?'—':short(n*100,1)+'%'
export const asNumber=(v:string)=>v.trim()===''?null:Number(v)
export const shift=(date:string,days:number)=>dateKey(midnight(date)+days*DAY)
export function period(kind:string) {
  const today=dateKey()
  const start=kind==='month'?today.slice(0,8)+'01':mondayKey()
  return {start,end:today}
}
export const recipes = [
  {name:'Negroni',zh:'尼格羅尼',group:'攪拌',ingredients:[['gin','30 ml'],['campari','30 ml'],['sweet','30 ml']],method:'加冰攪拌至冰冷，濾入裝有大冰塊的古典杯，以柳橙皮裝飾。'},
  {name:'Old Fashioned',zh:'古典雞尾酒',group:'攪拌',ingredients:[['whiskey','45 ml'],['bitters','2 下'],['sugar','5 ml']],method:'將材料加冰攪拌，倒入古典杯，以橙皮裝飾。'},
  {name:'Margarita',zh:'瑪格麗特',group:'搖盪',ingredients:[['tequila','50 ml'],['triple','20 ml'],['lime','15 ml']],method:'加冰搖盪後濾入冰鎮杯，杯緣可沾鹽。'},
  {name:'Whiskey Sour',zh:'威士忌酸酒',group:'搖盪',ingredients:[['whiskey','45 ml'],['lemon','25 ml'],['sugar','20 ml']],method:'加冰搖盪後濾入冰鎮杯。蛋白可選用。'},
  {name:'Martini',zh:'馬丁尼',group:'攪拌',ingredients:[['gin','60 ml'],['dry','10 ml']],method:'加冰攪拌至冰冷，濾入馬丁尼杯，以橄欖或檸檬皮裝飾。'},
  {name:'Mojito',zh:'莫西托',group:'直調',ingredients:[['rum','45 ml'],['lime','20 ml'],['sugar','15 ml'],['mint','6 片'],['soda','補滿']],method:'輕壓薄荷並與萊姆汁、糖漿混合，加蘭姆酒與冰，最後補蘇打水。'},
  {name:'Gin Tonic',zh:'琴通寧',group:'直調',ingredients:[['gin','45 ml'],['tonic','120 ml']],method:'在高球杯加滿冰塊，倒入琴酒與通寧水，輕攪並以萊姆角裝飾。'},
  {name:'Espresso Martini',zh:'濃縮咖啡馬丁尼',group:'搖盪',ingredients:[['vodka','50 ml'],['coffee','30 ml'],['sugar','10 ml'],['espresso','30 ml']],method:'用新鮮濃縮咖啡加冰搖盪，濾入冰鎮杯。'},
  {name:'Aperol Spritz',zh:'阿佩羅開胃酒',group:'直調',ingredients:[['sparkling','90 ml'],['aperol','60 ml'],['soda','30 ml']],method:'在葡萄酒杯中加冰直調，以柳橙片裝飾。'}
]
export const ingredientLabel=(key:string)=>(INGREDIENTS as Record<string,string>)[key]??'濃縮咖啡'
