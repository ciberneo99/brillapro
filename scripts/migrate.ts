// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
// Requires DATABASE_URL (direct Postgres connection). Never run against production without review.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = join(process.cwd(), "db", "migrations");

try {
  await sql`create table if not exists public.schema_migrations (
    name text primary key, applied_at timestamptz not null default now()
  )`;
  const applied = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name as string));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`Applying ${file}…`);
    await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    await sql`insert into public.schema_migrations (name) values (${file})`;
  }
  console.log("Migrations up to date.");
} finally {
  await sql.end();
}
