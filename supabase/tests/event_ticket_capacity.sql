-- Run with psql on an isolated database that has the app_core migrations applied.
\set ON_ERROR_STOP on
begin;

do $$
declare
  fixture_user uuid := gen_random_uuid();
  fixture_event uuid := gen_random_uuid();
  standard_ticket uuid := gen_random_uuid();
  premium_ticket uuid := gen_random_uuid();
  checkout record;
begin
  insert into auth.users (id) values (fixture_user);
  insert into app_core.events (id, slug, title, description, starts_at, capacity, status)
  values (fixture_event, 'fixture-' || fixture_event, 'Fixture event', 'Test', now() + interval '1 day', 3, 'published');
  insert into app_core.ticket_types (id, event_id, name, price_pence, capacity)
  values (standard_ticket, fixture_event, 'Standard', 1000, null),
         (premium_ticket, fixture_event, 'Premium', 1500, 2);

  begin
    perform app_core.reserve_event_checkout(fixture_user, jsonb_build_array(
      jsonb_build_object('ticketTypeId', standard_ticket, 'quantity', 2),
      jsonb_build_object('ticketTypeId', premium_ticket, 'quantity', 2)
    ));
    raise exception 'Mixed basket over event capacity was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'NOT_ENOUGH_SEATS' then raise; end if;
  end;

  if exists (select 1 from app_core.orders where auth_user_id = fixture_user)
    or exists (select 1 from app_core.bookings where event_id = fixture_event) then
    raise exception 'Rejected order left a reservation';
  end if;

  select * into strict checkout
  from app_core.reserve_event_checkout(fixture_user, jsonb_build_array(
    jsonb_build_object('ticketTypeId', standard_ticket, 'quantity', 1),
    jsonb_build_object('ticketTypeId', premium_ticket, 'quantity', 2)
  ));

  if checkout.total_pence <> 4000 or jsonb_array_length(checkout.line_items) <> 2 then
    raise exception 'Accepted mixed basket has incorrect prices or line items';
  end if;

  if (select sum(quantity) from app_core.bookings where event_id = fixture_event) is distinct from 3 then
    raise exception 'Accepted mixed basket did not reserve all three seats';
  end if;
end;
$$;

rollback;
