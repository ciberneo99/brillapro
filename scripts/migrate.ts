// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
// Requires DATABASE_URL (Postgres connection, see .env.example). Review before running on production.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const dir = join(process.cwd(), "db", "migrations");
  try {
    await sql`create table if not exists public.schema_migrations (
      name text primary key, applied_at timestamptz not null default now()
    )`;
    const applied = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name as string));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      console.log(`Applying ${file}…`);
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(dir, file), "utf8"));
        await tx`insert into public.schema_migrations (name) values (${file})`;
      });
    }
    console.log("Migrations up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(String(e.message ?? e).replace(/:[^:@/\s]+@/, ":***@"));
  process.exit(1);
});
