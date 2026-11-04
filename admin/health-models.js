import { escapeHtml as e } from './site-access.js?v=20260914-fit-rates-1';

const metric = (value, suffix = '', precision = 2) => typeof value === 'number' && Number.isFinite(value)
  ? `${value.toLocaleString(undefined, { maximumFractionDigits: precision })}${suffix}` : 'Unavailable';
const percent = value => metric(typeof value === 'number' ? value * 100 : null, '%');
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not published';
const badge = tier => {
  const labels = { GREEN: 'Green · no model flag', YELLOW: 'Yellow · model flag', RED: 'Red · model flag', REVIEW: 'Review · uncertain' };
  return `<span class="model-badge ${Object.hasOwn(labels, tier) ? tier.toLowerCase() : 'unknown'}">${labels[tier] || 'Not scored'}</span>`;
};
const detector = (row, type) => row[type]
  ? `${badge(row[type].tier)}<small>${type === 'conformal' ? 'Unusualness' : 'Predicted loss'}: ${e(type === 'conformal' ? metric(row[type].score, '', 4) : percent(row[type].score))}</small>`
  : '<span class="model-badge unknown">Not scored</span>';

export function comparisonHtml(data) {
  const source = data.source, twin = data.twin;
  const flagged = data.inverters.filter(i => i.conformal && (i.conformal.tier !== 'GREEN' || i.xgb?.tier !== 'GREEN')).length;
  const freshness = source.state === 'stale' ? `Delayed update · latest published day: ${source.latestDate}. Last scoring is over 36 hours old.`
    : source.state === 'unavailable' ? (data.sourceError === 'not_configured' ? 'GCP connection is not configured.' : 'GCP results could not be loaded. Retry to check again.')
    : source.state === 'no_scores' ? 'No published scores for this site in the last 31 days.'
    : `Latest published day: ${source.latestDate}.`;
  return `<div class="models-caption"><strong>${e(data.name)}</strong><span>${e(data.date)} · ${e(data.timezone)}</span></div>
    <p class="models-freshness ${source.state === 'stale' || source.state === 'unavailable' ? 'delayed' : ''}" role="status">${e(freshness)} Last scored: ${e(time(source.scoredAt))}</p>
    <div class="models-columns">
      <article class="model-card"><h4>Digital Twin</h4><p>Shared site production · selected day</p>
        <strong class="model-value">${e(percent(twin.performanceRatio))}</strong><span>Actual / expected energy</span>
        <dl><div><dt>Actual</dt><dd>${e(metric(twin.actualKwh, ' kWh'))}</dd></div><div><dt>Expected</dt><dd>${e(metric(twin.expectedKwh, ' kWh'))}</dd></div></dl>
        <small>${twin.state === 'calendar_unavailable' ? 'Site calendar is unavailable; dates cannot be aligned.' : twin.state !== 'available' ? 'No shared production evidence for this day.' : `Evidence: ${e(String(twin.availability))}${twin.reason ? ` · ${e(String(twin.reason).replaceAll('_', ' '))}` : ''}`}</small>
        <small>Calculated: ${e(time(twin.calculatedAt))}</small>
      </article>
      <article class="model-card"><h4>GCP anomaly detection</h4><p>Two detectors · daily inverter results</p>
        <strong class="model-value">${source.scoredInverters ? `${flagged} / ${source.scoredInverters}` : 'Not scored'}</strong><span>Scored inverters flagged by either model</span>
        <dl><div><dt>Published</dt><dd>${source.scoredInverters} inverter${source.scoredInverters === 1 ? '' : 's'}</dd></div><div><dt>Without a score</dt><dd>${source.missingInverters} of ${source.configuredInverters} configured</dd></div></dl>
        <small>${source.unmappedInverters ? `${source.unmappedInverters} source inverter labels have no verified device mapping. ` : ''}Missing scores are not healthy results.</small>
        <small>${e(source.schedule)} · ${e(source.environment)}</small>
      </article>
    </div>
    <p class="models-scroll-hint">Scroll the table sideways to compare both detectors.</p><div class="access-table-scroll" role="region" aria-label="Daily inverter model comparison" tabindex="0"><table class="access-table models-table"><caption>Inverter results for ${e(data.date)}</caption><thead><tr><th scope="col">Inverter</th><th scope="col">Moose monitoring</th><th scope="col">Conformal detector</th><th scope="col">XGBoost detector</th></tr></thead><tbody>
      ${data.inverters.map(i => `<tr><th scope="row">${e(i.name)}<small>${e(i.label)}</small><small class="model-device">${e(i.deviceId || 'Device mapping unavailable')}</small></th><td>${e(({ green: 'Producing', yellow: 'Needs review', red: 'Confirmed fault' })[i.monitoringStatus] || 'Unavailable')}<small>${e(i.monitoringReason ? String(i.monitoringReason).replaceAll('_', ' ') : 'No recorded monitoring evidence')}</small></td><td>${detector(i, 'conformal')}</td><td>${detector(i, 'xgb')}</td></tr>`).join('')}
    </tbody></table></div>
    <details class="models-help"><summary>How to read this comparison</summary><p>Digital Twin compares actual and expected energy for the whole site. Moose monitoring records inverter observations. GCP scores each inverter day using its own configured baseline, which includes Digital Twin features. These are different measures, so they can disagree.</p><p>Conformal unusualness runs from 0 to 1; higher values are more unusual, not a probability of equipment failure. XGBoost estimates the fraction of energy lost. Its tier also uses an uncertainty interval that the app export does not include.</p><p>Model flags support investigation. They do not confirm a physical fault or send an alert. Unscored days can reflect data quality gates or a missing publication; the export does not provide the reason. Device labels are matched using the GCP reference inventory.</p></details>`;
}

export function mountHealthModels(root, call) {
  let alive = true, generation = 0, sites = [];
  root.innerHTML = `<section class="models-section" aria-labelledby="models-title"><div class="models-heading"><h3 id="models-title">Daily model comparison</h3><span>Digital Twin + GCP</span></div><p>Compare shared site production with anomaly detection across the seven configured GCP sites.</p>
    <form class="rates-toolbar" data-model-filter><div><label for="model-site">Comparison site</label><select id="model-site" disabled><option>Loading sites…</option></select></div><div><label for="model-date">Analysis day</label><input id="model-date" type="date" disabled></div><button type="submit" data-model-refresh disabled>Refresh comparison</button><button type="button" data-model-latest disabled>Latest published day</button></form>
    <p data-model-message role="status"></p><div data-model-result></div></section>`;
  const $ = selector => root.querySelector(selector);
  async function load(latest = false) {
    const ticket = ++generation, systemId = $('#model-site').value;
    $('[data-model-result]').replaceChildren();
    $('[data-model-message]').textContent = 'Loading daily comparison…';
    const input = { systemId };
    if (!latest && $('#model-date').value) input.date = $('#model-date').value;
    try {
      const { data } = await call('staff-site-access', { action: 'health_model_comparison', input });
      if (!alive || ticket !== generation) return;
      if (data.systemId !== systemId || input.date && data.date !== input.date) throw new Error('Comparison response did not match the selected site and day.');
      $('#model-date').value = data.date;
      $('#model-date').min = data.minDate; $('#model-date').max = data.maxDate;
      $('#model-date').disabled = false;
      $('[data-model-result]').innerHTML = comparisonHtml(data);
      $('[data-model-message]').textContent = '';
    } catch (error) {
      if (alive && ticket === generation) $('[data-model-message]').textContent = `${error.message} Use Refresh comparison to retry.`;
    }
  }
  async function initialize() {
    const ticket = ++generation;
    try {
      const { data } = await call('staff-site-access', { action: 'health_model_sites', input: {} });
      if (!alive || ticket !== generation) return;
      if (!Array.isArray(data.sites) || !data.sites.length) throw new Error('Comparison sites are unavailable.');
      sites = data.sites;
      $('#model-site').innerHTML = sites.map(s => `<option value="${e(s.systemId)}">${e(s.name)}</option>`).join('');
      $('#model-site').disabled = false;
      $('[data-model-refresh]').disabled = false; $('[data-model-latest]').disabled = false;
      await load(true);
    } catch (error) {
      if (alive && ticket === generation) {
        $('[data-model-message]').textContent = `${error.message} Use Refresh comparison to retry.`;
        $('[data-model-refresh]').disabled = false;
      }
    }
  }
  const submit = event => { if (event.target.matches('[data-model-filter]')) { event.preventDefault(); void (sites.length ? load() : initialize()); } };
  const change = event => { if (event.target.id === 'model-site') { $('#model-date').value = ''; void load(true); } else if (event.target.id === 'model-date') void load(); };
  const click = event => { if (event.target.closest('[data-model-latest]')) void load(true); };
  root.addEventListener('submit', submit); root.addEventListener('change', change); root.addEventListener('click', click);
  void initialize();
  return { destroy() { alive = false; ++generation; root.removeEventListener('submit', submit); root.removeEventListener('change', change); root.removeEventListener('click', click); root.replaceChildren(); } };
}
