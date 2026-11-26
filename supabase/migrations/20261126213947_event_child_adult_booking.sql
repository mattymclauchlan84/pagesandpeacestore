begin;

alter table app_core.events
  add column booking_rule jsonb,
  add constraint events_child_adult_rule_shape check (
    booking_rule is null or (
      jsonb_typeof(booking_rule) = 'object'
      and booking_rule ? 'child_ticket_id'
      and booking_rule ? 'adult_ticket_id'
      and jsonb_typeof(booking_rule->'child_ticket_id') = 'string'
      and jsonb_typeof(booking_rule->'adult_ticket_id') = 'string'
      and booking_rule->>'child_ticket_id' <> booking_rule->>'adult_ticket_id'
    )
  );

create or replace function app_core.reserve_event_checkout(p_auth_user_id uuid, p_items jsonb)
returns table(order_id uuid, total_pence integer, line_items jsonb)
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_item record;
  v_event_reserved bigint;
  v_ticket_reserved bigint;
  v_checked_event uuid;
  v_locked_events uuid[];
  v_total integer := 0;
  v_order_id uuid;
  v_line_id uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_auth_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    where item->>'ticketTypeId' is null
      or (item->>'quantity')::integer is null
      or (item->>'quantity')::integer not between 1 and 10
  ) then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  update app_core.bookings b set status = 'cancelled', updated_at = now()
  from app_core.order_lines ol join app_core.orders o on o.id = ol.order_id
  where b.order_line_id = ol.id and b.status = 'pending' and o.status = 'pending' and o.reservation_expires_at < now();
  update app_core.orders set status = 'cancelled' where status = 'pending' and reservation_expires_at < now();

  -- Every checkout and admin save serialises on the same event rows.
  select array(select e.id from app_core.events e
    where e.id in (
      select tt.event_id from jsonb_array_elements(p_items) as item
      join app_core.ticket_types tt on tt.id = (item->>'ticketTypeId')::uuid
    )
    order by e.id
    for update of e
  ) into v_locked_events;

  for v_item in
    with requested as (
      select (item->>'ticketTypeId')::uuid as ticket_id, sum((item->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(p_items) as item
      group by 1
    )
    select r.ticket_id, r.quantity, tt.name as ticket_name, tt.capacity as ticket_capacity,
      tt.is_active, tt.price_pence, e.id as event_id, e.title, e.status, e.starts_at,
      e.capacity as event_capacity, e.booking_rule,
      sum(r.quantity) over (partition by e.id) as event_quantity,
      bool_or(r.ticket_id::text = lower(e.booking_rule->>'child_ticket_id')) over (partition by e.id) as has_child,
      bool_or(r.ticket_id::text = lower(e.booking_rule->>'adult_ticket_id')) over (partition by e.id) as has_adult
    from requested r
    left join app_core.ticket_types tt on tt.id = r.ticket_id
    left join app_core.events e on e.id = tt.event_id
    order by e.id, r.ticket_id
  loop
    if v_item.quantity > 10 then raise exception 'INVALID_QUANTITY' using errcode = '22023'; end if;
    if v_item.event_id is null or not (v_item.event_id = any(v_locked_events))
      or v_item.status <> 'published' or v_item.starts_at <= now() or not v_item.is_active then
      raise exception 'TICKET_UNAVAILABLE' using errcode = '22023';
    end if;

    if v_checked_event is distinct from v_item.event_id then
      if v_item.booking_rule is not null and (v_item.has_child is not true or v_item.has_adult is not true) then
        raise exception 'GROUP_TICKETS_REQUIRED' using errcode = '22023';
      end if;

      select coalesce(sum(case when b.status = 'pending' then b.quantity else greatest(0, b.quantity - ol.refunded_quantity) end), 0)
      into v_event_reserved
      from app_core.bookings b join app_core.order_lines ol on ol.id = b.order_line_id
      where b.event_id = v_item.event_id and b.status in ('pending', 'confirmed');

      if v_event_reserved + v_item.event_quantity > v_item.event_capacity then
        raise exception 'NOT_ENOUGH_SEATS' using errcode = '22023';
      end if;
      v_checked_event := v_item.event_id;
    end if;

    if v_item.ticket_capacity is not null then
      select coalesce(sum(case when b.status = 'pending' then b.quantity else greatest(0, b.quantity - ol.refunded_quantity) end), 0)
      into v_ticket_reserved
      from app_core.bookings b join app_core.order_lines ol on ol.id = b.order_line_id
      where b.ticket_type_id = v_item.ticket_id and b.status in ('pending', 'confirmed');

      if v_ticket_reserved + v_item.quantity > v_item.ticket_capacity then
        raise exception 'NOT_ENOUGH_SEATS' using errcode = '22023';
      end if;
    end if;

    v_total := v_total + v_item.price_pence * v_item.quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'event_id', v_item.event_id,
      'ticket_type_id', v_item.ticket_id,
      'item_name', v_item.title || ' — ' || v_item.ticket_name,
      'quantity', v_item.quantity,
      'unit_amount_pence', v_item.price_pence
    ));
  end loop;

  insert into app_core.orders (auth_user_id, status, total_pence, currency, reservation_expires_at)
  values (p_auth_user_id, 'pending', v_total, 'gbp', now() + interval '30 minutes') returning id into v_order_id;

  for v_item in select * from jsonb_to_recordset(v_lines) as x(event_id uuid, ticket_type_id uuid, item_name text, quantity integer, unit_amount_pence integer)
  loop
    insert into app_core.order_lines (order_id, item_type, ticket_type_id, item_name, quantity, unit_amount_pence)
    values (v_order_id, 'event_ticket', v_item.ticket_type_id, v_item.item_name, v_item.quantity, v_item.unit_amount_pence) returning id into v_line_id;

    insert into app_core.bookings (order_line_id, event_id, ticket_type_id, auth_user_id, quantity, status)
    values (v_line_id, v_item.event_id, v_item.ticket_type_id, p_auth_user_id, v_item.quantity, 'pending');
  end loop;

  return query select v_order_id, v_total, v_lines;
end;
$$;

revoke all on function app_core.reserve_event_checkout(uuid, jsonb) from public, anon, authenticated;
grant execute on function app_core.reserve_event_checkout(uuid, jsonb) to service_role;

create or replace function app_core.save_event_ticket_options(
  p_event_id uuid,
  p_event jsonb,
  p_tickets jsonb,
  p_create boolean
) returns void
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_event app_core.events%rowtype;
  v_series_id uuid;
  v_default_ticket app_core.ticket_types%rowtype;
  v_saved_count integer;
  v_booking_rule jsonb;
begin
  select * into v_event from jsonb_populate_record(null::app_core.events, p_event);

  if p_event_id is null or p_create is null or v_event.capacity is null or v_event.capacity < 0
    or (p_create and v_event.capacity < 1)
    or nullif(btrim(v_event.title), '') is null or nullif(btrim(v_event.description), '') is null
    or v_event.starts_at is null or v_event.ends_at <= v_event.starts_at
    or v_event.status is null or v_event.status not in ('draft', 'published', 'cancelled', 'archived') then
    raise exception 'INVALID_EVENT' using errcode = '22023';
  end if;

  if jsonb_typeof(p_tickets) is distinct from 'array' then
    raise exception 'INVALID_TICKETS' using errcode = '22023';
  end if;

  if (p_create and jsonb_array_length(p_tickets) = 0)
    or exists (
      select 1 from jsonb_populate_recordset(null::app_core.ticket_types, p_tickets) t
      where t.id is null or nullif(btrim(t.name), '') is null or t.price_pence is null
        or t.price_pence < 0 or t.capacity < 0 or t.is_active is null
    )
    or exists (
      select 1 from jsonb_populate_recordset(null::app_core.ticket_types, p_tickets) t
      group by t.id having count(*) > 1
    ) then
    raise exception 'INVALID_TICKETS' using errcode = '22023';
  end if;

  if p_create then
    -- A retried create must not fire the series trigger a second time.
    perform pg_advisory_xact_lock(hashtextextended('save-event:' || p_event_id::text, 0));
    if exists (select 1 from app_core.events where id = p_event_id) then return; end if;

    insert into app_core.events (
      id, slug, title, series_name, subtitle, short_description, description,
      starts_at, ends_at, capacity, image_url, status
    ) values (
      p_event_id, v_event.slug, v_event.title, v_event.series_name, v_event.subtitle,
      v_event.short_description, v_event.description, v_event.starts_at, v_event.ends_at,
      v_event.capacity, v_event.image_url, v_event.status
    )
    returning series_id into v_series_id;
  else
    select e.booking_rule into v_booking_rule
    from app_core.events e where e.id = p_event_id for update;
    if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '22023'; end if;

    if v_event.capacity < (
      select coalesce(sum(case when b.status = 'pending' then b.quantity else greatest(0, b.quantity - ol.refunded_quantity) end), 0)
      from app_core.bookings b join app_core.order_lines ol on ol.id = b.order_line_id
      where b.event_id = p_event_id and b.status in ('pending', 'confirmed')
    ) then
      raise exception 'EVENT_CAPACITY_BELOW_RESERVATIONS' using errcode = '22023';
    end if;

    if exists (
      select 1 from jsonb_populate_recordset(null::app_core.ticket_types, p_tickets) t
      join app_core.ticket_types existing on existing.id = t.id and existing.event_id = p_event_id
      where t.capacity is not null and t.capacity is distinct from existing.capacity
      and t.capacity < (
        select coalesce(sum(case when b.status = 'pending' then b.quantity else greatest(0, b.quantity - ol.refunded_quantity) end), 0)
        from app_core.bookings b join app_core.order_lines ol on ol.id = b.order_line_id
        where b.ticket_type_id = t.id and b.status in ('pending', 'confirmed')
      )
    ) then
      raise exception 'TICKET_CAPACITY_BELOW_RESERVATIONS' using errcode = '22023';
    end if;

    update app_core.events set
      title = v_event.title,
      series_name = v_event.series_name,
      subtitle = v_event.subtitle,
      short_description = v_event.short_description,
      description = v_event.description,
      starts_at = v_event.starts_at,
      ends_at = v_event.ends_at,
      capacity = v_event.capacity,
      image_url = v_event.image_url,
      status = v_event.status
    where id = p_event_id;
  end if;

  insert into app_core.ticket_types as existing (id, event_id, name, description, price_pence, capacity, is_active)
  select t.id, p_event_id, t.name, t.description, t.price_pence, t.capacity, t.is_active
  from jsonb_populate_recordset(null::app_core.ticket_types, p_tickets) t
  order by t.id
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    price_pence = excluded.price_pence,
    capacity = excluded.capacity,
    is_active = excluded.is_active
  where existing.event_id = p_event_id;

  get diagnostics v_saved_count = row_count;
  if v_saved_count <> jsonb_array_length(p_tickets) then
    raise exception 'INVALID_TICKETS' using errcode = '22023';
  end if;

  if p_event ? 'booking_rule' then
    v_booking_rule := v_event.booking_rule;
  end if;

  -- Check the final ticket state in the same transaction as the event edit.
  if v_booking_rule is not null and (
    select count(*) from app_core.ticket_types t
    where t.event_id = p_event_id and t.is_active
      and t.id::text in (
        lower(v_booking_rule->>'child_ticket_id'),
        lower(v_booking_rule->>'adult_ticket_id')
      )
  ) <> 2 then
    raise exception 'GROUP_RULE_INVALID' using errcode = '22023';
  end if;

  if p_event ? 'booking_rule' then
    update app_core.events set booking_rule = v_booking_rule where id = p_event_id;
  end if;

  if p_create and v_series_id is not null then
    select t.* into v_default_ticket
    from jsonb_array_elements(p_tickets) with ordinality as option(ticket, position)
    cross join lateral jsonb_populate_record(null::app_core.ticket_types, option.ticket) t
    order by t.is_active desc, option.position
    limit 1;

    update app_core.event_series set
      default_title = v_event.title,
      default_subtitle = v_event.subtitle,
      default_short_description = v_event.short_description,
      default_description = v_event.description,
      default_image_url = v_event.image_url,
      default_capacity = v_event.capacity,
      default_ticket_name = v_default_ticket.name,
      default_ticket_description = v_default_ticket.description,
      default_ticket_price_pence = v_default_ticket.price_pence
    where id = v_series_id and default_title is null;
  end if;
end;
$$;

revoke all on function app_core.save_event_ticket_options(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function app_core.save_event_ticket_options(uuid, jsonb, jsonb, boolean) to service_role;

commit;
