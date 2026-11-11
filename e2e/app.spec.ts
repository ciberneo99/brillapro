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

test("invoice editor: search a customer, reorder items by drag, save, and the order sticks", async ({ page }) => {
  await sql`insert into public.customers (tenant_id, first_name, last_name, status, email, service_address, city, state, zip_code)
    values (${tenantId}, 'Maria', 'Gonzalez', 'active', 'maria@example.com', '12 Oak St', 'Austin', 'TX', '78701'),
           (${tenantId}, 'Peter', 'Smith', 'active', 'peter@example.com', null, null, null, null)`;
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/invoices/new");
  // Retry: the first keystrokes can land before the page has hydrated.
  await expect(async () => {
    await page.locator("#customer_search").fill("gonz");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByRole("button", { name: /create invoice|crear factura/i }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/);

  // Customer details were filled from the search.
  await expect(page.locator("#customer_name")).toHaveValue("Maria Gonzalez");
  await expect(page.locator("#billing_address")).toHaveValue(/12 Oak St/);

  // Three items, then drag the last one to the top.
  const desc = (n: number) => page.getByLabel(new RegExp(`^(Description|Descripción) ${n}$`));
  await desc(1).fill("Kitchen deep clean");
  await page.getByLabel(/^(Rate|Precio) 1$/).fill("100");
  await page.getByRole("button", { name: /add item|agregar concepto/i }).click();
  await desc(2).fill("Bathrooms");
  await page.getByRole("button", { name: /add item|agregar concepto/i }).click();
  await desc(3).fill("Windows");
  await page.getByLabel(/^(Rate|Precio) 3$/).fill("45");

  const rows = page.locator("section[aria-labelledby=items] li");
  await rows.nth(2).locator("[draggable=true]").dragTo(rows.nth(0));
  await expect(desc(1)).toHaveValue("Windows");

  // Keyboard-friendly alternative: move buttons.
  await rows.nth(1).getByRole("button", { name: /move up|subir/i }).click();
  await expect(desc(1)).toHaveValue("Kitchen deep clean");

  await page.getByRole("button", { name: /save invoice|guardar factura/i }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.reload();
  await expect(desc(1)).toHaveValue("Kitchen deep clean");
  await expect(desc(2)).toHaveValue("Windows");
  await expect(desc(3)).toHaveValue("Bathrooms");
});

test("business profile saves city, state, ZIP and website", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings");
  await expect(async () => {
    await page.locator("#city").fill("Austin");
    await page.locator("#state").fill("TX");
    await page.locator("#zip_code").fill("787451234");
    await page.locator("#website").fill("www.sparkle.example");
    await expect(page.locator("#zip_code")).toHaveValue("78745-1234", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.locator("#website").locator("xpath=ancestor::form").getByRole("button", { name: /save|guardar/i }).click();
  await expect(page.getByText(/saved|guardado/i).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("#city")).toHaveValue("Austin");
  await expect(page.locator("#website")).toHaveValue("https://www.sparkle.example");
});

test("invoice page: Actions menu, add a payment, then edit and delete it in the payment history", async ({ page }) => {
  const [c] = await sql`insert into public.customers (tenant_id, first_name, status) values (${tenantId}, 'Pay', 'active') returning id`;
  const [inv] = await sql`insert into public.invoices (tenant_id, customer_id, due_date, customer_name, created_by) values (${tenantId}, ${c.id}, '2099-12-31', 'Pay Test', ${uid}) returning id`;
  await sql`insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents) values (${tenantId}, ${inv.id}, 'Clean', 1, 10000)`;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    await tx`select public.issue_invoice(${inv.id})`;
  });

  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/invoices/${inv.id}`);

  await expect(async () => {
    await page.getByRole("button", { name: /^(actions|acciones)/i }).click();
    await expect(page.getByRole("menuitem", { name: /download pdf|descargar pdf/i })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  for (const n of [/email again|enviar de nuevo/i, /duplicate|duplicar/i, /print|imprimir/i, /void|anular/i]) await expect(page.getByRole("menuitem", { name: n })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /add payment|agregar pago/i }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("input[name=amount]").fill("40");
  await dlg.getByRole("button", { name: /record payment|registrar pago/i }).click();
  await expect(page).toHaveURL(/saved=1/);
  const history = page.locator("section[aria-labelledby=pay-history]");
  await expect(history).toContainText("$40.00");

  await history.getByRole("button", { name: /edit|editar/i }).click();
  await history.locator("input[name=amount]").fill("55");
  await history.getByRole("button", { name: /^(save|guardar)/i }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(history).toContainText("$55.00");

  page.once("dialog", (d) => d.accept());
  await history.getByRole("button", { name: /remove|quitar/i }).click();
  await expect(page.locator("section[aria-labelledby=pay-history]")).toHaveCount(0);
});

test("customer page: compact layout, My Notes with formatting, history at the bottom", async ({ page }) => {
  const [c] = await sql`insert into public.customers (tenant_id, first_name, last_name, status, email, phone, service_address, city, state, zip_code, property_type, bedrooms, bathrooms, square_footage, cleaning_frequency, rating, notes)
    values (${tenantId}, 'Jami', 'Obrien', 'active', 'jami@example.com', '8326563859', '155 Joshua Dr', 'Georgetown', 'TX', '78633', 'house', 4, 3, 2610, 'biweekly', 5, 'Dog is friendly') returning id`;
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/customers/${c.id}`);
  await expect(page.getByText("jami@example.com")).toBeVisible();
  await expect(page.getByText("Dog is friendly")).toBeVisible();

  const box = page.getByRole("textbox", { name: /add a new note|agrega una nota/i });
  await expect(async () => {
    await box.click();
    await page.keyboard.press("Control+b");
    await page.keyboard.type("Too far away");
    await expect(page.getByRole("button", { name: /save note|guardar nota/i })).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: /save note|guardar nota/i }).click();
  await expect(page.locator("article b", { hasText: "Too far away" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);

  // History is the last block on the page.
  const last = await page.locator("main section, main > div > *").last().getAttribute("aria-labelledby");
  expect(last).toBe("history-title");
});

test("customer form: second phone with a label, referred by, and the new Address & Property layout", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/customers/new");
  await page.locator("input[name=first_name]").fill("rosa");
  await page.locator("input[name=last_name]").fill("diaz");
  await expect(async () => {
    await page.locator("#phone").fill("5125550100");
    await expect(page.locator("#phone")).toHaveValue("512-555-0100",{ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.locator("select[name=phone_label]").selectOption("work");
  await page.getByRole("button", { name: /add another phone|agregar otro/i }).click();
  await page.locator("#secondary_phone").fill("5125550199");
  await page.locator("select[name=secondary_phone_label]").selectOption("spouse");
  await page.locator("input[name=referred_by]").fill("a friend from church");
  await page.locator("#service_address").fill("9 Elm Rd");
  await page.locator("#city").fill("Austin");
  await page.getByRole("button", { name: /save|guardar|create|crear/i }).first().click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}/);
  await expect(page.getByText("Rosa Diaz").first()).toBeVisible();
  await expect(page.getByText("Work", { exact: true })).toBeVisible();
  await expect(page.getByText("Spouse", { exact: true })).toBeVisible();
  await expect(page.getByText("512-555-0199")).toBeVisible();
  await expect(page.getByText("A friend from church")).toBeVisible();
});
