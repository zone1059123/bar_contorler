import type {Entry,Floor} from './types'
export type DialogState = {kind:'count'|'item'|'transfer'|'receipt'|'sale'|'calibration'|'cogs';item?:string;floor?:Floor;order?:Entry}
export const floorLabel=(f:Floor|'all')=>f==='all'?'全館庫存':f
