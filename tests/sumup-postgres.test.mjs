// Run against a disposable, local PostgreSQL server only:
// npm install --prefix /tmp/pages-peace-pg-test embedded-postgres@17.12.0-beta.19
// NODE_PATH=/tmp/pages-peace-pg-test/node_modules node --test tests/sumup-postgres.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const migrationDirectory = join(import.meta.dirname, "../supabase/migrations");
const saleMigration = "20261127173500_sumup_in_store_event_sales.sql";

function migration(filename) {
  return readFile(join(migrationDirectory, filename), "utf8");
}

function excerpt(sql, first, last) {
  const start = sql.indexOf(first);
  const end = sql.indexOf(last, start);
  assert.ok(start >= 0 && end > start, "Expected baseline migration section");
  return sql.slice(start, end);
}

async function setupBaseline(db) {
  // Auth/legacy schema fixture has no production records. The app_core schema
  // and commerce procedures come from real repository migrations.
  await db.query(`
    create role anon;
    create role authenticated;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text unique,
      email_confirmed_at timestamptz
    );
    create table public.admin_users (auth_user_id uuid, created_at timestamptz);
  `);
  await db.query(await migration("20260908090100_production_app_core_schema.sql"));
  const history = await migration("20260908140000_full_production_history_cutover.sql");
  const identity = await migration("20260909015500_app_core_identity_profile_and_admin_cutover.sql");
  await db.query(excerpt(history, "alter table app_core.customers", "-- Resolve every genuine event line"));
  await db.query(excerpt(identity, "alter table app_core.customers", "update app_core.customers"));
  await db.query(identity.slice(identity.indexOf("create table if not exists app_core.admins")));
  await db.query(await migration("20260909021000_app_core_identity_service_grants.sql"));
  await db.query(await migration("20260915123000_add_event_end_time.sql"));
  const stripe = await migration("202609030001_app_core_multi_event_checkout.sql");
  await db.query(excerpt(stripe, "create or replace function app_core.confirm_event_checkout", "grant select, insert, update on table app_core.events"));
  await db.query(await migration("20261126210541_event_ticket_options.sql"));
  await db.query(await migration("20261126213947_event_child_adult_booking.sql"));
}

async function spareLoopbackPort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("SumUp migration and checkout interoperability on synthetic PostgreSQL data", async (t) => {
  const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve("embedded-postgres")));
  const directory = await mkdtemp(join(tmpdir(), "pages-peace-pg-"));
  const logs = [];
  const pg = new EmbeddedPostgres({
    databaseDir: join(directory, "db"),
    port: await spareLoopbackPort(),
    user: "postgres",
    password: randomUUID(),
    persistent: false,
    autoRehydrateSymlinks: true,
    postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="],
    onLog: (message) => logs.push(String(message)),
    onError: (message) => logs.push(String(message)),
  });
  let started = false;
  const clients = [];
  t.after(async () => {
    try {
      await Promise.allSettled(clients.map((db) => db.end()));
      if (started) await pg.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  try {
    await pg.initialise();
    await pg.start();
    started = true;
  } catch (error) {
    throw new Error(logs.join("\n"), { cause: error });
  }

  async function client(role) {
    const db = pg.getPgClient("postgres", "127.0.0.1");
    await db.connect();
    clients.push(db);
    await db.query("set statement_timeout = '8s'");
    if (role === "service_role" || role === "anon" || role === "authenticated") {
      await db.query(`set role ${role}`);
    }
    return db;
  }

  const owner = await client();
  const oneRow = async (db, sql, values) => (await db.query(sql, values)).rows[0];
  t.diagnostic((await oneRow(owner, "select version()")).version);
  await setupBaseline(owner);
  const service = await client("service_role");
  const other = await client("service_role");
  const anon = await client("anon");
  const authenticated = await client("authenticated");

  async function user(email, verified, customer = false) {
    const { id } = await oneRow(owner, `insert into auth.users (id, email, email_confirmed_at)
      values (gen_random_uuid(), $1, case when $2 then now() end) returning id`, [email, verified]);
    if (customer) {
      await owner.query("insert into app_core.customers (auth_user_id, email, email_verified) values ($1, $2, $3)", [id, email, verified]);
    }
    return id;
  }

  const admin = await user("admin@example.invalid", true, true);
  await owner.query("insert into app_core.admins (auth_user_id) values ($1)", [admin]);
  const known = await user("known@example.invalid", true, true);
  const unverified = await user("claimant@example.invalid", false, true);
  // Even a stale profile claiming its email is verified cannot supersede Auth.
  await owner.query("update app_core.customers set email_verified = true where auth_user_id = $1", [unverified]);
  const stranger = await user("stranger@example.invalid", true, true);
  const { sale_date: saleDate } = await oneRow(owner, "select ((now() at time zone 'Europe/London')::date - 1)::text sale_date");
  const refundAt = new Date(Date.now() - 60_000).toISOString();

  async function event(capacity, options, group = false) {
    const id = randomUUID();
    await owner.query(`
      insert into app_core.events (id, slug, title, description, starts_at, capacity, status)
      values ($1, $1::uuid::text, 'Synthetic event', 'Synthetic QA fixture', now() + interval '14 days', $2, 'published')
    `, [id, capacity]);
    const tickets = [];
    for (const option of options) {
      tickets.push(await oneRow(owner, `
        insert into app_core.ticket_types (event_id, name, price_pence, capacity, is_active)
        values ($1, $2, $3, $4, $5) returning id, price_pence
      `, [id, option.name, option.price, option.capacity ?? null, option.active ?? true]));
    }
    if (group) {
      await owner.query("update app_core.events set booking_rule = $2 where id = $1", [
        id, { child_ticket_id: tickets[0].id, adult_ticket_id: tickets[1].id },
      ]);
    }
    return { id, tickets };
  }

  const standard = { name: "Standard", price: 500 };
  const stripeEvent = await event(2, [standard]);
  const ticketItems = (requested) => requested.map(([ticket, quantity]) => ({ ticketTypeId: ticket.id, quantity }));
  async function reserve(target, requested, db = service) {
    const { order_id: order } = await oneRow(db, "select * from app_core.reserve_event_checkout($1, $2)", [
      known, JSON.stringify(ticketItems(requested)),
    ]);
    assert.ok(order, `Stripe reservation for ${target.id}`);
    return order;
  }

  const preExisting = await reserve(stripeEvent, [[stripeEvent.tickets[0], 1]]);
  await owner.query("update app_core.orders set stripe_checkout_session_id = 'cs_test_before' where id = $1", [preExisting]);
  async function confirmStripe(session, db = service) {
    return oneRow(db, "select * from app_core.confirm_event_checkout($1, $2, $3, $4, '{}'::jsonb)", [
      `evt_${session}`, "checkout.session.completed", session, `pi_${session}`,
    ]);
  }

  await t.test("applies the complete SumUp migration atomically after earlier commerce migrations", async () => {
    const sql = process.env.SUMUP_TEST_MIGRATION
      ? await readFile(process.env.SUMUP_TEST_MIGRATION, "utf8")
      : await migration(saleMigration);
    try {
      await owner.query(sql);
    } catch (error) {
      await owner.query("rollback");
      assert.equal((await oneRow(owner, "select to_regclass('app_core.in_store_sales') as table_name")).table_name, null);
      throw error;
    }
    assert.equal((await oneRow(owner, "select to_regclass('app_core.in_store_sales')::text as table_name")).table_name, "app_core.in_store_sales");
  });
  if (!(await oneRow(owner, "select to_regclass('app_core.in_store_sales') as table_name")).table_name) return;

  async function sale(target, requested, options = {}) {
    const {
      db = service, reference = randomUUID(), email = "guest@example.invalid", name = "Synthetic Guest",
      actor = admin, date = saleDate, total = requested.reduce((sum, [ticket, qty]) => sum + ticket.price_pence * qty, 0),
    } = options;
    return (await oneRow(db, "select app_core.record_in_store_sale($1, $2, $3, $4, $5, $6, $7, $8) as id", [
      target.id, JSON.stringify(ticketItems(requested)), name, email, reference, date, total, actor,
    ])).id;
  }

  async function lines(order) {
    return (await owner.query("select * from app_core.order_lines where order_id = $1 order by unit_amount_pence, id", [order])).rows;
  }

  async function refund(order, requested, options = {}) {
    const { db = service, reference = randomUUID(), date = refundAt, actor = admin, reason = "Synthetic QA refund" } = options;
    return (await oneRow(db, "select app_core.record_in_store_refund($1, $2, $3, $4, $5, $6) as amount", [
      order, JSON.stringify(requested.map(([line, quantity]) => ({ orderLineId: line.id, quantity }))),
      reference, date, actor, reason,
    ])).amount;
  }

  async function claim(authId, db = service) {
    return (await oneRow(db, "select app_core.link_verified_in_store_bookings($1) as count", [authId])).count;
  }

  async function counts(target) {
    return oneRow(owner, `select count(*)::int bookings,
      coalesce(sum(case when b.status = 'pending' then b.quantity
        when b.status = 'confirmed' then b.quantity - l.refunded_quantity else 0 end), 0)::int occupied
      from app_core.bookings b join app_core.order_lines l on l.id = b.order_line_id where b.event_id = $1`, [target.id]);
  }

  await t.test("preserves a Stripe reservation created before migration and its normal webhook confirmation", async () => {
    assert.deepEqual(await confirmStripe("cs_test_before"), { order_id: preExisting, should_send_confirmation: true });
    assert.deepEqual(await confirmStripe("cs_test_before"), { order_id: preExisting, should_send_confirmation: false });
    assert.deepEqual(await counts(stripeEvent), { bookings: 1, occupied: 1 });
    assert.equal((await oneRow(owner, "select status from app_core.bookings where event_id = $1", [stripeEvent.id])).status, "confirmed");
    await assert.rejects(refund(preExisting, [[(await lines(preExisting))[0], 1]]), /SUMUP_ORDER_NOT_FOUND/);
  });

  await t.test("limits all SumUp procedures and tables to trusted server roles and verifies admin IDs", async () => {
    const target = await event(3, [standard]);
    for (const db of [anon, authenticated]) {
      await assert.rejects(sale(target, [[target.tickets[0], 1]], { db }), { code: "42501" });
      await assert.rejects(claim(known, db), { code: "42501" });
      await assert.rejects(refund(randomUUID(), [[{ id: randomUUID() }, 1]], { db }), { code: "42501" });
      await assert.rejects(db.query("select app_core.begin_in_store_confirmation($1)", [randomUUID()]), { code: "42501" });
      await assert.rejects(db.query("select order_id from app_core.in_store_sales"), { code: "42501" });
      await assert.rejects(db.query("select order_id from app_core.in_store_refunds"), { code: "42501" });
    }
    assert.equal((await oneRow(owner, "select has_table_privilege('service_role', 'auth.users', 'SELECT') granted")).granted, false);
    await assert.rejects(sale(target, [[target.tickets[0], 1]], { actor: known }), /ADMIN_REQUIRED/);
    await assert.rejects(refund(randomUUID(), [[{ id: randomUUID() }, 1]], { actor: known }), /ADMIN_REQUIRED/);
  });

  await t.test("matches verified Auth, safely links only matching email, and keeps marketing untouched", async () => {
    const target = await event(10, [standard]);
    const ticket = target.tickets[0];
    const matched = await sale(target, [[ticket, 1]], { email: " KNOWN@example.invalid " });
    const guest = await sale(target, [[ticket, 2]], { email: " CLAIMANT@example.invalid " });
    const orderDetails = (id) => oneRow(owner, `select o.auth_user_id, o.status, o.total_pence,
      o.stripe_payment_intent_id, o.stripe_checkout_session_id, o.customer_email, s.registration_offered,
      s.created_by_auth_user_id, s.sale_date::text, s.confirmation_status,
      (o.paid_at at time zone 'Europe/London')::date = s.sale_date as original_report_date
      from app_core.orders o join app_core.in_store_sales s on s.order_id = o.id where o.id = $1`, [id]);
    assert.deepEqual(await orderDetails(matched), {
      auth_user_id: known, status: "paid", total_pence: 500, stripe_payment_intent_id: null,
      stripe_checkout_session_id: null, customer_email: "known@example.invalid", registration_offered: false,
      created_by_auth_user_id: admin, sale_date: saleDate, confirmation_status: "pending",
      original_report_date: true,
    });
    assert.equal((await orderDetails(guest)).auth_user_id, null);
    assert.equal((await orderDetails(guest)).registration_offered, true);
    assert.equal(await claim(stranger), 0);
    assert.equal(await claim(unverified), 0);
    await owner.query("update auth.users set email_confirmed_at = now() where id = $1", [unverified]);
    const claims = await Promise.all([claim(unverified), claim(unverified, other)]);
    assert.deepEqual(claims.sort(), [0, 1]);
    assert.equal((await orderDetails(guest)).auth_user_id, unverified);
    const booking = await oneRow(owner, `select b.auth_user_id, b.status, b.quantity from app_core.bookings b
      join app_core.order_lines l on l.id = b.order_line_id where l.order_id = $1`, [guest]);
    assert.deepEqual(booking, { auth_user_id: unverified, status: "confirmed", quantity: 2 });
    assert.equal((await oneRow(owner, "select count(*)::int n from auth.users")).n, 4);
    assert.equal((await oneRow(owner, `select count(*)::int n from app_core.customers
      where marketing_consent is not null or marketing_consent_at is not null or beehiiv_subscribed`)).n, 0);
  });

  await t.test("rejects invalid and stale sales without leaving orders, audit records or inventory changes", async () => {
    const target = await event(6, [{ name: "Child", price: 300 }, { name: "Adult", price: 400 }, { ...standard, active: false }], true);
    const [child, adult, inactive] = target.tickets;
    const baseline = await oneRow(owner, "select (select count(*)::int from app_core.orders) orders, (select count(*)::int from app_core.in_store_sales) sales");
    await assert.rejects(sale(target, [[child, 1]]), /GROUP_TICKETS_REQUIRED/);
    await assert.rejects(sale(target, [[child, 1], [adult, 1], [inactive, 1]]), /TICKET_UNAVAILABLE/);
    await assert.rejects(sale(target, [[child, 1], [adult, 1]], { total: 699 }), /PRICE_CHANGED/);
    await assert.rejects(sale(target, [[child, 1], [adult, 1]], { date: "2099-01-01" }), /INVALID_SALE/);
    await assert.rejects(sale(target, [[child, 1], [adult, 1]], { email: null }), /INVALID_SALE/);
    assert.deepEqual(await counts(target), { bookings: 0, occupied: 0 });
    assert.deepEqual(await oneRow(owner, "select (select count(*)::int from app_core.orders) orders, (select count(*)::int from app_core.in_store_sales) sales"), baseline);
  });

  await t.test("enforces both per-ticket caps and shared event capacity across choices", async () => {
    const target = await event(3, [{ ...standard, capacity: 1 }, { name: "Flexible", price: 700 }]);
    const [limited, flexible] = target.tickets;
    await assert.rejects(sale(target, [[limited, 2]]), /NOT_ENOUGH_SEATS/);
    await sale(target, [[limited, 1], [flexible, 1]]);
    await assert.rejects(sale(target, [[limited, 1]]), /NOT_ENOUGH_SEATS/);
    await assert.rejects(sale(target, [[flexible, 2]]), /NOT_ENOUGH_SEATS/);
    await sale(target, [[flexible, 1]]);
    assert.deepEqual(await counts(target), { bookings: 3, occupied: 3 });
  });

  await t.test("serialises last-seat races between SumUp writers and the real Stripe reservation RPC in either lock order", async () => {
    for (const first of ["sumup", "stripe"]) {
      const target = await event(1, [standard]);
      const requested = [[target.tickets[0], 1]];
      await service.query("begin");
      let contender;
      try {
        if (first === "sumup") {
          await sale(target, requested);
          contender = reserve(target, requested, other);
        } else {
          await reserve(target, requested);
          contender = sale(target, requested, { db: other });
        }
        const blocked = assert.rejects(contender, /NOT_ENOUGH_SEATS/);
        await service.query("commit");
        await blocked;
      } catch (error) {
        await service.query("rollback");
        await contender?.catch(() => {});
        throw error;
      }
      assert.deepEqual(await counts(target), { bookings: 1, occupied: 1 });
    }
    const target = await event(1, [standard]);
    const requested = [[target.tickets[0], 1]];
    const results = await Promise.allSettled([sale(target, requested), sale(target, requested, { db: other })]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(results.find((result) => result.status === "rejected").reason.message, /NOT_ENOUGH_SEATS/);
    assert.deepEqual(await counts(target), { bookings: 1, occupied: 1 });
  });

  await t.test("keeps a Stripe reservation eligible for its webhook intact even after its nominal expiry", async () => {
    const target = await event(1, [standard]);
    const requested = [[target.tickets[0], 1]];
    const pending = await reserve(target, requested);
    await owner.query(`update app_core.orders set stripe_checkout_session_id = 'cs_test_late',
      reservation_expires_at = now() - interval '1 minute' where id = $1`, [pending]);
    await assert.rejects(sale(target, requested), /NOT_ENOUGH_SEATS/);
    assert.equal((await confirmStripe("cs_test_late")).should_send_confirmation, true);
    assert.equal((await oneRow(owner, "select status from app_core.bookings where event_id = $1", [target.id])).status, "confirmed");
    assert.deepEqual(await counts(target), { bookings: 1, occupied: 1 });
  });

  await t.test("makes a signed-off sale retry safe across simultaneous requests, edits, and changed references", async () => {
    const target = await event(1, [standard]);
    const requested = [[target.tickets[0], 1]];
    const reference = "QA-SALE-retry";
    const sameReference = " qa-sale-RETRY ";
    const [first, repeated] = await Promise.all([
      sale(target, requested, { reference }), sale(target, requested, { reference: sameReference, db: other }),
    ]);
    assert.equal(first, repeated);
    await owner.query("update app_core.ticket_types set price_pence = 510 where id = $1", [target.tickets[0].id]);
    assert.equal(await sale(target, requested, { reference }), first);
    await assert.rejects(sale(target, requested, { reference, email: "other@example.invalid" }), /DUPLICATE_SUMUP_REFERENCE/);
    await assert.rejects(sale(target, requested, { reference, total: 510 }), /DUPLICATE_SUMUP_REFERENCE/);
    assert.deepEqual(await counts(target), { bookings: 1, occupied: 1 });
  });

  await t.test("audits atomic partial and full grouped refunds, restores capacity and rejects invalid replays", async () => {
    const target = await event(3, [{ name: "Child", price: 300, capacity: 2 }, { name: "Adult", price: 500 }], true);
    const [child, adult] = target.tickets;
    const order = await sale(target, [[child, 2], [adult, 1]]);
    const [childLine, adultLine] = await lines(order);
    await assert.rejects(refund(order, [[adultLine, 1]]), /ADULT_TICKET_REQUIRED/);
    await assert.rejects(refund(order, [[childLine, 1], [{ id: randomUUID() }, 1]]), /LINE_NOT_FOUND/);
    const changedReference = ["INVALID_QUANTITY", "INVALID_REFUND"];
    await assert.rejects(refund(order, [[childLine, 3]]), new RegExp(changedReference.join("|")));
    await assert.rejects(refund(order, [[adultLine, 1], [{ ...adultLine, id: adultLine.id.toUpperCase() }, 1]]), /INVALID_REFUND/);
    assert.equal((await oneRow(owner, "select count(*)::int n from app_core.in_store_refunds where order_id = $1", [order])).n, 0);
    assert.deepEqual(await counts(target), { bookings: 2, occupied: 3 });

    const partial = { reference: "QA-PARTIAL-refundable" };
    assert.equal(await refund(order, [[childLine, 1]], partial), 300);
    assert.equal(await refund(order, [[childLine, 1]], { ...partial, reference: " qa-partial-REFUNDABLE " }), 300);
    await assert.rejects(refund(order, [[childLine, 2]], partial), /DUPLICATE_SUMUP_REFERENCE|DUPLICATE_SUMUP_REFUND_REFERENCE/);
    const state = () => oneRow(owner, `select status, refund_status, refunded_total_pence,
      stripe_payment_intent_id from app_core.orders where id = $1`, [order]);
    assert.deepEqual(await state(), { status: "partially_refunded", refund_status: "partial", refunded_total_pence: 300, stripe_payment_intent_id: null });
    assert.deepEqual(await counts(target), { bookings: 2, occupied: 2 });

    const full = { reference: "QA-FULL-refundable" };
    assert.equal(await refund(order, [[{ ...adultLine, id: adultLine.id.toUpperCase() }, 1], [childLine, 1]], full), 800);
    assert.equal(await refund(order, [[childLine, 1], [adultLine, 1]], full), 800);
    assert.deepEqual(await state(), { status: "refunded", refund_status: "full", refunded_total_pence: 1100, stripe_payment_intent_id: null });
    assert.deepEqual(await counts(target), { bookings: 2, occupied: 0 });
    const audit = (await owner.query(`select quantity, amount_pence, created_by_auth_user_id, jsonb_array_length(items) line_count
      from app_core.in_store_refunds where order_id = $1 order by amount_pence`, [order])).rows;
    assert.deepEqual(audit, [
      { quantity: 1, amount_pence: 300, created_by_auth_user_id: admin, line_count: 1 },
      { quantity: 2, amount_pence: 800, created_by_auth_user_id: admin, line_count: 2 },
    ]);
    await reserve(target, [[child, 2], [adult, 1]]);
    assert.deepEqual(await counts(target), { bookings: 4, occupied: 3 });
  });

  await t.test("keeps active complementary free tickets when paid tickets are refunded", async () => {
    const target = await event(2, [{ name: "Free option", price: 0 }, standard]);
    const [free, paid] = target.tickets;
    const order = await sale(target, [[free, 1], [paid, 1]]);
    const [freeLine, paidLine] = await lines(order);
    assert.equal(await refund(order, [[paidLine, 1]]), 500);
    const status = async () => (await oneRow(owner, "select status from app_core.orders where id = $1", [order])).status;
    assert.equal(await status(), "partially_refunded");
    assert.equal((await counts(target)).occupied, 1);
    assert.equal(await refund(order, [[freeLine, 1]]), 0);
    assert.equal(await status(), "refunded");
    assert.equal((await counts(target)).occupied, 0);
  });

  await t.test("serialises competing refund writers without over-refunding", async () => {
    const target = await event(2, [standard]);
    const order = await sale(target, [[target.tickets[0], 1]]);
    const requested = [[(await lines(order))[0], 1]];
    const attempts = await Promise.allSettled([refund(order, requested), refund(order, requested, { db: other })]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(attempts.find((result) => result.status === "rejected").reason.message, /INVALID_QUANTITY/);
    assert.equal((await counts(target)).occupied, 0);
  });

  await t.test("preserves the companion rule captured at purchase if the event setup changes", async () => {
    const target = await event(2, [{ name: "Child", price: 300 }, { name: "Adult", price: 500 }], true);
    const [child, adult] = target.tickets;
    const order = await sale(target, [[child, 1], [adult, 1]]);
    const [childLine, adultLine] = await lines(order);
    await owner.query("update app_core.events set booking_rule = null where id = $1", [target.id]);
    await assert.rejects(refund(order, [[adultLine, 1]]), /ADULT_TICKET_REQUIRED/);
    assert.equal(await refund(order, [[adultLine, 1], [childLine, 1]]), 800);
  });

  await t.test("keeps email retries within the provider window and reuses the original booking snapshot", async () => {
    const target = await event(4, [standard]);
    const ticket = target.tickets[0];
    const order = await sale(target, [[ticket, 1]]);
    const begin = (id) => oneRow(service, "select * from app_core.begin_in_store_confirmation($1)", [id]);
    const initial = await begin(order);
    assert.equal(initial.confirmation_status, "pending");
    assert.ok(initial.confirmation_started_at);
    assert.deepEqual(initial.confirmation_details.tickets, [{ name: "Standard", quantity: 1 }]);
    await owner.query("update app_core.in_store_sales set confirmation_status = 'failed' where order_id = $1", [order]);
    await owner.query("update app_core.ticket_types set name = 'Changed after purchase' where id = $1", [ticket.id]);
    const retry = await begin(order);
    assert.deepEqual(retry.confirmation_details, initial.confirmation_details);
    assert.deepEqual(retry.confirmation_started_at, initial.confirmation_started_at);
    await owner.query("update app_core.in_store_sales set confirmation_started_at = now() - interval '23 hours' where order_id = $1", [order]);
    assert.equal(await begin(order), undefined);

    const sent = await sale(target, [[ticket, 1]]);
    await owner.query("update app_core.in_store_sales set confirmation_status = 'sent' where order_id = $1", [sent]);
    assert.equal(await begin(sent), undefined);

    const refunded = await sale(target, [[ticket, 2]]);
    await refund(refunded, [[(await lines(refunded))[0], 1]]);
    assert.equal(await begin(refunded), undefined);
  });
});
