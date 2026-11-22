export type Floor = '1F'|'3F'
export type Slot = {whole:number;open:number;at?:number}
export type Item = {id:string;name:string;category:string;price:number|null;ml:number|null;ingredient:string}
export type Entry = {id:string;type:string;item:string;at:number;floor?:Floor;to?:Floor;qty?:number;price?:number|null;balance?:number|null;closed?:boolean;received?:number;batch?:string}
export type Sale = {date:string;beverage:number|null;overall:number|null;extra:number|null}
export type State = {items:Item[];events:Entry[];sales:Sale[];applied:string[]}
export type Save = (kind:string,body:unknown)=>Promise<void>
export type Screen = 'overview'|'inventory'|'orders'|'costs'|'import'|'recipes'|'recommend'
