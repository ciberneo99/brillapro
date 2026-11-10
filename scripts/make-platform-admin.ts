// Gives an existing account Super Admin access. Usage: npm run admin:grant -- someone@example.com
// Run it yourself against the database you intend; there is deliberately no way to do this from the app.
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run admin:grant -- email@example.com");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const rows = await sql`select id from auth.users where lower(email) = ${email}`;
  if (rows.length === 0) throw new Error("No account with that email. Sign up first.");
  await sql`insert into public.platform_admins (user_id) values (${rows[0].id}) on conflict do nothing`;
  console.log(`${email} is now a platform admin.`);
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
