-- 0004_functions.sql
-- RPC helpers callable from the frontend via supabase.rpc(...).

-- ---------------------------------------------------------------------------
-- next_invoice_number()
-- Atomically consumes one number from app_settings and returns it formatted,
-- e.g.  TIP-2026-0007   (year segment only when invoice_year_reset = true).
-- security definer so it is the single writer of invoice_next_seq regardless of
-- the caller's table policies; safe because it takes no user input.
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.app_settings%rowtype;
  seq_to_use int;
  year_txt   text := to_char(now(), 'YYYY');
begin
  -- lock the settings row for the duration of the transaction
  select * into s from public.app_settings where id = 1 for update;
  if not found then
    raise exception 'app_settings row is missing (run 0005_seed_settings.sql)';
  end if;

  seq_to_use := s.invoice_next_seq;
  update public.app_settings
     set invoice_next_seq = seq_to_use + 1
   where id = 1;

  if s.invoice_year_reset then
    return format('%s-%s-%s', s.invoice_prefix, year_txt, lpad(seq_to_use::text, 4, '0'));
  else
    return format('%s-%s', s.invoice_prefix, lpad(seq_to_use::text, 5, '0'));
  end if;
end;
$$;

grant execute on function public.next_invoice_number() to authenticated;
