// D1 de mentira sobre node:sqlite (Node 22): os testes rodam o SQL de verdade. Sem @types/node, o módulo entra sem tipo.
interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): { changes: number } };
}
const { DatabaseSync } = (await import(/* @vite-ignore */ `node:${"sqlite"}`)) as { DatabaseSync: new (arquivo: string) => Sqlite };

export function bancoTeste(...sqls: string[]): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const s of sqls) db.exec(s);
  const preparar = (sql: string, p: unknown[] = []) => ({
    bind: (...b: unknown[]) => preparar(sql, b),
    all: async () => ({ results: db.prepare(sql).all(...p) }),
    first: async () => db.prepare(sql).get(...p) ?? null,
    run: async () => ({ meta: { changes: db.prepare(sql).run(...p).changes } }),
  });
  return { prepare: (sql: string) => preparar(sql) } as unknown as D1Database;
}
