export async function readState(db, operationId) {
  const read = [
    db.prepare('SELECT revision FROM bar_revision WHERE id=1'),
    db.prepare('SELECT id,name,category,price,ml,ingredient FROM items ORDER BY rowid'),
    db.prepare('SELECT payload FROM inventory_events ORDER BY rowid'),
    db.prepare('SELECT date,beverage,overall,extra FROM sales ORDER BY date')
  ]
  if (operationId) read.push(db.prepare('SELECT id FROM applied_operations WHERE id=?').bind(operationId))
  const [rev,items,events,sales,operations] = await db.batch(read)
  return {
    revision:rev.results[0].revision,
    state:{items:items.results,events:events.results.map(r=>JSON.parse(r.payload)),sales:sales.results,applied:operations?.results.map(o=>o.id)??[]}
  }
}

const changed = (before,after,field) => {
  const old = new Map(before.map(row=>[row[field],JSON.stringify(row)]))
  return after.filter(row=>old.get(row[field])!==JSON.stringify(row))
}
const guard = 'AND (SELECT revision FROM bar_revision WHERE id=1)=?'
const field = name => "json_extract(value,'$."+name+"')"
export async function writeState(db, revision, id, before, next) {
  const statements=[]
  function append(query, rows) {
    let chunk=[]
    let size=0
    for (const row of rows) {
      const encoded=JSON.stringify(row)
      if (size+encoded.length>48000 && chunk.length) {
        statements.push(db.prepare(query).bind(JSON.stringify(chunk),revision))
        chunk=[];size=0
      }
      chunk.push(row);size+=encoded.length
    }
    if(chunk.length) statements.push(db.prepare(query).bind(JSON.stringify(chunk),revision))
  }
  append(`INSERT INTO items (id,name,category,price,ml,ingredient)
    SELECT ${['id','name','category','price','ml','ingredient'].map(field).join(',')} FROM json_each(?) WHERE 1 ${guard}
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,ml=excluded.ml,ingredient=excluded.ingredient`,changed(before.items,next.items,'id'))
  const kept=new Set(next.events.map(e=>e.id))
  append(`DELETE FROM inventory_events WHERE id IN (SELECT value FROM json_each(?)) ${guard}`,before.events.filter(e=>!kept.has(e.id)).map(e=>e.id))
  append(`INSERT INTO inventory_events (id,item_id,type,occurred_at,payload)
    SELECT ${['id','item','type','at'].map(field).join(',')},value FROM json_each(?) WHERE 1 ${guard}
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,changed(before.events,next.events,'id'))
  append(`INSERT INTO sales (date,beverage,overall,extra)
    SELECT ${['date','beverage','overall','extra'].map(field).join(',')} FROM json_each(?) WHERE 1 ${guard}
    ON CONFLICT(date) DO UPDATE SET beverage=excluded.beverage,overall=excluded.overall,extra=excluded.extra`,changed(before.sales,next.sales,'date'))
  statements.push(db.prepare(`INSERT INTO applied_operations (id,revision) SELECT ?,revision+1 FROM bar_revision WHERE id=1 ${guard}`).bind(id,revision))
  statements.push(db.prepare('UPDATE bar_revision SET revision=revision+1 WHERE id=1 AND revision=?').bind(revision))
  const results=await db.batch(statements)
  return results.at(-1).meta.changes===1
}
