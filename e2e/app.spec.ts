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

test("Venmo report generator lives under Reports > Bank Reports, with a visible upload area", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: /venmo/i })).toHaveCount(0); // gone from the sidebar
  await page.goto("/venmo");
  await expect(page).toHaveURL(/\/reports\/bank/);
  const zone = page.locator("label[for=venmo-file]");
  await expect(zone).toContainText(/click to choose|haz clic/i);
  await page.locator("#venmo-file").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from("not,a,venmo,file\n") });
  await expect(zone).toContainText("statement.csv");
});

test("quote editor: company first in Prepared for, options and items reorder by drag, save, order sticks", async ({ page }) => {
  await sql`insert into public.customers (tenant_id, first_name, last_name, company_name, status, email, service_address, city, state, zip_code)
    values (${tenantId}, 'Laura', 'Diaz', 'Acme Offices LLC', 'active', 'laura@acme.test', '9 Pine Rd', 'Dallas', 'TX', '75001')`;
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/quotes/new");
  await expect(async () => {
    await page.locator("#customer_search").fill("acme");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByRole("button", { name: /create quote|crear cotización/i }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}/);

  // Company name first (large), then the contact's name.
  const prepared = page.locator("section[aria-labelledby=prepared-for]");
  await expect(prepared.locator("p.text-2xl")).toHaveText("Acme Offices LLC");
  await expect(prepared.locator("p.text-lg")).toHaveText("Laura Diaz");

  // Good / Better / Best are there; price them, then drag Best to the top.
  const optName = (n: number) => page.getByLabel(new RegExp(`^(Name|Nombre) ${n}$`));
  await expect(optName(1)).toHaveValue("Good");
  await page.getByLabel(/^(Price|Precio) 1$/).fill("100");
  await page.getByLabel(/^(Price|Precio) 3$/).fill("300");
  const opts = page.locator("section[aria-labelledby=options] li");
  await opts.nth(2).locator("[draggable=true]").dragTo(opts.nth(0));
  await expect(optName(1)).toHaveValue("Best");

  // An extra item is charged on every option: Best 300 + 25 = 325.00 in its totals card.
  await page.getByRole("button", { name: /add item|agregar concepto/i }).click();
  await page.getByLabel(/^(Description|Descripción) 1$/).fill("Supplies");
  await page.getByLabel(/^(Rate|Precio) 1$/).last().fill("25");
  await expect(page.getByTestId("quote-total-card").first()).toContainText("325.00");

  await page.getByRole("button", { name: /save quote|guardar cotización/i }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.reload();
  await expect(optName(1)).toHaveValue("Best");
  await expect(optName(2)).toHaveValue("Good");
  await expect(page.getByLabel(/^(Description|Descripción) 1$/)).toHaveValue("Supplies");

  // Actions menu has the same entries as the invoice.
  await page.getByRole("button", { name: /^(actions|acciones)/i }).click();
  for (const n of [/save quote|guardar/i, /duplicate|duplicar/i, /print|imprimir/i, /download pdf|descargar pdf/i]) await expect(page.getByRole("menuitem", { name: n })).toBeVisible();
});

test("reports hub: sections, favorites, real reports and CSV", async ({ page }) => {
  const cust = (await sql`insert into public.customers (tenant_id, first_name, last_name, company_name, status, created_by)
    values (${tenantId}, 'Rita', 'Lopez', 'Lopez Dental', 'active', ${uid}) returning id`)[0].id;
  const inv = (await sql`insert into public.invoices (tenant_id, customer_id, customer_name, status, issue_date, due_date, tax_rate, created_by)
    values (${tenantId}, ${cust}, 'Rita Lopez', 'sent', current_date, current_date + 15, 10, ${uid}) returning id`)[0].id;
  await sql`insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents, position) values (${tenantId}, ${inv}, 'Office cleaning', 2, 5000, 0)`;
  await sql`insert into public.payments (tenant_id, invoice_id, amount_cents, paid_on, method) values (${tenantId}, ${inv}, 4000, current_date, 'zelle')`;
  const cat = (await sql`select id from public.expense_categories where tenant_id = ${tenantId} limit 1`)[0].id;
  await sql`insert into public.expenses (tenant_id, category_id, vendor, amount_cents, expense_date, created_by) values (${tenantId}, ${cat}, 'Supply Co', 1500, current_date, ${uid})`;

  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/reports");
  for (const h of [/sales reports/i, /payments reports/i, /accounting reports/i, /banking/i]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  for (const gone of [/balance sheet/i, /general ledger/i, /trial balance/i, /reconciliation/i]) await expect(page.getByText(gone)).toHaveCount(0);
  await expect(page.getByText(/star a report to pin it here/i)).toBeVisible();

  // Star "Revenue by Client": it shows up under Favorites at the top.
  await page.getByRole("button", { name: /add revenue by client to favorites/i }).click();
  await expect(page.locator("section[aria-labelledby=favorites]").getByRole("heading", { name: "Revenue by Client" })).toBeVisible();

  // Invoice details: 2 x 50.00 = 100.00 + 10% tax = 110.00; 40.00 paid; 70.00 balance.
  await page.goto("/reports/invoice_details");
  const row = page.getByRole("row", { name: /rita lopez/i });
  await expect(row).toContainText("$110.00");
  await expect(row).toContainText("$40.00");
  await expect(row).toContainText("$70.00");

  await page.goto("/reports/sales_tax");
  await expect(page.getByRole("row", { name: /rita lopez/i })).toContainText("$10.00");
  // Payments Collected: company header, three figures, grouped history and the report buttons.
  await page.goto("/reports/payments_collected");
  await expect(page.getByText("E2E Cleaning Co").first()).toBeVisible();
  await expect(page.getByText("All Time").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  for (const b of [/export csv/i, /preview pdf/i, /download pdf/i]) await expect(page.getByRole("link", { name: b })).toBeVisible();
  const figs = page.locator("dl");
  await expect(figs).toContainText("Total Payments");
  await expect(figs).toContainText("$40.00"); // collected and average (one payment)
  await expect(page.getByRole("cell", { name: /zelle/i }).first()).toBeVisible();
  await expect(page.getByText(/1 transaction/i).first()).toBeVisible();
  await page.getByRole("combobox", { name: /payment method/i }).selectOption("cash");
  await expect(page).toHaveURL(/method=cash/);
  await expect(page.getByText("No data for this period.")).toBeVisible();
  const pdf = await page.request.get("/reports/payments_collected/pdf");
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const dl = await page.request.get("/reports/payments_collected/pdf?download=1");
  expect(dl.headers()["content-disposition"]).toContain("attachment");

  await page.goto("/reports/profit_loss");
  await expect(page.getByRole("row", { name: /net profit/i })).toContainText("$25.00"); // 40.00 collected - 15.00 expenses
  await page.goto("/reports/accounts_aging");
  await expect(page.getByRole("row", { name: /rita lopez/i })).toContainText("$70.00");
  expect((await page.request.get("/reports/accounts_payable_aging")).status()).toBe(404); // not possible yet

  // CSV download: plain decimals, totals last.
  const res = await page.request.get("/reports/item_sales/csv");
  expect(res.headers()["content-type"]).toContain("text/csv");
  const text = await res.text();
  expect(text).toContain("Office cleaning");
  expect(text).toContain("100.00");
});

test("bank statements: import a PDF, categories and subcategories, filters, edit and delete", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: /sign in|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/reports/bank");
  await expect(page.getByRole("heading", { name: "Transactions (0)" })).toBeVisible();

  // Upload the statement and review what was found before saving.
  await page.locator("#bank-file").setInputFiles("e2e/fixtures/statement.pdf");
  await expect(page.getByText(/4 transactions found/i)).toBeVisible({ timeout: 20000 });
  await expect(page.locator("tbody").getByRole("combobox").first()).toContainText("Zelle payment"); // suggested from its keyword
  // The bank's balances are read from the statement and checked against the transactions.
  await expect(page.getByLabel("Previous balance")).toHaveValue("1000.00");
  await expect(page.getByLabel("Ending balance")).toHaveValue("792.80");
  await expect(page.getByText(/matches the bank/i)).toBeVisible();
  await page.getByRole("button", { name: /import 4 transactions/i }).click();
  await expect(page.getByText(/4 transactions imported/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transactions (4)" })).toBeVisible();

  // The report starts from the bank's previous balance and agrees with its ending balance.
  await expect(page.getByText("$1,000.00").first()).toBeVisible();
  await expect(page.getByText("Matches the bank statement.")).toBeVisible();

  const zelle = page.getByRole("row", { name: /zelle payment from rita lopez/i });
  await expect(zelle).toContainText("$150.00");
  await expect(zelle).toContainText("Zelle payment"); // category chip
  await expect(page.getByRole("row", { name: /shell oil/i })).toContainText("$45.20");

  // Everything fits in the table without scrolling sideways, and the list prints as a PDF.
  const fits = await page.locator("table").last().evaluate((t) => { const w = t.parentElement!; return w.scrollWidth <= w.clientWidth + 1; });
  expect(fits).toBe(true);
  await expect(page.getByRole("link", { name: /preview pdf/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
  const pdf = await page.request.get("/reports/bank/pdf?type=in");
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect((await page.request.get("/reports/bank/pdf?download=1")).headers()["content-disposition"]).toContain("attachment");

  // Importing the same statement again adds nothing.
  await page.locator("#bank-file").setInputFiles("e2e/fixtures/statement.pdf");
  await expect(page.getByText(/already imported/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: /cancel/i }).first().click();

  // Filters.
  await page.getByRole("combobox", { name: "Type" }).selectOption("in");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transactions (1)" })).toBeVisible();
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/reports\/bank$/);
  await page.getByPlaceholder("Search description…").fill("shell");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transactions (1)" })).toBeVisible();
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/reports\/bank$/);

  // Category filter with search: type to find a category, then filter by it.
  await page.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByPlaceholder("Search categories…").fill("gas/f");
  await page.locator("ul[role=listbox]").getByRole("option", { name: "Gas/Fuel" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transactions (1)" })).toBeVisible();
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/reports\/bank$/);

  // Own category with a subcategory, then use it on a transaction.
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByPlaceholder("Name").first().fill("Equipment");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByPlaceholder("Name").first().fill("Vacuums");
  await page.getByRole("combobox", { name: "Belongs to" }).selectOption({ label: "Subcategory of Equipment" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("input[value=Vacuums]")).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  const shell = page.getByRole("row", { name: /shell oil/i });
  await shell.getByRole("button", { name: "Edit" }).click();
  const win = page.getByRole("dialog", { name: "Edit Transaction" });
  await expect(win).toBeVisible();
  await expect(win.getByLabel("Description")).toHaveValue("SHELL OIL 57444");
  await win.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByPlaceholder("Search categories…").fill("vacu");
  await expect(page.locator("ul[role=listbox] li[role=option]")).toHaveCount(1);
  await page.locator("ul[role=listbox]").getByRole("option", { name: "Vacuums" }).click();
  await win.getByRole("button", { name: "Save" }).click();
  await expect(win).toBeHidden();
  await expect(page.getByRole("row", { name: /shell oil/i })).toContainText("Vacuums");

  // Changing the type to Income moves the amount from Withdrawals to Deposits/Credits.
  const fee = page.getByRole("row", { name: /monthly service fee/i });
  await expect(fee.getByRole("cell").nth(5)).toContainText("$12.00"); // withdrawals column
  await fee.getByRole("button", { name: "Edit" }).click();
  await win.getByLabel("Type").selectOption("in");
  await win.getByLabel("Amount").fill("15.50");
  await win.getByLabel("Notes").fill("Refund from the bank");
  await win.getByRole("button", { name: "Save" }).click();
  await expect(win).toBeHidden();
  const moved = page.getByRole("row", { name: /monthly service fee/i });
  await expect(moved.getByRole("cell").nth(4)).toContainText("$15.50"); // deposits column
  await expect(moved.getByRole("cell").nth(5)).not.toContainText("$");

  // Cancel leaves everything as it was.
  await moved.getByRole("button", { name: "Edit" }).click();
  await win.getByLabel("Description").fill("Should not be saved");
  await win.getByRole("button", { name: "Cancel" }).click();
  await expect(win).toBeHidden();
  await expect(page.getByText("Should not be saved")).toHaveCount(0);

  // Delete one (with confirmation).
  page.once("dialog", (d) => d.accept());
  await page.getByRole("row", { name: /monthly service fee/i }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Transactions (3)" })).toBeVisible();
});
