/// <reference types="vite/client" />

// The repo's shared config.js (see vite.config.ts → "@portal-config").
declare module "@portal-config" {
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;
  export const ALLOWED_EMAIL_DOMAIN: string;
  export const GOOGLE_CLIENT_ID: string;
}
