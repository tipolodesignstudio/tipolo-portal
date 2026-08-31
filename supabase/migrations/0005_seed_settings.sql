-- 0005_seed_settings.sql
-- Creates the single app_settings row. Tax lines pre-seeded for British Columbia
-- (5% GST + 7% PST). Business fields are left blank for Jim to fill in Settings.

insert into public.app_settings (id, currency, tax_lines, payment_terms, proposal_terms)
values (
  1,
  'CAD',
  '[{"label":"GST","rate":5,"enabled":true},
    {"label":"PST","rate":7,"enabled":true}]'::jsonb,
  'Payment due within 30 days of the invoice date. Please make cheques payable to '
    || 'Tipolo Design Studio or e-transfer to accounts@tipolo.ca.',
  'This proposal is valid for 30 days from the date above. A 50% deposit is required '
    || 'to reserve project time; the balance is invoiced on completion.'
)
on conflict (id) do nothing;
