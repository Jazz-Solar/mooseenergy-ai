import { confirmationTarget, completionInput, handoffEndpoint } from './confirmation.js?v=20261007.1';
import { environments } from '../admin/environments.js';
const original = location.href;
// Clear capabilities from browser history before any request or interaction.
history.replaceState(null, '', location.pathname);
const title = document.querySelector('h1'), message = document.querySelector('#message'), button = document.querySelector('button');
function unavailable() {
  title.textContent = 'Return to Moose';
  message.textContent = 'This link is unavailable or has expired. If your email is already confirmed, sign in with your password. Otherwise, request a new confirmation link in Moose.';
  button.hidden = true;
}
if (location.pathname === '/auth/confirm/') {
  try {
    const target = confirmationTarget(new URL(original).hash);
    button.hidden = false;
    // No automatic verification: email security scanners must not consume the link.
    button.addEventListener('click', () => { button.disabled = true; location.replace(target); });
  } catch { unavailable(); }
} else {
  let input;
  try { input = completionInput(original); } catch { unavailable(); }
  if (input) {
    let busy = false;
    async function finish() {
      if (busy) return;
      busy = true; button.hidden = true;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const config = environments[input.environment === 'dev' ? 'development' : 'production'];
        const response = await fetch(handoffEndpoint(input.environment), {
          method: 'POST', headers: {'content-type': 'application/json', apikey: config.key},
          body: JSON.stringify({action: 'submit', id: input.id, key: input.key, code: input.code}),
          signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
        });
        if (!response.ok) throw new Error('Unavailable');
        const result = await response.json();
        if (result.data?.status !== 'submitted') { unavailable(); return; }
        title.textContent = 'Your email is confirmed';
        message.textContent = 'Return to Moose on your phone. If it’s open, setup will continue automatically. If you return later, sign in with your password.';
      } catch {
        title.textContent = 'Your email is confirmed';
        message.textContent = 'We couldn’t reach Moose on your phone. Try again, or open the app and sign in with your password.';
        button.textContent = 'Try again'; button.hidden = false;
      } finally { clearTimeout(timeout); busy = false; }
    }
    button.addEventListener('click', finish);
    void finish();
  }
}
