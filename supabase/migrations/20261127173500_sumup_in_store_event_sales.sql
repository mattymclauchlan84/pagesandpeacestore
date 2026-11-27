-- In-store SumUp event sales. Apply to an isolated test database first.
-- This migration is NOT applied to the live project by a preview deployment.
begin;

alter table app_core.bookings drop constraint bookings_auth_user_id_fkey;
alter table app_core.bookings alter column auth_user_id drop not null;
alter table app_core.bookings add constraint bookings_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete restrict;

create table app_core.in_store_sales (
  order_id uuid primary key references app_core.orders(id) on delete restrict,
  event_id uuid not null references app_core.events(id) on delete restrict,
  sumup_reference text not null check (length(btrim(sumup_reference)) between 3 and 128),
  paid_at timestamptz not null,
  customer_name text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_email text not null check (length(customer_email) between 3 and 254),
  account_invitation_requested boolean not null default false,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  marketing_consent_text text,
  created_by_auth_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  invitation_sent_at timestamptz,
  invitation_error text,
  marketing_subscription_status text not null default 'not_requested'
    check (marketing_subscription_status in ('not_requested','pending','subscribed','failed','not_configured')),
  marketing_subscribed_at timestamptz,
  constraint store_marketing_evidence check (
    marketing_consent = false or (marketing_consent_at is not null and marketing_consent_text is not null)
  )
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
  created_by_auth_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
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
  p_paid_at timestamptz,
  p_admin_id uuid,
  p_send_invitation boolean,
  p_marketing_consent boolean,
  p_marketing_text text
) returns uuid
language plpgsql security invoker set search_path to ''
as $$
declare
  v_event app_core.events%rowtype;
  v_item record;
  v_event_reserved bigint;
  v_ticket_reserved bigint;
  v_event_quantity integer;
  v_total bigint := 0;
  v_order_id uuid;
  v_line_id uuid;
  v_user_id uuid;
  v_email text := lower(btrim(p_customer_email));
  v_reference text := btrim(p_sumup_reference);
  v_name text := btrim(p_customer_name);
  v_requested jsonb;
begin
  if not exists (select 1 from app_core.admins where auth_user_id = p_admin_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = '22023';
  end if;
  if p_event_id is null or p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 20
    or length(v_name) not between 1 and 120
    or length(v_email) not between 3 and 254 or v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$'
    or length(v_reference) not between 3 and 128
    or p_paid_at is null or p_paid_at > now() + interval '5 minutes'
    or p_paid_at < now() - interval '365 days'
    or (p_marketing_consent and nullif(btrim(p_marketing_text), '') is null)
  then raise exception 'INVALID_SALE' using errcode = '22023'; end if;

  if exists (select 1 from app_core.in_store_sales where lower(btrim(sumup_reference)) = lower(v_reference)) then
    raise exception 'DUPLICATE_SUMUP_REFERENCE' using errcode = '23505';
  end if;

  select * into v_event from app_core.events where id = p_event_id for update;
  if not found or v_event.status <> 'published' or v_event.starts_at <= now() then
    raise exception 'EVENT_UNAVAILABLE' using errcode = '22023';
  end if;

  -- Match the same expiry semantics as the online reservation RPC.
  update app_core.bookings b set status='cancelled', updated_at=now()
    from app_core.order_lines l join app_core.orders o on o.id = l.order_id
    where b.order_line_id=l.id and b.event_id=p_event_id
      and b.status='pending' and o.status='pending' and o.reservation_expires_at < now();

  with requested as (
    select (item->>'ticketTypeId')::uuid ticket_id,
      sum((item->>'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) item
    group by 1
  ) select coalesce(sum(quantity),0) into v_event_quantity from requested;

  if exists (select 1 from jsonb_array_elements(p_items) item
    where (item->>'ticketTypeId') is null
      or (item->>'quantity') !~ '^[0-9]+$'
      or (item->>'quantity')::integer not between 1 and 10)
    or v_event_quantity not between 1 and 30
  then raise exception 'INVALID_TICKETS' using errcode='22023'; end if;

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

  -- Associate only an already verified email. Guests remain unlinked until verification.
  select c.auth_user_id into v_user_id from app_core.customers c
    where lower(c.email)=v_email and c.email_verified=true limit 1;

  insert into app_core.orders
    (auth_user_id,status,total_pence,currency,paid_at,customer_name,customer_email)
    values (v_user_id,'paid',v_total::integer,'gbp',p_paid_at,v_name,v_email)
    returning id into v_order_id;

  insert into app_core.in_store_sales
    (order_id,event_id,sumup_reference,paid_at,customer_name,customer_email,
     account_invitation_requested,marketing_consent,marketing_consent_at,marketing_consent_text,created_by_auth_user_id)
    values (v_order_id,p_event_id,v_reference,p_paid_at,v_name,v_email,
      coalesce(p_send_invitation,false),coalesce(p_marketing_consent,false),
      case when p_marketing_consent then now() else null end,
      case when p_marketing_consent then p_marketing_text else null end,p_admin_id);

  for v_item in
    select t.id,t.name,t.price_pence,
      x.quantity
    from (select (item->>'ticketTypeId')::uuid ticket_id,
      sum((item->>'quantity')::integer)::integer quantity
      from jsonb_array_elements(p_items) item group by 1) x
    join app_core.ticket_types t on t.id=x.ticket_id
  loop
    insert into app_core.order_lines
      (order_id,item_type,ticket_type_id,item_name,quantity,unit_amount_pence)
      values (v_order_id,'event_ticket',v_item.id,v_event.title || ' — ' || v_item.name,v_item.quantity,v_item.price_pence)
      returning id into v_line_id;
    insert into app_core.bookings
      (order_line_id,event_id,ticket_type_id,auth_user_id,quantity,status,customer_name,customer_email)
      values (v_line_id,p_event_id,v_item.id,v_user_id,v_item.quantity,'confirmed',v_name,v_email);
  end loop;
  return v_order_id;
end;
$$;

revoke all on function app_core.record_in_store_sale(uuid,jsonb,text,text,text,timestamptz,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function app_core.record_in_store_sale(uuid,jsonb,text,text,text,timestamptz,uuid,boolean,boolean,text) to service_role;

-- Guest purchases are linked only after the customer controls and verifies that email.
create or replace function app_core.link_verified_in_store_bookings(p_auth_user_id uuid)
returns integer
language plpgsql security invoker set search_path to ''
as $
declare
  v_email text;
  v_count integer;
begin
  select lower(btrim(u.email)) into v_email from auth.users u
    where u.id=p_auth_user_id and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  update app_core.orders o set auth_user_id=p_auth_user_id
    from app_core.in_store_sales s
    where s.order_id=o.id and o.auth_user_id is null and lower(s.customer_email)=v_email;
  get diagnostics v_count=row_count;
  update app_core.bookings b set auth_user_id=p_auth_user_id,updated_at=now()
    from app_core.order_lines l join app_core.in_store_sales s on s.order_id=l.order_id
    where b.order_line_id=l.id and b.auth_user_id is null and lower(s.customer_email)=v_email;
  return v_count;
end;
$;
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
  v_event app_core.events%rowtype;
  v_item record;
  v_line app_core.order_lines%rowtype;
  v_remaining integer;
  v_amount integer := 0;
  v_quantity integer := 0;
  v_gross integer;
  v_refunded integer;
  v_child_remaining integer;
  v_adult_remaining integer;
begin
  if not exists (select 1 from app_core.admins where auth_user_id=p_admin_id) then
    raise exception 'ADMIN_REQUIRED' using errcode='22023';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 20
    or length(btrim(p_sumup_refund_reference)) not between 3 and 128
    or p_refund_date is null or p_refund_date > now()+interval '5 minutes'
    or p_refund_date < now()-interval '365 days'
  then raise exception 'INVALID_REFUND' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item
    where (item->>'orderLineId') is null
      or (item->>'quantity') !~ '^[0-9]+$'
      or (item->>'quantity')::integer not between 1 and 30
  ) or exists (select 1 from jsonb_array_elements(p_items) item
    group by item->>'orderLineId' having count(*)>1)
  then raise exception 'INVALID_REFUND' using errcode='22023'; end if;

  select * into v_sale from app_core.in_store_sales where order_id=p_order_id;
  if not found then raise exception 'SUMUP_ORDER_NOT_FOUND' using errcode='22023'; end if;
  if p_refund_date < v_sale.paid_at then
    raise exception 'INVALID_REFUND_DATE' using errcode='22023';
  end if;

  -- Lock event first, then order/lines, matching the sale and checkout lock order.
  select * into v_event from app_core.events where id=v_sale.event_id for update;
  perform 1 from app_core.orders where id=p_order_id for update;
  perform 1 from app_core.order_lines where order_id=p_order_id order by id for update;

  -- Check all selected quantities, then evaluate the *combined* remaining group.
  for v_item in
    select (item->>'orderLineId')::uuid line_id,
      (item->>'quantity')::integer quantity
    from jsonb_array_elements(p_items) item
  loop
    select * into v_line from app_core.order_lines
      where id=v_item.line_id and order_id=p_order_id;
    if not found then raise exception 'LINE_NOT_FOUND' using errcode='22023'; end if;
    v_remaining:=v_line.quantity-v_line.refunded_quantity;
    if v_item.quantity>v_remaining then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
    v_quantity:=v_quantity+v_item.quantity;
    v_amount:=v_amount+v_item.quantity*v_line.unit_amount_pence;
  end loop;

  if v_event.booking_rule is not null then
    with after_refund as (
      select l.ticket_type_id,
        greatest(0,l.quantity-l.refunded_quantity-coalesce(x.qty,0)) remaining
      from app_core.order_lines l
      left join lateral (
        select sum((item->>'quantity')::integer) qty
        from jsonb_array_elements(p_items) item
        where item->>'orderLineId'=l.id::text
      ) x on true
      where l.order_id=p_order_id
    )
    select
      coalesce(sum(remaining) filter (where ticket_type_id::text=lower(v_event.booking_rule->>'child_ticket_id')),0),
      coalesce(sum(remaining) filter (where ticket_type_id::text=lower(v_event.booking_rule->>'adult_ticket_id')),0)
    into v_child_remaining,v_adult_remaining from after_refund;
    if v_child_remaining>0 and v_adult_remaining=0 then
      raise exception 'ADULT_TICKET_REQUIRED' using errcode='22023';
    end if;
  end if;

  insert into app_core.in_store_refunds
    (order_id,items,sumup_refund_reference,refund_date,quantity,amount_pence,reason,created_by_auth_user_id)
    values (p_order_id,p_items,btrim(p_sumup_refund_reference),p_refund_date,
      v_quantity,v_amount,nullif(btrim(p_reason),''),p_admin_id);

  for v_item in
    select (item->>'orderLineId')::uuid line_id,
      (item->>'quantity')::integer quantity
    from jsonb_array_elements(p_items) item
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

  select coalesce(sum(quantity*unit_amount_pence),0),
    coalesce(sum(refunded_amount_pence),0)
    into v_gross,v_refunded from app_core.order_lines where order_id=p_order_id;
  update app_core.orders set
    refunded_total_pence=v_refunded,
    refund_status=case when v_refunded=0 then 'none' when v_refunded>=v_gross then 'full' else 'partial' end,
    status=case when v_refunded>=v_gross then 'refunded' else 'partially_refunded' end
  where id=p_order_id;
  return v_amount;
end;
$$;
revoke all on function app_core.record_in_store_refund(uuid,jsonb,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function app_core.record_in_store_refund(uuid,jsonb,text,timestamptz,uuid,text) to service_role;
commit;
