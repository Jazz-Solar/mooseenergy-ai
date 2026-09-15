// Only the optional loopback presentation server supplies this page marker.
// Auth continues using the selected Supabase project and its separate session.
export function functionEndpoint(environment, name, location, localProxy = false) {
  if (localProxy && location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
    return `/__admin-api/${environment.name}/${name}`;
  }
  return `${environment.url}/functions/v1/${name}`;
}
