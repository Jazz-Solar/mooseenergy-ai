const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function utilityEvidenceHtml(data, selectedDate) {
  if (!data?.visible) return '';
  const e = data.evidence;
  const inverter = data.inverter;
  return `<section class="review-evidence"><h4>${data.fixture ? 'Example utility evidence · fixture' : 'Utility evidence'}</h4>
    <p>${escape(data.state?.replaceAll('_', ' '))}</p>
    ${e ? `<p>Meter ${escape(e.meter)} · Grid ${escape(e.direction)}</p>
      <p>Measurement period: ${escape(e.periodStart || 'Example period')} – ${escape(e.periodEnd || '')}</p>
      ${selectedDate ? `<p>Comparison day: ${escape(selectedDate)}. Compare only matching measurement periods.</p>` : ''}
      <p>${e.totalKwh == null ? 'No usable readings' : `${escape(Number(e.totalKwh).toFixed(2))} kWh measured`} · ${escape(Math.round(e.coverage * 100))}% coverage</p>
      ${!e.complete ? '<p>Incomplete period. Missing readings are not zero production.</p>' : ''}
      ${(e.findings || []).map(f => `<p>${escape(f)}</p>`).join('')}` : '<p>No meter evidence saved yet.</p>'}
    <p>Saved inverter production for the same period: ${inverter?.actualKwh == null ? 'Unavailable' : `${escape(inverter.actualKwh)} kWh`} · ${escape(inverter?.availability || 'unavailable')}</p>
    ${e?.generationComparable && inverter?.expectedKwh != null ? `<p>Expected generation: ${escape(inverter.expectedKwh)} kWh. Generation arrangement verified.</p>` : '<p>Grid export is shown separately from expected solar generation.</p>'}
    <p>Last synchronized: ${escape(data.lastSyncedAt || 'Not yet')}</p>
    <p>Synchronization: ${escape(data.syncState || 'Not yet')}</p>
    <p>Evidence supports review. Existing health, alerts and dispatch decisions are unchanged.</p></section>`;
}
export async function loadUtilityEvidence(call, systemId) {
  return call('utility-connection', { action: 'evidence', systemId });
}
