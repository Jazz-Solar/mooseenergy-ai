export const environments = Object.freeze({
  "development": {
    "label": "Development",
    "url": "https://vjgmkjqfzhnogawlgkrc.supabase.co",
    "key": "sb_publishable_qopfLRYldXzsBASuPNdWJw_ABJv93O9"
  },
  "production": {
    "label": "Production",
    "url": "https://rcwynvzgzzywrormxlqp.supabase.co",
    "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjd3ludnpnenp5d3Jvcm14bHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjM0MDQsImV4cCI6MjA5NTczOTQwNH0.wYq7WoBKvX18TFiqyWv9qfDkP6mrGfcHaSUV6b2iMjs"
  }
});
export function selectEnvironment(search, hostname = '') {
  const defaultName = ['mooseenergy.ai', 'www.mooseenergy.ai'].includes(hostname) ? 'production' : 'development';
  const name = new URLSearchParams(search).get("environment") || defaultName;
  if (!Object.hasOwn(environments, name)) throw new Error("Unknown environment");
  return { ...environments[name], name, storageKey: `moose-staff-${name}-auth-v1` };
}
