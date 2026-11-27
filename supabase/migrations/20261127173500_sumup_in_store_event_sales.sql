-- In-store SumUp event sales. Apply to an isolated test database first.
-- This migration is NOT applied to the live project by a preview deployment.
begin;

alter table app_core.bookings alter column auth_user_id drop not null;

create table app_core.in_store_sales (
  order_id uuid primary key references app_core.orders(id) on delete restrict,
  event_id uuid not null references app_core.events(id) on delete restrict,
  sumup_reference text not null check (length(btrim(sumup_reference)) between 3 and 128),
  sale_date date not null,
  customer_name text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_email text not null check (length(customer_email) between 3 and 254),
  confirmation_status text not null default 'pending'
    check (confirmation_status in ('pending', 'sent', 'failed')),
  confirmation_sent_at timestamptz,
  confirmation_started_at timestamptz,
  confirmation_provider_id text,
  confirmation_details jsonb not null,
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  -- Registration is offered in the booking confirmation only when no verified account exists.
  registration_offered boolean not null default false
);
create unique index in_store_sales_reference_unique on app_core.in_store_sales (lower(btrim(sumup_reference)));
create index in_store_sales_email_idx on app_core.in_store_sales (lower(customer_email));
alter table app_core.in_store_sales enable row level security;
revoke all on app_core.in_store_sales from public, anon, authenticated;
grant select, insert, update on app_core.in_store_sales to service_role;

create table app_core.in_store_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app_core.in_store_sales(order_id) on delete restrict,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  sumup_refund_reference text not null check (length(btrim(sumup_refund_reference)) between 3 and 128),
  refund_date timestamptz not null,
  quantity integer not null check (quantity > 0),
  amount_pence integer not null check (amount_pence >= 0),
  reason text,
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index in_store_refunds_order_idx on app_core.in_store_refunds(order_id);
create unique index in_store_refunds_reference_unique on app_core.in_store_refunds (lower(btrim(sumup_refund_reference)));
alter table app_core.in_store_refunds enable row level security;
revoke all on app_core.in_store_refunds from public, anon, authenticated;
grant select, insert on app_core.in_store_refunds to service_role;

-- A single transaction owns the event lock, all capacity checks, order and tickets.
-- This must serialize with online checkout and event edits.
create or replace function app_core.record_in_store_sale(
  p_event_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_email text,
  p_sumup_reference text,
  p_sale_date date,
  p_expected_total_pence integer,
  p_admin_id uuid
) returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_event app_core.events%rowtype;
  v_item record;
  v_event_reserved bigint;
  v_ticket_reserved bigint;
  v_event_quantity integer;
  v_total bigint := 0;
  v_order_id uuid;
  v_saved app_core.in_store_sales%rowtype;
  v_requested jsonb;
  v_email_tickets jsonb := '[]'::jsonb;
  v_line_id uuid;
  v_user_id uuid;
  v_email text := lower(btrim(p_customer_email));
  v_reference text := btrim(p_sumup_reference);
  v_name text := btrim(p_customer_name);
  -- Existing order/report schemas need a timestamp; use London noon as an
  -- internal placeholder and keep the true date in sale_date.
  v_paid_at timestamptz;
begin
  if not exists (select 1 from app_core.admins where auth_user_id = p_admin_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = '22023';
  end if;
  if p_event_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or v_name is null or length(v_name) not between 1 and 120
    or v_email is null or length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
    or v_reference is null or length(v_reference) not between 3 and 128
    or p_expected_total_pence is null or p_expected_total_pence < 0
    or p_sale_date is null
  then raise exception 'INVALID_SALE' using errcode = '22023'; end if;

  v_paid_at := (p_sale_date::timestamp + interval '12 hours') at time zone 'Europe/London';

  if jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'INVALID_TICKETS' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item
    where coalesce(item->>'ticketTypeId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(item->>'quantity','') !~ '^([1-9]|10)$')
  then raise exception 'INVALID_TICKETS' using errcode='22023'; end if;

  with requested as (
    select (item->>'ticketTypeId')::uuid ticket_id,
      sum((item->>'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) item group by 1
  )
  select coalesce(sum(quantity),0),
    jsonb_agg(jsonb_build_object('ticketTypeId',ticket_id,'quantity',quantity) order by ticket_id)
  into v_event_quantity,v_requested from requested;
  if v_event_quantity not between 1 and 30 then
    raise exception 'INVALID_TICKETS' using errcode='22023';
  end if;

  -- Recover a committed request even if the event, prices or available seats changed.
  perform pg_advisory_xact_lock(hashtextextended('sumup:sale:' || lower(v_reference),0));
  select * into v_saved from app_core.in_store_sales where lower(btrim(sumup_reference))=lower(v_reference);
  if found then
    if v_saved.event_id=p_event_id and v_saved.customer_email=v_email and v_saved.customer_name=v_name
      and v_saved.sale_date=p_sale_date
      and v_saved.confirmation_details->'items'=v_requested
      and (v_saved.confirmation_details->>'totalPence')::integer=p_expected_total_pence
    then return v_saved.order_id; end if;
    raise exception 'DUPLICATE_SUMUP_REFERENCE' using errcode='23505';
  end if;

  if p_sale_date > (now() at time zone 'Europe/London')::date
    or p_sale_date < (now() at time zone 'Europe/London')::date - 365
  then raise exception 'INVALID_SALE_DATE' using errcode='22023'; end if;

  -- Serialize a sale with a verified customer's first claim for the same address.
  perform pg_advisory_xact_lock(hashtextextended('sumup:email:' || v_email,0));
  select * into v_event from app_core.events where id = p_event_id for update;
  if not found or v_event.status <> 'published' or v_event.starts_at <= now() then
    raise exception 'EVENT_UNAVAILABLE' using errcode = '22023';
  end if;
  if p_sale_date > (v_event.starts_at at time zone 'Europe/London')::date then
    raise exception 'INVALID_SALE_DATE' using errcode='22023';
  end if;

  -- Keep pending Stripe seats reserved until existing checkout cleanup. Reclaiming
  -- bookings alone would leave their pending orders payable by the Stripe webhook.
  if v_event.booking_rule is not null and (
    not exists (select 1 from jsonb_array_elements(p_items) item
      where lower(item->>'ticketTypeId')=lower(v_event.booking_rule->>'child_ticket_id'))
    or not exists (select 1 from jsonb_array_elements(p_items) item
      where lower(item->>'ticketTypeId')=lower(v_event.booking_rule->>'adult_ticket_id'))
  ) then raise exception 'GROUP_TICKETS_REQUIRED' using errcode='22023'; end if;

  select coalesce(sum(case when b.status='pending' then b.quantity
    else greatest(0,b.quantity-l.refunded_quantity) end),0)
    into v_event_reserved
    from app_core.bookings b join app_core.order_lines l on l.id=b.order_line_id
    where b.event_id=p_event_id and b.status in ('pending','confirmed');
  if v_event_reserved+v_event_quantity>v_event.capacity then
    raise exception 'NOT_ENOUGH_SEATS' using errcode='22023';
  end if;

  for v_item in
    select t.id,t.name,t.capacity,t.price_pence,
      x.quantity, t.is_active
    from (select (item->>'ticketTypeId')::uuid ticket_id,
      sum((item->>'quantity')::integer)::integer quantity
      from jsonb_array_elements(p_items) item group by 1) x
    left join app_core.ticket_types t on t.id=x.ticket_id
    order by t.id
  loop
    if v_item.id is null or v_item.quantity not between 1 and 10
      or not v_item.is_active
      or not exists (select 1 from app_core.ticket_types where id=v_item.id and event_id=p_event_id)
    then raise exception 'TICKET_UNAVAILABLE' using errcode='22023'; end if;
    if v_item.capacity is not null then
      select coalesce(sum(case when b.status='pending' then b.quantity
        else greatest(0,b.quantity-l.refunded_quantity) end),0)
      into v_ticket_reserved
      from app_core.bookings b join app_core.order_lines l on l.id=b.order_line_id
      where b.ticket_type_id=v_item.id and b.status in ('pending','confirmed');
      if v_ticket_reserved+v_item.quantity>v_item.capacity then
        raise exception 'NOT_ENOUGH_SEATS' using errcode='22023';
      end if;
    end if;
    v_total := v_total+(v_item.price_pence::bigint*v_item.quantity);
  end loop;
  if v_total>2147483647 then raise exception 'INVALID_TOTAL' using errcode='22023'; end if;
  if v_total<>p_expected_total_pence then raise exception 'PRICE_CHANGED' using errcode='22023'; end if;

  -- Associate only an already verified email. Guests remain unlinked until verification.
  select c.auth_user_id into v_user_id
    from app_core.customers c join auth.users u on u.id=c.auth_user_id
    where lower(btrim(c.email))=v_email and lower(btrim(u.email))=v_email and u.email_confirmed_at is not null
      and (select count(*) from auth.users verified
        where lower(btrim(verified.email))=v_email and verified.email_confirmed_at is not null) = 1
    for share of u;

  insert into app_core.orders
    (auth_user_id,status,total_pence,currency,paid_at,customer_name,customer_email)
    values (v_user_id,'paid',v_total::integer,'gbp',v_paid_at,v_name,v_email)
    returning id into v_order_id;

  for v_item in
    select t.id,t.name,t.price_pence,
      x.quantity
    from (select (item->>'ticketTypeId')::uuid ticket_id,
      sum((item->>'quantity')::integer)::integer quantity
      from jsonb_array_elements(p_items) item group by 1) x
    join app_core.ticket_types t on t.id=x.ticket_id
    order by t.id
  loop
    insert into app_core.order_lines
      (order_id,item_type,ticket_type_id,item_name,quantity,unit_amount_pence)
      values (v_order_id,'event_ticket',v_item.id,v_event.title || ' — ' || v_item.name,v_item.quantity,v_item.price_pence)
      returning id into v_line_id;
    insert into app_core.bookings
      (order_line_id,event_id,ticket_type_id,auth_user_id,quantity,status,customer_name,customer_email)
      values (v_line_id,p_event_id,v_item.id,v_user_id,v_item.quantity,'confirmed',v_name,v_email);
    v_email_tickets := v_email_tickets || jsonb_build_array(
      jsonb_build_object('name',v_item.name,'quantity',v_item.quantity));
  end loop;

  insert into app_core.in_store_sales
    (order_id,event_id,sumup_reference,sale_date,customer_name,customer_email,
     registration_offered,created_by_auth_user_id,confirmation_details)
    values (v_order_id,p_event_id,v_reference,p_sale_date,v_name,v_email,v_user_id is null,p_admin_id,
      jsonb_build_object('eventName',v_event.title,'startsAt',v_event.starts_at,'totalPence',v_total,
        'items',v_requested,'tickets',v_email_tickets,'bookingRule',v_event.booking_rule));
  return v_order_id;
end;
$$;

revoke all on function app_core.record_in_store_sale(uuid,jsonb,text,text,text,date,integer,uuid) from public,anon,authenticated;
grant execute on function app_core.record_in_store_sale(uuid,jsonb,text,text,text,date,integer,uuid) to service_role;

-- Guest purchases are linked only after the customer controls and verifies that email.
create or replace function app_core.link_verified_in_store_bookings(p_auth_user_id uuid)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_email text;
  v_count integer;
begin
  select lower(btrim(u.email)) into v_email from auth.users u
    where u.id=p_auth_user_id and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('sumup:email:' || v_email,0));
  -- Lock the Auth row so an email change cannot race with ownership assignment.
  perform 1 from auth.users u where u.id=p_auth_user_id
    and lower(btrim(u.email))=v_email and u.email_confirmed_at is not null for share;
  if not found or (select count(*) from auth.users u
      where lower(btrim(u.email))=v_email and u.email_confirmed_at is not null) <> 1
  then return 0; end if;

  with claimed as (
    update app_core.orders o set auth_user_id=p_auth_user_id
      from app_core.in_store_sales s
      where s.order_id=o.id and o.auth_user_id is null and lower(s.customer_email)=v_email
      returning o.id
  ), linked as (
    update app_core.bookings b set auth_user_id=p_auth_user_id,updated_at=now()
      from app_core.order_lines l join claimed c on c.id=l.order_id
      where b.order_line_id=l.id and b.auth_user_id is null
  ) select count(*) into v_count from claimed;
  return v_count;
end;
$$;
revoke all on function app_core.link_verified_in_store_bookings(uuid) from public,anon,authenticated;
grant execute on function app_core.link_verified_in_store_bookings(uuid) to service_role;

create or replace function app_core.record_in_store_refund(
  p_order_id uuid,
  p_items jsonb,
  p_sumup_refund_reference text,
  p_refund_date timestamptz,
  p_admin_id uuid,
  p_reason text
) returns integer
language plpgsql security invoker set search_path to ''
as $$
declare
  v_sale app_core.in_store_sales%rowtype;
  v_booking_rule jsonb;
  v_item record;
  v_line app_core.order_lines%rowtype;
  v_remaining integer;
  v_amount integer := 0;
  v_quantity integer := 0;
  v_existing app_core.in_store_refunds%rowtype;
  v_requested jsonb;
  v_remaining_total integer;
  v_refunded integer;
  v_child_remaining integer;
  v_adult_remaining integer;
begin
  if not exists (select 1 from app_core.admins where auth_user_id=p_admin_id) then
    raise exception 'ADMIN_REQUIRED' using errcode='22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
    or p_sumup_refund_reference is null or length(btrim(p_sumup_refund_reference)) not between 3 and 128
    or p_refund_date is null
  then raise exception 'INVALID_REFUND' using errcode='22023'; end if;
  if jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'INVALID_REFUND' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item
    where coalesce(item->>'orderLineId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(item->>'quantity','') !~ '^([1-9]|[12][0-9]|30)$')
    or exists (select 1 from jsonb_array_elements(p_items) item
      group by lower(item->>'orderLineId') having count(*)>1)
  then raise exception 'INVALID_REFUND' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('orderLineId',(item->>'orderLineId')::uuid,'quantity',
    (item->>'quantity')::integer) order by (item->>'orderLineId')::uuid)
  into v_requested from jsonb_array_elements(p_items) item;

  perform pg_advisory_xact_lock(hashtextextended('sumup:refund:' || lower(btrim(p_sumup_refund_reference)),0));
  select * into v_existing from app_core.in_store_refunds
    where lower(btrim(sumup_refund_reference))=lower(btrim(p_sumup_refund_reference));
  if found then
    if v_existing.order_id=p_order_id and v_existing.items=v_requested and v_existing.refund_date=p_refund_date
      and v_existing.reason is not distinct from nullif(btrim(p_reason),'')
    then return v_existing.amount_pence; end if;
    raise exception 'DUPLICATE_SUMUP_REFUND_REFERENCE' using errcode='23505';
  end if;
  if p_refund_date > now()+interval '5 minutes' or p_refund_date < now()-interval '365 days' then
    raise exception 'INVALID_REFUND_DATE' using errcode='22023';
  end if;

  select * into v_sale from app_core.in_store_sales where order_id=p_order_id;
  if not found then raise exception 'SUMUP_ORDER_NOT_FOUND' using errcode='22023'; end if;
  if (p_refund_date at time zone 'Europe/London')::date < v_sale.sale_date then
    raise exception 'INVALID_REFUND_DATE' using errcode='22023';
  end if;

  -- Lock event first, then order/lines, matching the sale and checkout lock order.
  perform 1 from app_core.events where id=v_sale.event_id for update;
  v_booking_rule := nullif(v_sale.confirmation_details->'bookingRule','null'::jsonb);
  perform 1 from app_core.orders where id=p_order_id for update;
  perform 1 from app_core.order_lines where order_id=p_order_id order by id for update;

  -- Check all selected quantities, then evaluate the *combined* remaining group.
  for v_item in
    select (item->>'orderLineId')::uuid line_id,
      (item->>'quantity')::integer quantity
    from jsonb_array_elements(v_requested) item
  loop
    select * into v_line from app_core.order_lines
      where id=v_item.line_id and order_id=p_order_id;
    if not found then raise exception 'LINE_NOT_FOUND' using errcode='22023'; end if;
    v_remaining:=v_line.quantity-v_line.refunded_quantity;
    if v_item.quantity>v_remaining then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
    v_quantity:=v_quantity+v_item.quantity;
    v_amount:=v_amount+v_item.quantity*v_line.unit_amount_pence;
  end loop;

  if v_booking_rule is not null then
    with after_refund as (
      select l.ticket_type_id,
        greatest(0,l.quantity-l.refunded_quantity-coalesce(x.qty,0)) remaining
      from app_core.order_lines l
      left join lateral (
        select sum((item->>'quantity')::integer) qty
        from jsonb_array_elements(v_requested) item
        where item->>'orderLineId'=l.id::text
      ) x on true
      where l.order_id=p_order_id
    )
    select
      coalesce(sum(remaining) filter (where ticket_type_id::text=lower(v_booking_rule->>'child_ticket_id')),0),
      coalesce(sum(remaining) filter (where ticket_type_id::text=lower(v_booking_rule->>'adult_ticket_id')),0)
    into v_child_remaining,v_adult_remaining from after_refund;
    if v_child_remaining>0 and v_adult_remaining=0 then
      raise exception 'ADULT_TICKET_REQUIRED' using errcode='22023';
    end if;
  end if;

  insert into app_core.in_store_refunds
    (order_id,items,sumup_refund_reference,refund_date,quantity,amount_pence,reason,created_by_auth_user_id)
    values (p_order_id,v_requested,btrim(p_sumup_refund_reference),p_refund_date,
      v_quantity,v_amount,nullif(btrim(p_reason),''),p_admin_id);

  for v_item in
    select (item->>'orderLineId')::uuid line_id,
      (item->>'quantity')::integer quantity
    from jsonb_array_elements(v_requested) item
  loop
    update app_core.order_lines set
      refunded_quantity=refunded_quantity+v_item.quantity,
      refunded_amount_pence=refunded_amount_pence+v_item.quantity*unit_amount_pence
      where id=v_item.line_id;
    update app_core.bookings b set
      status=case when l.refunded_quantity>=l.quantity then 'refunded' else 'confirmed' end,
      refund_processed_at=case when l.refunded_quantity>=l.quantity then now() else b.refund_processed_at end,
      updated_at=now()
      from app_core.order_lines l
      where b.order_line_id=v_item.line_id and l.id=v_item.line_id;
  end loop;

  select coalesce(sum(quantity-refunded_quantity),0),
    coalesce(sum(refunded_amount_pence),0)
    into v_remaining_total,v_refunded from app_core.order_lines where order_id=p_order_id;
  update app_core.orders set
    refunded_total_pence=v_refunded,
    refund_status=case when v_remaining_total=0 then 'full' else 'partial' end,
    status=case when v_remaining_total=0 then 'refunded' else 'partially_refunded' end
  where id=p_order_id;
  return v_amount;
end;
$$;
revoke all on function app_core.record_in_store_refund(uuid,jsonb,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function app_core.record_in_store_refund(uuid,jsonb,text,timestamptz,uuid,text) to service_role;
-- Record the start before contacting Resend. Allow safe retries inside its
-- idempotency window, preserving the same payload and key for every attempt.
create function app_core.begin_in_store_confirmation(p_order_id uuid)
returns setof app_core.in_store_sales
language sql security invoker set search_path to ''
as $$
  update app_core.in_store_sales s
  set confirmation_started_at=coalesce(confirmation_started_at,clock_timestamp())
  where s.order_id=p_order_id and confirmation_status <> 'sent'
    and not exists (select 1 from app_core.in_store_refunds r where r.order_id=s.order_id)
    and (confirmation_started_at is null or confirmation_started_at > clock_timestamp()-interval '23 hours')
  returning *;
$$;
revoke all on function app_core.begin_in_store_confirmation(uuid) from public,anon,authenticated;
grant execute on function app_core.begin_in_store_confirmation(uuid) to service_role;

commit;
