import {DAY,dateKey,midnight,INGREDIENTS} from '../server/model.mjs'
import type {State,Floor,Entry} from './types'
export {DAY,dateKey,midnight,INGREDIENTS}
export const floors: Floor[]=['1F','3F']
export const short=(n:number|null|undefined,digits=2)=>n==null?'—':n.toLocaleString('zh-TW',{maximumFractionDigits:digits})
export const money=(n:number|null|undefined)=>n==null?'—':'NT$ '+short(n)
export const percentage=(n:number|null|undefined)=>n==null?'—':short(n*100,1)+'%'
export const asNumber=(v:string)=>v.trim()===''?null:Number(v)
export const shift=(date:string,days:number)=>dateKey(midnight(date)+days*DAY)
export function period(kind:string) {
  const today=dateKey()
  const start=kind==='month'?today.slice(0,8)+'01':shift(today,-((new Date(midnight(today)+8*3600000).getUTCDay()+6)%7))
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
export function sample(now=Date.now()):State {
  const data=[['London Dry 琴酒','基酒',720,700,'gin',1.5,4.2,6],['Kentucky 波本威士忌','基酒',980,750,'whiskey',2.3,5.4,6],['Campari 金巴利','利口酒',690,750,'campari',0.8,2.1,3],['Blanco 龍舌蘭','基酒',840,700,'tequila',7.5,2.1,0],['Smirnoff 伏特加','基酒',450,700,'vodka',12.7,4.1,0],['加勒比白蘭姆酒','基酒',580,750,'rum',8.2,3.2,0],['Cointreau 君度','利口酒',750,700,'triple',4.5,1.8,0],['Dolín 甜香艾酒','香艾酒',620,750,'sweet',3.2,1.4,0],['通寧水','軟飲',38,200,'tonic',22,13,0],['蘇打水','軟飲',25,330,'soda',18,9,0],['芳香苦精','苦精',480,200,'bitters',6.2,0.3,0],['單糖漿','糖漿',150,500,'sugar',7.5,1.5,0]] as const
  const events:Entry[]=[]
  const start=now-7*DAY
  const items=data.map(([name,category,price,ml,ingredient,balance,used,ordered],index)=>{
    const id='s'+index
    const push=(type:string,at:number,extra:Partial<Entry>)=>events.push({id:'e'+events.length,type,at,item:id,...extra})
    const f3=ordered?0:Math.floor(balance*.55)
    const receipts=[[],[],[],[[3,2],[6,1]],[[2,2],[5,2],[7,2]],[[4,2],[6,1]],[[4,1]],[[2,1]],[[3,4],[5,3]],[[1,3],[5,2],[7,2]],[],[[6,2]]][index]
    for (let d=0;d<=7;d++) {
      const future=receipts.filter(([day])=>day>d).reduce((sum,[,qty])=>sum+qty,0)
      const value=+(balance-f3+(7-d)*used/7-future).toFixed(5)
      const bought=receipts.find(([day])=>day===d)?.[1]
      if(bought)push('receipt',start+(d-0.25)*DAY,{floor:'1F',qty:bought,price})
      const whole=Math.floor(value)
      push('count',start+d*DAY,{floor:'1F',whole,open:+(value-whole).toFixed(5)} as Partial<Entry>)
      push('count',start+d*DAY,{floor:'3F',whole:f3,open:0} as Partial<Entry>)
    }
    if (ordered) {
      push('order',now-8*DAY,{qty:ordered,received:ordered,closed:true,balance:index===0?1:0.6,batch:'demo-order',price})
      push('receipt',now-7.5*DAY,{floor:'1F',qty:ordered,price})
    }
    return {id,name,category,price,ml,ingredient}
  })
  const sales=Array.from({length:14},(_,i)=>({date:dateKey(now-i*DAY),beverage:5280+i*156,overall:6750+i*238,extra:i===0?350:50}))
  return {items,events,sales,applied:[]}
}
