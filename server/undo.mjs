const keys = {items:'id',events:'id',sales:'date',drafts:'item'}

export function inverseChanges(before, after) {
  return Object.fromEntries(Object.entries(keys).map(([set,key])=>{
    const old = new Map((before[set]??[]).map(row=>[row[key],row]))
    const next = new Map((after[set]??[]).map(row=>[row[key],row]))
    const remove = [...next.keys()].filter(id=>!old.has(id))
    const restore = [...old.values()].filter(row=>JSON.stringify(next.get(row[key]))!==JSON.stringify(row))
    return [set,{remove,restore}]
  }))
}

export function revertChanges(state, inverse) {
  const result={...state}
  for (const [set,key] of Object.entries(keys)) {
    const {remove,restore}=inverse[set]
    const deleted=new Set(remove)
    const replacements=new Map(restore.map(row=>[row[key],row]))
    result[set]=(state[set]??[]).filter(row=>!deleted.has(row[key])).map(row=>{
      const replacement=replacements.get(row[key])
      replacements.delete(row[key])
      return replacement??row
    })
    result[set].push(...replacements.values())
  }
  return result
}
