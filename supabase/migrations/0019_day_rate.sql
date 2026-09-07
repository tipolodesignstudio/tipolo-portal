-- 0019: day rate for the proposal's "Hourly Rate" block.
-- Left null it is worked out as the hourly rate x 8; set it to override that.
alter table public.app_settings add column if not exists default_day_rate numeric(10,2);
