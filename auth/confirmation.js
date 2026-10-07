const projects = { dev: 'vjgmkjqfzhnogawlgkrc', production: 'rcwynvzgzzywrormxlqp' };
const schemes = { dev: 'moose-dev:', production: 'moose:' };
const token = /^[A-Za-z0-9_-]{43}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function unique(params, keys) {
  return [...params.keys()].every(k => keys.includes(k)) && keys.every(k => params.getAll(k).length === 1);
}
function handoffFragment(hash) {
  const values = new URLSearchParams(hash.slice(1));
  if (!unique(values, ['id', 'key']) || !uuid.test(values.get('id')) || !token.test(values.get('key'))) throw new Error('Invalid link');
  return { id: values.get('id'), key: values.get('key') };
}
export function confirmationTarget(hash) {
  if (!hash || hash.length > 8192) throw new Error('Invalid link');
  // Go's HTML email templates encode a URL inserted after a literal '#'.
  // Decode that outer layer once, preserving the verification URL's own
  // encoded redirect and handoff fragment. Plain-text links remain valid.
  const value = hash.slice(1);
  const url = new URL(/^https%3a%2f%2f/i.test(value) ? decodeURIComponent(value) : value);
  const environment = Object.keys(projects).find(env => url.origin === `https://${projects[env]}.supabase.co`);
  if (!environment || url.username || url.password || url.hash || url.pathname !== '/auth/v1/verify'
    || !unique(url.searchParams, ['token', 'type', 'redirect_to']) || url.searchParams.get('type') !== 'signup'
    || !/^[A-Za-z0-9_-]{16,512}$/.test(url.searchParams.get('token'))) throw new Error('Invalid link');
  const redirect = new URL(url.searchParams.get('redirect_to'));
  const legacy = redirect.href === `${schemes[environment]}//auth/callback`;
  if (!legacy) {
    if (redirect.origin !== 'https://mooseenergy.ai' || redirect.username || redirect.password || redirect.search
      || redirect.pathname !== `/auth/complete/${environment}/`) throw new Error('Invalid link');
    handoffFragment(redirect.hash);
  } else {
    // Older app versions cannot relay the code to a waiting phone. Keep the
    // verification result in the browser; opening the app is an explicit choice.
    url.searchParams.set('redirect_to', `https://mooseenergy.ai/auth/complete/${environment}/legacy/`);
  }
  return url.href;
}
export function legacyCompletionInput(href) {
  const url = new URL(href);
  const environment = Object.keys(projects).find(env => url.pathname === `/auth/complete/${env}/legacy/`);
  if (!environment || url.origin !== 'https://mooseenergy.ai' || url.username || url.password || url.hash
    || !unique(url.searchParams, ['code']) || !/^[A-Za-z0-9_-]{8,2048}$/.test(url.searchParams.get('code'))) throw new Error('Invalid link');
  return { environment, callback: `${schemes[environment]}//auth/callback?code=${encodeURIComponent(url.searchParams.get('code'))}` };
}
export function completionInput(href) {
  const url = new URL(href);
  const environment = Object.keys(projects).find(env => url.pathname === `/auth/complete/${env}/`);
  if (!environment || !unique(url.searchParams, ['code']) || !/^[A-Za-z0-9_-]{8,2048}$/.test(url.searchParams.get('code'))) throw new Error('Invalid link');
  return {environment, ...handoffFragment(url.hash), code: url.searchParams.get('code')};
}
export function handoffEndpoint(environment) {
  if (!Object.hasOwn(projects, environment)) throw new Error('Invalid environment');
  return `https://${projects[environment]}.supabase.co/functions/v1/signup-handoff`;
}
