// hCaptcha for the auth forms. Enabled only when config.js has a real site key;
// otherwise every function is a no-op so the forms still work.
import { HCAPTCHA_SITE_KEY } from "../../config.js";

export const captchaEnabled =
  !!HCAPTCHA_SITE_KEY && !/YOUR|xxxx/i.test(HCAPTCHA_SITE_KEY);

let scriptPromise = null;
function loadHcaptcha() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.hcaptcha) return resolve(window.hcaptcha);
    const s = document.createElement("script");
    s.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.hcaptcha);
    s.onerror = () => reject(new Error("Couldn't load hCaptcha — check your connection."));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Render a widget into `container`. Returns { token(), reset(), remove() }.
export async function mountCaptcha(container) {
  if (!captchaEnabled || !container) {
    return { token: () => undefined, reset: () => {}, remove: () => {} };
  }
  const hcaptcha = await loadHcaptcha();
  let value = null;
  const id = hcaptcha.render(container, {
    sitekey: HCAPTCHA_SITE_KEY,
    callback: (t) => { value = t; },
    "expired-callback": () => { value = null; },
    "error-callback": () => { value = null; },
  });
  return {
    token: () => value,
    reset: () => { value = null; try { hcaptcha.reset(id); } catch { /* */ } },
    remove: () => { try { hcaptcha.remove(id); } catch { /* */ } },
  };
}
