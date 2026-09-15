const streetWords = { rd:'road', st:'street', ave:'avenue', blvd:'boulevard', dr:'drive', ln:'lane', hwy:'highway', ct:'court', centre:'center' };
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(word=>streetWords[word]||word).join(' ');
const systemId = value => String(value || '').toLowerCase().replace(/^(?!f:)/,'f:');
const validId = value => /^f:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const genericWords = new Set(['road','street','avenue','boulevard','drive','lane','highway','court','canada','ontario','solar','site','system']);

export function siteLabel(site) {
  const name = site.display_name || site.system_id;
  return `${name} · ${site.display_address || 'Address not recorded'} · ${site.system_id.slice(-8)}`;
}

// Suggestions help staff find a site; they do not represent observed permissions.
export function rankSiteHints(request, catalog) {
  const entries = new Map(catalog.map(site=>[site.system_id,{...site}]));
  for (const candidate of request.candidates || []) {
    const id = systemId(candidate.systemId), known = entries.get(id);
    entries.set(id, { system_id:id, display_name:candidate.displayName, display_address:candidate.displayAddress,
      ...known, discoveryReason:candidate.matchReason });
  }
  const text = normalize([request.address, request.title].filter(Boolean).join(' '));
  const words = new Set(text.split(' ').filter(word=>word.length>2&&!genericWords.has(word)));
  const numbers = text.match(/\b\d+\b/g) || [];
  const requested = systemId(request.fronius_system_id || request.matched_system_id);
  return [...entries.values()].filter(site=>validId(site.system_id)).flatMap(site=>{
    const name = normalize(site.display_name), address = normalize(site.display_address);
    const siteWords = new Set(`${name} ${address}`.split(' '));
    const matches = [...words].filter(word=>siteWords.has(word)&&!/^\d+$/.test(word));
    const addressMatch = text.length>4&&address.length>4&&(address.includes(text)||text.includes(address));
    const nameMatch = text.length>4&&name.length>4&&(name.includes(text)||text.includes(name));
    const numberMatch = numbers.some(number=>siteWords.has(number));
    let score = matches.length*10 + (matches.length&&numberMatch?35:0);
    let reason = 'Similar address or site name';
    if (site.discoveryReason) { score+=15; reason='Previously discovered near this request'; }
    if (nameMatch) { score+=90; reason='Site name matches the request'; }
    if (addressMatch) { score+=120; reason='Address matches the request'; }
    if (site.system_id===requested || site.discoveryReason==='id') { score+=1000; reason='Requested system ID'; }
    return score>0?[{...site, score, reason}]:[];
  }).sort((a,b)=>b.score-a.score||String(a.display_name).localeCompare(String(b.display_name))||a.system_id.localeCompare(b.system_id)).slice(0,5);
}
