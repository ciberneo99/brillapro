// Signed-in flows. Creates a throwaway account and company in the DEV database and removes them afterwards.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
test.skip(!url, "DATABASE_URL is not set");

const uid = randomUUID();
const email = `e2e-${uid}@test.local`;
const password = "E2e-Passw0rd!";
let sql: postgres.Sql;
let tenantId = "";

test.beforeAll(async () => {
  sql = postgres(url!, { max: 1, onnotice: () => {} });
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    values (${uid}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email},
      extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"E2E Owner"}', now(), now(), '', '', '', '')`;
  await sql`insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), ${uid}, ${uid}, 'email', ${sql.json({ sub: uid, email })}, now(), now(), now())`;
  await sql`insert into public.profiles (id, email, full_name) values (${uid}, ${email}, 'E2E Owner') on conflict (id) do nothing`;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    await tx`select public.create_tenant('E2E Cleaning Co', 'en')`;
  });
  tenantId = (await sql`select tenant_id from public.memberships where user_id = ${uid}`)[0].tenant_id;
});

test.afterAll(async () => {
  if (tenantId) await sql`delete from public.tenants where id = ${tenantId}`;
  await sql`delete from auth.users where id = ${uid}`;
  await sql.end();
});

test("owner logs in, sees the dashboard and creates a customer", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("E2E Cleaning Co").first()).toBeVisible();

  await page.goto("/customers/new");
  await page.locator("input[name=first_name]").fill("jane");
  await page.locator("input[name=last_name]").fill("doe");
  await page.locator("input[name=email]").fill("jane.doe@example.com");
  await page.getByRole("button", { name: /save|guardar|create|crear/i }).first().click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}/);
  await expect(page.getByText("Jane Doe").first()).toBeVisible(); // names are auto-capitalized
});

test("owner invites a teammate and gets a one-time link; the platform admin page stays hidden", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/settings/team");
  await page.locator("#invite-email").fill("teammate@example.com");
  await page.locator("#invite-role").selectOption("employee");
  await page.getByRole("button", { name: /create invitation|crear invitación/i }).click();
  const link = page.locator("input[readonly]");
  await expect(link).toHaveValue(/\/invite\/[0-9a-f]{64}$/);

  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404); // signed in, but not a platform admin
});
