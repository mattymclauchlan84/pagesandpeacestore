-- Run with psql on an isolated database with the app_core migrations applied.
\set ON_ERROR_STOP on
begin;

do $$
declare
  test_user uuid := gen_random_uuid();
  group_event uuid := gen_random_uuid();
  ordinary_event uuid := gen_random_uuid();
  child uuid := gen_random_uuid();
  adult uuid := gen_random_uuid();
  other_adult uuid := gen_random_uuid();
  setup jsonb;
  bad_basket jsonb;
  checkout record;
begin
  insert into auth.users (id) values (test_user);
  insert into app_core.events (id, slug, title, description, starts_at, capacity, status)
  values (group_event, 'fixture-group-' || group_event, 'Group event', 'Test', now() + interval '1 day', 3, 'published'),
         (ordinary_event, 'fixture-ordinary-' || ordinary_event, 'Ordinary event', 'Test', now() + interval '1 day', 10, 'published');
  insert into app_core.ticket_types (id, event_id, name, price_pence)
  values (child, group_event, 'Child', 1500), (adult, group_event, 'Adult', 300),
         (other_adult, ordinary_event, 'Adult', 300);

  setup := jsonb_build_object('title', 'Group event', 'description', 'Test', 'starts_at', now() + interval '1 day',
    'capacity', 3, 'status', 'published',
    'booking_rule', jsonb_build_object('child_ticket_id', child, 'adult_ticket_id', adult));
  perform app_core.save_event_ticket_options(group_event, setup, '[]'::jsonb, false);

  for bad_basket in
    select x from (values
      (jsonb_build_array(jsonb_build_object('ticketTypeId', child, 'quantity', 1))),
      (jsonb_build_array(jsonb_build_object('ticketTypeId', adult, 'quantity', 1))),
      (jsonb_build_array(jsonb_build_object('ticketTypeId', child, 'quantity', 1),
                         jsonb_build_object('ticketTypeId', other_adult, 'quantity', 1)))
    ) as baskets(x)
  loop
    begin
      perform app_core.reserve_event_checkout(test_user, bad_basket);
      raise exception 'Unaccompanied group was accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'GROUP_TICKETS_REQUIRED' then raise; end if;
    end;
  end loop;

  if exists (select from app_core.orders where auth_user_id = test_user) then
    raise exception 'Rejected baskets left an order';
  end if;

  select * into strict checkout
  from app_core.reserve_event_checkout(test_user, jsonb_build_array(
    jsonb_build_object('ticketTypeId', child, 'quantity', 2),
    jsonb_build_object('ticketTypeId', adult, 'quantity', 1),
    jsonb_build_object('ticketTypeId', other_adult, 'quantity', 1)
  ));

  if checkout.total_pence <> 3600
    or (select sum(quantity) from app_core.bookings where event_id = group_event) is distinct from 3
    or (select sum(quantity) from app_core.bookings where event_id = ordinary_event) is distinct from 1 then
    raise exception 'Valid group and ordinary tickets did not reserve the expected places and prices';
  end if;
end;
$$;

rollback;
