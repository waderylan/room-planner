import { DatabaseSync } from "node:sqlite";
import type { SharingDatabase, SharingStatement } from "../sharing/database";
import { SHARING_SCHEMA } from "../sharing/database";

type Value = string | number | null;
class Statement implements SharingStatement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly values: Value[];
  constructor(db: DatabaseSync, sql: string, values: Value[] = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: Value[]): Statement {
    return new Statement(this.db, this.sql, values);
  }
  async first<T>(): Promise<T | null> {
    return (
      (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null
    );
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }
  async run(): Promise<{ meta: { changes: number } }> {
    return {
      meta: {
        changes: Number(this.db.prepare(this.sql).run(...this.values).changes),
      },
    };
  }
}

export function openServiceDatabase(
  filename: string,
): SharingDatabase & { close(): void } {
  const connection = new DatabaseSync(filename);
  connection.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  connection.exec(SHARING_SCHEMA);
  return {
    prepare(sql) {
      return new Statement(connection, sql);
    },
    async batch(statements) {
      connection.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) {
          if (!(statement instanceof Statement) || statement.db !== connection)
            throw new Error("Invalid statement.");
          results.push({
            meta: {
              changes: Number(
                connection.prepare(statement.sql).run(...statement.values)
                  .changes,
              ),
            },
          });
        }
        connection.exec("COMMIT");
        return results;
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      connection.close();
    },
  };
}
