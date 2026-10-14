/// <reference types="vite/client" />

// Plain-JS modules shared with the previous portal (see vite.config.ts → "@site").
// Typed where they're used, in src/lib/doc.ts.
declare module "@site/*";

// The repo's shared config.js (see vite.config.ts → "@portal-config").
declare module "@portal-config" {
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;
  export const ALLOWED_EMAIL_DOMAIN: string;
  export const GOOGLE_CLIENT_ID: string;
}
