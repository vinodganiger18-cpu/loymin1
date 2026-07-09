-- =========================================================
-- PERKPAY — RPC FUNCTIONS (run after schema.sql)
-- Needed because PostGIS geography points must be built with
-- ST_MakePoint on the server; supabase-js can't insert them directly.
-- =========================================================

-- Create a shop (admin only — role check happens in Express, this is
-- called with the service_role key which bypasses RLS by design).
create or replace function create_shop(
  in_name text,
  in_address text,
  in_lat double precision,
  in_lng double precision,
  in_category text,
  in_earn_rate integer,
  in_redeem_rate integer,
  in_owner_id uuid,
  in_created_by uuid,
  in_upi_id text
) returns shops
language plpgsql
as $$
declare
  new_shop shops;
begin
  insert into shops (
    name, address, location, category,
    earn_points_per_100, redeem_points_per_rupee,
    owner_id, created_by, upi_id
  ) values (
    in_name, in_address,
    st_setsrid(st_makepoint(in_lng, in_lat), 4326)::geography,
    in_category, in_earn_rate, in_redeem_rate,
    in_owner_id, in_created_by, in_upi_id
  )
  returning * into new_shop;

  return new_shop;
end;
$$;

-- Returns ALL active shops, ordered nearest-to-farthest from the given
-- point. The radius param is accepted for backward compatibility but no
-- longer filters results — customers should see every shop, just sorted
-- by distance, not only ones within a cutoff.
create or replace function nearby_shops(
  in_lat double precision,
  in_lng double precision,
  in_radius_km double precision default 5
) returns table (
  id uuid,
  name varchar,
  address text,
  category varchar,
  earn_points_per_100 integer,
  redeem_points_per_rupee integer,
  rating decimal,
  distance_km double precision
)
language sql
as $$
  select
    s.id, s.name, s.address, s.category,
    s.earn_points_per_100, s.redeem_points_per_rupee, s.rating,
    st_distance(
      s.location,
      st_setsrid(st_makepoint(in_lng, in_lat), 4326)::geography
    ) / 1000.0 as distance_km
  from shops s
  where s.is_active = true
  order by distance_km asc;
$$;
