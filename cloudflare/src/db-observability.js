// Request-local counters only. Never log SQL text, bound parameters, accounts or bodies.
export function observedDatabase(db,stats){
 const record=result=>{stats.queries++;stats.rowsRead+=Number(result?.meta?.rows_read)||0;stats.rowsWritten+=Number(result?.meta?.rows_written)||0;return result};
 const wrap=statement=>({_prepared:statement,bind(...args){return wrap(statement.bind(...args))},async all(){return record(await statement.all())},async run(){return record(await statement.run())},async first(column){const r=record(await statement.all()),row=r.results?.[0]??null;return column&&row?row[column]:row}});
 return {prepare:sql=>wrap(db.prepare(sql)),async batch(statements){const results=await db.batch(statements.map(s=>s._prepared||s));results.forEach(record);return results}};
}
