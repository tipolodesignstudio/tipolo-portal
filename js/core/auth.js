// Auth wrapper around supabase.auth with friendly error messages.
import { supabase } from "./supabase.js";
import { ALLOWED_EMAIL_DOMAIN } from "../../config.js";

export function emailAllowed(email) {
  return String(email || "").trim().toLowerCase().endsWith("@" + ALLOWED_EMAIL_DOMAIN);
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export function currentUser() {
  return supabase.auth.getUser().then(({ data }) => data.user || null);
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password, captchaToken) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(), password, options: { captchaToken },
  });
  if (error) throw friendly(error, email);
  return data;
}

export async function signUp(email, password, fullName, captchaToken) {
  const clean = email.trim();
  if (!emailAllowed(clean)) {
    throw new Error(`Sign-ups are limited to @${ALLOWED_EMAIL_DOMAIN} email addresses.`);
  }
  const { data, error } = await supabase.auth.signUp({
    email: clean,
    password,
    options: {
      captchaToken,
      data: { full_name: (fullName || "").trim() || undefined },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw friendly(error, clean);
  return data; // data.session is null when email confirmation is required
}

export async function sendReset(email, captchaToken) {
  const clean = email.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(clean, {
    captchaToken,
    redirectTo: window.location.origin + window.location.pathname + "#/reset-password",
  });
  if (error) throw friendly(error, clean);
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw friendly(error);
}

export async function signOut() {
  await supabase.auth.signOut();
}

function friendly(error, email) {
  const msg = (error && error.message) || "Something went wrong.";
  const code = error && (error.code || error.name);

  if (/domain|TIPOLO_DOMAIN_ONLY/i.test(msg) ||
      (email && !emailAllowed(email) && /database error|unexpected/i.test(msg))) {
    return new Error(`Sign-ups are limited to @${ALLOWED_EMAIL_DOMAIN} email addresses.`);
  }
  if (/invalid login credentials/i.test(msg)) {
    return new Error("Email or password is incorrect.");
  }
  if (/email not confirmed/i.test(msg)) {
    return new Error("Please confirm your email first — check your inbox for the link.");
  }
  if (/user already registered/i.test(msg) || code === "user_already_exists") {
    return new Error("An account with that email already exists. Try signing in.");
  }
  if (/rate limit|too many/i.test(msg)) {
    return new Error("Too many attempts. Wait a minute and try again.");
  }
  if (/password should be at least/i.test(msg)) {
    return new Error("Password must be at least 6 characters.");
  }
  if (/captcha/i.test(msg)) {
    return new Error("Captcha check failed — tick the box again and retry.");
  }
  return new Error(msg);
}
