import type {Entry, Floor, Item, Slot, State} from '../src/types'
export const DAY:number
export const FLOORS:Floor[]
export const INGREDIENTS:Record<string,string>
export function dateKey(at?:number):string
export function midnight(key:string):number
export function total(slot:Slot|null|undefined):number|null
export function stock(events:Entry[],item:string,cutoff?:number):Record<Floor,Slot|null>
export function suggestIngredient(name:string):string
export type Usage={used:number|null;days:number;daily:number|null;anomaly:boolean;latest:number|null}
export function demand(events:Entry[],item:string,at?:number,lead?:number,buffer?:number):Omit<Usage,'days'>&{coverage:number; balance:number|null;days:number|null;pending:number;proposed:number|null;last:Entry|undefined;weekly:number|null;urgent:boolean}
export type CostRow={item:Item;receiving:number;used:number|null;usageCost:number|null;cogs:number|null;cleared:number|null;ml:number|null;h:Usage;calibrated:boolean}
export function costReport(state:State,start:number,end:number,basis?:string,revenueType?:string):{rows:CostRow[];purchases:number;use:number|null;cogs:number|null;extra:number;totalCost:number|null;revenue:number|null;revenueDays:number;expectedDays:number;missingUse:number;missingCogs:number}
