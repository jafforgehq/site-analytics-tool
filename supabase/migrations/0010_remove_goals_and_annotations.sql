-- 0010_remove_goals_and_annotations.sql
-- Removes the goals and chart-annotations features introduced in
-- 0009_v2_features.sql. Both are gone from the app - no UI, no API, no Edge
-- Function actions reference them anymore.
--
-- DROP TABLE ... CASCADE removes each table's own RLS policies, indexes, and
-- triggers along with it - nothing else in the schema references either
-- table, so there is nothing else to clean up.
--
-- 0009 is left as originally written (never rewrite an already-applied
-- migration); this migration is what actually removes the tables on a
-- database where 0009 already ran. On a fresh install, 0009 creates them and
-- this one immediately drops them again - safe, just a couple of no-op
-- statements.

drop table if exists public.site_goals cascade;
drop table if exists public.annotations cascade;
