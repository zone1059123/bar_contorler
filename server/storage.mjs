export async function readState(db, operationId) {
  const read=[
    db.prepare('SELECT r.revision,u.kind FROM bar_revision r LEFT JOIN bar_undo u ON u.id=1 AND u.revision=r.revision WHERE r.id=1'),
    db.prepare('SELECT id,name,category,price,ml,ingredient FROM items ORDER BY rowid'),
    db.prepare('SELECT payload FROM inventory_events ORDER BY rowid'),
    db.prepare('SELECT date,beverage,overall,extra FROM sales ORDER BY date'),
    db.prepare('SELECT item_id AS item,qty FROM order_drafts ORDER BY rowid')
  ]
  if (operationId) read.push(db.prepare('SELECT id FROM applied_operations WHERE id=?').bind(operationId))
  const [rev,items,events,sales,drafts,operations]=await db.batch(read)
  return {
    revision:rev.results[0].revision, undo:rev.results[0].kind??null,
    state:{items:items.results,events:events.results.map(r=>JSON.parse(r.payload)),sales:sales.results,drafts:drafts.results,applied:operations?.results.map(o=>o.id)??[]}
  }
}

export async function readUndo(db, revision) {
  const [result]=await db.batch([db.prepare('SELECT inverse FROM bar_undo WHERE id=1 AND revision=?').bind(revision)])
  return result.results[0]?JSON.parse(result.results[0].inverse):null
}

const changed = (before,after,key) => {
  const old=new Map(before.map(r=>[r[key],JSON.stringify(r)]))
  return after.filter(r=>old.get(r[key])!==JSON.stringify(r))
}
const guard='AND (SELECT revision FROM bar_revision WHERE id=1)=?'
const field = name => "json_extract(value,'$."+name+"')"
const tables={
  items:{name:'items',pk:'id',key:'id',cols:['id','name','category','price','ml','ingredient']},
  events:{name:'inventory_events',pk:'id',key:'id',cols:['id','item_id','type','occurred_at','payload'],values:[field('id'),field('item'),field('type'),field('at'),'value']},
  sales:{name:'sales',pk:'date',key:'date',cols:['date','beverage','overall','extra']},
  drafts:{name:'order_drafts',pk:'item_id',key:'item',cols:['item_id','qty'],values:[field('item'),field('qty')]}
}

export async function writeState(db, revision, id, before, next, {replace=false,undo=null}={}) {
  const statements=[]
  const encoder=new TextEncoder()
  function append(query, rows) {
    let chunk=[]
    let size=0
    for (const row of rows) {
      const encoded=JSON.stringify(row)
      const rowSize=encoder.encode(encoded).byteLength+1
      if (size+rowSize>400000 && chunk.length) {
        statements.push(db.prepare(query).bind('['+chunk.join(',')+']',revision))
        chunk=[];size=0
      }
      chunk.push(encoded);size+=rowSize
    }
    if (chunk.length) statements.push(db.prepare(query).bind('['+chunk.join(',')+']',revision))
  }
  // Rows referencing a product are removed before the product itself.
  for (const set of ['events','drafts','sales','items']) {
    const {name,pk,key}=tables[set]
    if (replace) statements.push(db.prepare(`DELETE FROM ${name} WHERE 1 ${guard}`).bind(revision))
    else {
      const kept=new Set(next[set].map(r=>r[key]))
      append(`DELETE FROM ${name} WHERE ${pk} IN (SELECT value FROM json_each(?)) ${guard}`,before[set].filter(r=>!kept.has(r[key])).map(r=>r[key]))
    }
  }
  for (const set of ['items','events','sales','drafts']) {
    const {name,pk,key,cols,values}=tables[set]
    const assignment=cols.filter(c=>c!==pk).map(c=>c+'=excluded.'+c).join(',')
    append(`INSERT INTO ${name} (${cols.join(',')}) SELECT ${(values??cols.map(field)).join(',')}
      FROM json_each(?) WHERE 1 ${guard} ON CONFLICT(${pk}) DO UPDATE SET ${assignment}`,replace?next[set]:changed(before[set],next[set],key))
  }
  statements.push(db.prepare(`DELETE FROM bar_undo WHERE id=1 ${guard}`).bind(revision))
  if (undo) statements.push(db.prepare(`INSERT INTO bar_undo (id,revision,kind,inverse) SELECT 1,revision+1,?,? FROM bar_revision WHERE id=1 ${guard}`).bind(undo.kind,undo.inverse,revision))
  statements.push(db.prepare(`INSERT INTO applied_operations (id,revision) SELECT ?,revision+1 FROM bar_revision WHERE id=1 ${guard}`).bind(id,revision))
  statements.push(db.prepare('UPDATE bar_revision SET revision=revision+1 WHERE id=1 AND revision=?').bind(revision))
  const results=await db.batch(statements)
  return results.at(-1).meta.changes===1
}
