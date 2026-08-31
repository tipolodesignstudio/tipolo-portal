// Auth screen: sign in / sign up / forgot password / set new password.
// Rendered into #app directly (outside the shell) by app.js.
import { escapeHtml } from "../core/format.js";
import { ALLOWED_EMAIL_DOMAIN } from "../../config.js";
import { signIn, signUp, sendReset, updatePassword, emailAllowed } from "../core/auth.js";
import { captchaEnabled, mountCaptcha } from "../core/captcha.js";

let mode = "signin"; // signin | signup | forgot | sent | reset
let notice = "";
let captcha = null;   // active hCaptcha handle

export function setMode(m) { mode = m; }

export function render(root, ctx = {}) {
  if (ctx.mode) mode = ctx.mode;
  root.removeAttribute("aria-busy");
  if (captcha) { captcha.remove(); captcha = null; }
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="brand">Tipolo<span> Portal</span></div>
        ${body()}
      </div>
    </div>`;
  wire(root);
}

function body() {
  if (mode === "reset") return resetBody();
  if (mode === "sent") return sentBody();
  if (mode === "forgot") return forgotBody();
  if (mode === "signup") return signupBody();
  return signinBody();
}

const errSlot = `<div class="alert error" data-err style="display:none;margin-bottom:14px"></div>`;
const captchaSlot = () =>
  captchaEnabled ? `<div data-captcha style="margin:12px 0;min-height:78px"></div>` : "";
const noticeSlot = () =>
  notice ? `<div class="alert success" style="margin-bottom:14px">${escapeHtml(notice)}</div>` : "";

function signinBody() {
  return `
    <h1>Sign in</h1>
    <p class="sub">Team access for Tipolo Design Studio.</p>
    ${noticeSlot()}${errSlot}
    <form data-form="signin">
      <div class="field">
        <label class="lbl" for="e">Email</label>
        <input id="e" name="email" type="email" autocomplete="email" required />
      </div>
      <div class="field">
        <label class="lbl" for="p">Password</label>
        <input id="p" name="password" type="password" autocomplete="current-password" required />
      </div>
      ${captchaSlot()}
      <button class="btn block" type="submit">Sign in</button>
      <div class="row-between">
        <button type="button" class="btn link" data-go="forgot">Forgot password?</button>
      </div>
    </form>
    <div class="auth-switch">
      New here? <button class="btn link" data-go="signup">Create an account</button>
    </div>`;
}

function signupBody() {
  return `
    <h1>Create your account</h1>
    <p class="sub">Only <strong>@${escapeHtml(ALLOWED_EMAIL_DOMAIN)}</strong> email addresses can register.</p>
    ${errSlot}
    <form data-form="signup">
      <div class="field">
        <label class="lbl" for="n">Full name</label>
        <input id="n" name="fullName" type="text" autocomplete="name" required />
      </div>
      <div class="field">
        <label class="lbl" for="e">Email</label>
        <input id="e" name="email" type="email" autocomplete="email"
               placeholder="you@${escapeHtml(ALLOWED_EMAIL_DOMAIN)}" required />
      </div>
      <div class="field">
        <label class="lbl" for="p">Password</label>
        <input id="p" name="password" type="password" autocomplete="new-password"
               minlength="8" required />
        <div class="hint">At least 8 characters.</div>
      </div>
      ${captchaSlot()}
      <button class="btn block" type="submit">Create account</button>
    </form>
    <div class="auth-switch">
      Already have an account? <button class="btn link" data-go="signin">Sign in</button>
    </div>`;
}

function forgotBody() {
  return `
    <h1>Reset password</h1>
    <p class="sub">We'll email you a link to set a new password.</p>
    ${errSlot}
    <form data-form="forgot">
      <div class="field">
        <label class="lbl" for="e">Email</label>
        <input id="e" name="email" type="email" autocomplete="email" required />
      </div>
      ${captchaSlot()}
      <button class="btn block" type="submit">Send reset link</button>
    </form>
    <div class="auth-switch">
      <button class="btn link" data-go="signin">Back to sign in</button>
    </div>`;
}

function sentBody() {
  return `
    <h1>Check your email</h1>
    <p class="sub">${escapeHtml(notice || "We've sent you a link. Follow it to continue.")}</p>
    <button class="btn block ghost" data-go="signin">Back to sign in</button>`;
}

function resetBody() {
  return `
    <h1>Set a new password</h1>
    <p class="sub">Choose a new password for your account.</p>
    ${errSlot}
    <form data-form="reset">
      <div class="field">
        <label class="lbl" for="p">New password</label>
        <input id="p" name="password" type="password" autocomplete="new-password"
               minlength="8" required />
      </div>
      <button class="btn block" type="submit">Update password</button>
    </form>`;
}

function wire(root) {
  root.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => { notice = ""; mode = b.dataset.go; render(root); }));

  const form = root.querySelector("form[data-form]");
  if (!form) return;
  const errBox = root.querySelector("[data-err]");
  const showErr = (m) => { if (errBox) { errBox.textContent = m; errBox.style.display = "block"; } };

  const capBox = root.querySelector("[data-captcha]");
  if (capBox) {
    mountCaptcha(capBox).then((h) => { captcha = h; })
      .catch((err) => showErr(err.message));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errBox) errBox.style.display = "none";
    const btn = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form));
    const kind = form.dataset.form;

    const needsCaptcha = captchaEnabled && ["signin", "signup", "forgot"].includes(kind);
    const token = needsCaptcha ? captcha?.token() : undefined;
    if (needsCaptcha && !token) { showErr("Complete the captcha to continue."); return; }

    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      if (kind === "signin") {
        await signIn(data.email, data.password, token);
      } else if (kind === "signup") {
        if (!emailAllowed(data.email)) throw new Error(
          `Sign-ups are limited to @${ALLOWED_EMAIL_DOMAIN} email addresses.`);
        const res = await signUp(data.email, data.password, data.fullName, token);
        if (res.session) return; // auto-confirmed: app.js takes over
        notice = `We've sent a confirmation link to ${data.email}. Click it, then sign in.`;
        mode = "sent"; render(root); return;
      } else if (kind === "forgot") {
        await sendReset(data.email, token);
        notice = `If an account exists for ${data.email}, a reset link is on its way.`;
        mode = "sent"; render(root); return;
      } else if (kind === "reset") {
        await updatePassword(data.password);
        notice = "Password updated. You're signed in.";
        window.location.hash = "#/";
        return;
      }
    } catch (err) {
      showErr((err && err.message) || String(err));
      captcha?.reset();
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}
