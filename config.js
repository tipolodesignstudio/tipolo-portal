// Local config — fill in from your Supabase project (see config.example.js).
// This file is intentionally NOT git-ignored: the anon/publishable key is safe to
// commit and is required for the deployed site to work. Never add the secret
// (service_role / sb_secret_...) key here.

export const SUPABASE_URL = "https://woixzayvkbbhergpthfr.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_va98-sMw_lbLg8dnN_WE4A_uqCM8NQ5";

export const ALLOWED_EMAIL_DOMAIN = "tipolo.ca";

// hCaptcha site key (public). Leave as-is to disable the captcha widget.
// Get one at hcaptcha.com; the paired SECRET key goes in Supabase
// (Authentication → Attack Protection → Captcha → hCaptcha).
export const HCAPTCHA_SITE_KEY = "YOUR-HCAPTCHA-SITE-KEY";
