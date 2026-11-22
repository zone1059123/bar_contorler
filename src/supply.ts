const key='barkeep-supply-days'
export function readSupply() {
  try {
    const v=JSON.parse(localStorage.getItem(key)??'null')
    if (v&&[v.lead,v.buffer].every(n=>Number.isInteger(n)&&n>=0&&n<=60)) return {lead:v.lead as number,buffer:v.buffer as number}
  } catch {}
  return {lead:3,buffer:5}
}
export function saveSupply(value:{lead:number;buffer:number}) {
  localStorage.setItem(key,JSON.stringify(value))
}
