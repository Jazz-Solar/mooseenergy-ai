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

export function modelOutcome(rows, type, configured) {
  const scored = rows.filter(i => i.deviceId && i[type]);
  const flags = scored.filter(i => ['YELLOW','RED'].includes(i[type].tier)).length;
  const uncertain = scored.some(i => i[type].tier === 'REVIEW');
  return { flags, scored: scored.length, state: flags ? 'flagged' : uncertain ? 'uncertain' : scored.length && scored.length === configured ? 'clear' : 'unavailable' };
}
const outcomeLabel = { flagged:'Flagged', clear:'No flag', uncertain:'Uncertain', unavailable:'Unavailable' };
export function comparisonHtml(data) {
  const source = data.source, twin = data.twin, rows = data.inverters;
  const validTwin = twin.state === 'available' && twin.availability === 'available' && typeof twin.actualKwh === 'number' && twin.actualKwh >= 0 && typeof twin.expectedKwh === 'number' && twin.expectedKwh > 0;
  const twinState = validTwin ? twin.actualKwh / twin.expectedKwh < .7 ? 'flagged' : 'clear' : 'unavailable';
  const conformal = modelOutcome(rows,'conformal',source.configuredInverters), xgb = modelOutcome(rows,'xgb',source.configuredInverters);
  const complete = [conformal,xgb].every(m => m.scored === source.configuredInverters) && !source.unmappedInverters;
  const states = [twinState,conformal.state,xgb.state];
  const agreement = !complete || states.includes('unavailable') ? 'Comparison incomplete' : states.includes('uncertain') ? 'One model is uncertain' : new Set(states).size === 1 ? 'Models agree' : 'Models disagree';
  const freshness = source.state === 'stale' ? `Delayed update · latest published day: ${source.latestDate}.`
    : source.state === 'unavailable' ? (data.sourceError === 'not_configured' ? 'GCP connection is not configured.' : 'GCP results could not be loaded. Retry to check again.')
    : source.state === 'no_scores' ? 'No published scores in the last 31 days.' : `Latest published day: ${source.latestDate}.`;
  const card = (name,state,signal,coverage) => `<article class="model-card"><h4>${name}</h4><strong class="model-outcome ${state}">${outcomeLabel[state]}</strong><p>${signal}</p><small>${coverage}</small></article>`;
  return `<div class="models-caption"><strong>${e(data.name)}</strong><span>${e(data.date)} · ${e(data.timezone)}</span></div>
    <div class="model-verdict"><strong>${agreement}</strong><span>Same site · same completed day</span></div>
    <div class="models-columns">
      ${card('Digital Twin',twinState,validTwin ? `${e(percent(twin.actualKwh/twin.expectedKwh))} of expected production` : 'Daily production evidence unavailable', 'Site energy · flagged below 70% of expected')}
      ${card('GCP · Conformal',conformal.state,`${conformal.flags} flagged / ${conformal.scored} scored inverters`,`${conformal.scored} of ${source.configuredInverters} mapped inverters · any flag marks the site`)}
      ${card('GCP · XGBoost',xgb.state,`${xgb.flags} flagged / ${xgb.scored} scored inverters`,`${xgb.scored} of ${source.configuredInverters} mapped inverters · any flag marks the site`)}
    </div>
    <div class="model-energy"><span>Site production</span><strong>${e(metric(twin.actualKwh,' kWh'))}<small>Actual</small></strong><strong>${e(metric(twin.expectedKwh,' kWh'))}<small>Expected</small></strong><span>${source.missingInverters ? `${source.missingInverters} inverter(s) missing GCP scores` : 'All configured inverters scored'}${source.unmappedInverters ? ` · ${source.unmappedInverters} unmapped` : ''}</span></div>
    <p class="models-freshness ${source.state === 'stale' || source.state === 'unavailable' ? 'delayed' : ''}" role="status">${e(freshness)} Last scored: ${e(time(source.scoredAt))}</p>
    <details class="model-inverters"><summary>Inverter evidence (${rows.length})</summary><p>Recorded monitoring and daily GCP results. Digital Twin energy above is site-wide.</p><div class="access-table-scroll" role="region" aria-label="Daily inverter model comparison" tabindex="0"><table class="access-table models-table"><caption>Inverter results for ${e(data.date)}</caption><thead><tr><th scope="col">Inverter</th><th scope="col">Recorded monitoring</th><th scope="col">GCP · Conformal</th><th scope="col">GCP · XGBoost</th></tr></thead><tbody>
      ${rows.map(i => `<tr><th scope="row">${e(i.name)}<small>${e(i.label)}</small><small class="model-device">${e(i.deviceId || 'Device mapping unavailable')}</small></th><td>${e(({ green: 'Producing', yellow: 'Needs review', red: 'Fault recorded' })[i.monitoringStatus] || 'Unavailable')}<small>${e(i.monitoringReason ? String(i.monitoringReason).replaceAll('_', ' ') : 'No recorded monitoring evidence')}</small></td><td>${detector(i, 'conformal')}</td><td>${detector(i, 'xgb')}</td></tr>`).join('')}
    </tbody></table></div></details>
    <details class="models-help"><summary>How results are compared</summary><p>All three results answer whether this site was flagged on the selected local day. Digital Twin flags site energy below 70% of expected. Each GCP detector flags the site if any mapped inverter is yellow or red. A no-flag result requires scores for every configured inverter; missing results stay unavailable. Agreement requires complete coverage.</p><p>These methods use different baselines and thresholds. Their percentages and scores are not equivalent measurements. Conformal unusualness is not fault probability. XGBoost estimates energy loss and its tier also uses an uncertainty interval absent from this export.</p><p>Model flags support investigation. They do not confirm a physical fault or send an alert. Recorded monitoring can include provider offline observations or reviewed faults and is shown separately. Shared site settings are used; private account assumptions are excluded.</p><p>Twin calculated: ${e(time(twin.calculatedAt))}. ${e(source.schedule)}.</p></details>`;
}

export function mountHealthModels(root, call, options = {}) {
  let alive = true, generation = 0, sites = [];
  const prefix = options.systemId ? 'review-' : '';
  const id = name => `${prefix}${name}`;
  root.innerHTML = `<section class="models-section" aria-labelledby="${id('models-title')}"><div class="models-heading"><h3 id="${id('models-title')}">${options.systemId ? 'Completed-day model evidence' : 'Digital Twin vs GCP'}</h3></div>
    <form class="rates-toolbar" data-model-filter><div ${options.systemId ? 'hidden' : ''}><label for="${id('model-site')}">Comparison site</label><select id="${id('model-site')}" data-model-site disabled><option>Loading sites…</option></select></div><div><label for="${id('model-date')}">Analysis day</label><input id="${id('model-date')}" data-model-date type="date" disabled></div><button type="submit" data-model-refresh disabled>Refresh comparison</button><button type="button" data-model-latest disabled>Latest published day</button></form>
    <p data-model-message role="status"></p><div data-model-result></div></section>`;
  const $ = selector => root.querySelector(selector);
  async function load(latest = false) {
    const ticket = ++generation, systemId = $('[data-model-site]').value;
    $('[data-model-result]').replaceChildren();
    $('[data-model-message]').textContent = 'Loading daily comparison…';
    const input = { systemId };
    if (!latest && $('[data-model-date]').value) input.date = $('[data-model-date]').value;
    try {
      const { data } = await call('staff-site-access', { action: 'health_model_comparison', input });
      if (!alive || ticket !== generation) return;
      if (data.systemId !== systemId || input.date && data.date !== input.date) throw new Error('Comparison response did not match the selected site and day.');
      $('[data-model-date]').value = data.date;
      $('[data-model-date]').min = data.minDate; $('[data-model-date]').max = data.maxDate;
      $('[data-model-date]').disabled = false;
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
      sites = options.systemId ? data.sites.filter(s => s.systemId === options.systemId) : data.sites;
      if (!sites.length) {
        $('[data-model-message]').textContent = 'Digital Twin / GCP comparison is not available for this site.';
        $('[data-model-filter]').hidden = true;
        return;
      }
      $('[data-model-site]').innerHTML = sites.map(s => `<option value="${e(s.systemId)}">${e(s.name)}</option>`).join('');
      $('[data-model-site]').disabled = false;
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
  const change = event => { if (event.target.matches('[data-model-site]')) { $('[data-model-date]').value = ''; void load(true); } else if (event.target.matches('[data-model-date]')) void load(); };
  const click = event => { if (event.target.closest('[data-model-latest]')) void load(true); };
  root.addEventListener('submit', submit); root.addEventListener('change', change); root.addEventListener('click', click);
  void initialize();
  return { destroy() { alive = false; ++generation; root.removeEventListener('submit', submit); root.removeEventListener('change', change); root.removeEventListener('click', click); root.replaceChildren(); } };
}
