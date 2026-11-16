import {escapeHtml as e} from './site-access.js?v=20260914-fit-rates-1';
import {providerSiteLink} from './site-context.js?v=20261009-site-context-1';

const date = value => value ? new Date(value).toLocaleString() : 'Not recorded';
const collectionState = state => ({available:'Available',partial:'Partial collection',unavailable:'Unavailable',stale:'No recent check',not_checked:'Not checked yet'})[state] || 'Unavailable';
export function logState(row) {
  if (row.interpretation.source === 'fronius') return 'Historical message · current state unknown';
  return row.noLongerReportedAt ? 'No longer reported in the open-alarm feed' : 'Open at last observation';
}
export function errorLogRows(rows) {
  if (!rows.length) return '<div class="access-empty">No manufacturer messages recorded for these filters. This does not establish that the sites are fault-free.</div>';
  return `<div class="access-table-scroll" role="region" aria-label="Manufacturer error log" tabindex="0"><table class="access-table"><thead><tr><th>Site and time</th><th>Manufacturer code</th><th>Shared meaning and original message</th><th>Observation</th></tr></thead><tbody>${rows.map(row => {
    const v = row.interpretation;
    return `<tr><td><strong>${e(row.systemName)}</strong>${providerSiteLink(row.systemId,row.systemName)}<small>Recorded ${e(date(row.firstRecordedAt))}</small><small>Manufacturer time ${e(date(v.startedAt))}</small></td>
      <td><strong>${e(v.source)} · ${e(v.code)}</strong><small>${v.state==='reported'?'Historical message · current state unknown':'Open at this check'}</small><small>${e(v.namespace || 'Namespace not supplied')}</small><small>${e(v.providerSeverity)}</small></td>
      <td><strong>${e(v.label)}</strong><small>${e(v.condition)}</small><p>${e(v.providerMessage || 'No manufacturer description supplied.')}</p><details><summary>Meaning and guidance</summary><p>${e(v.meaning)}</p><p>${e(v.guidance)}</p></details>${v.deviceIds.length ? `<details><summary>${v.deviceIds.length} device reference${v.deviceIds.length===1?'':'s'}</summary>${v.deviceIds.map(id=>`<small>${e(id)}</small>`).join('')}</details>` : ''}</td>
      <td><strong>${e(logState(row))}</strong><small>Last observed ${e(date(row.lastObservedAt))}</small>${row.noLongerReportedAt?`<small>No longer reported ${e(date(row.noLongerReportedAt))}</small>`:''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
export function collectionCoverage(c) {
  const attention = Number(c.total)-Number(c.available);
  return `<div class="review-scope"><strong>Message collection: ${Number(c.available)} of ${Number(c.total)} matching sites available</strong>
    <p>${Number(c.unavailable)} unavailable · ${Number(c.partial)} partial · ${Number(c.stale)} without a recent check · ${Number(c.notChecked)} not checked yet</p>
    <small>Coverage reflects the latest collection check, independent of the log date and code filters. Fronius checks request the previous 24 hours, up to 200 messages. Enphase checks read open alarms. Recorded messages remain in this log.</small>
    ${attention ? `<details><summary>Sites with incomplete collection (${attention})</summary><p>Unavailable collection does not mean there are no errors. Showing up to 50 sites; use the site filter to narrow the list.</p>${(c.attention||[]).map(s=>`<p><strong>${e(s.systemName)} · ${e(collectionState(s.state))}</strong><small>${e(s.reason||'No collection result')} · Last message check ${e(date(s.lastAttemptAt))} · Last successful collection ${e(date(s.lastSuccessAt))}</small></p>`).join('')}</details>` : ''}</div>`;
}
export function siteLogContext(site) {
  if (!site) return '<p class="access-message">Filter to one site to see its health conditions and history coverage.</p>';
  const current=site.health?.current || {}, devices=site.health?.inverters || [], incidents=site.incidents || {}, collection=site.collection || {}, history=site.history || {};
  const warnings=devices.filter(d=>d.warning), imports=site.historyImports || [];
  const condition = d => ({offline:'Reported offline',zero_confirmed:'Sustained zero output',underperforming:'Production below expected output'})[d.warningEvidence?.state] || 'Monitoring needs review';
  const status = Number(incidents.confirmed)>0 ? 'Confirmed fault' : warnings.length || current.monitoringDataWarning ? 'Needs review' : current.status==='green' ? 'Healthy assessment' : 'Health unavailable';
  return `<section class="review-scope vendor-site-context" aria-label="Current site conditions"><h3>${e(site.systemName)}</h3><strong>${status}</strong>
    <p>${Number(incidents.confirmed)||0} confirmed incident${Number(incidents.confirmed)===1?'':'s'} · ${Number(incidents.open)||0} open issue${Number(incidents.open)===1?'':'s'} · ${warnings.length} inverter${warnings.length===1?'':'s'} with an unresolved warning</p>
    <p>Health conditions come from telemetry and incident reviews. A manufacturer code is not required for an offline warning.</p>
    <small>Latest health poll ${e(date(current.retrievedAt))}${current.assessmentCarriedForward ? ' · Healthy daylight assessment retained overnight' : ''}</small>
    ${warnings.length ? `<div class="fault-list">${warnings.map(d=>`<article class="fault-card"><div><h4>${e(condition(d))} · ${e(d.name || 'Inverter')}</h4><small>Warning observed ${e(date(d.warningEvidence?.observedAt))}${d.fresh ? '' : ' · Latest reading is not fresh'}</small><details><summary>Device reference</summary><small>${e(d.deviceId)}</small></details></div></article>`).join('')}</div>` : '<p>No unresolved inverter warning is recorded in the available health evidence.</p>'}
    ${current.monitoringDataWarning ? '<p>Scheduled monitoring evidence is incomplete.</p>' : ''}
    <button type="button" data-error-review-site>Review site health</button>
    <details><summary>Message history coverage</summary>
      <p>Latest collection: ${e(collectionState(collection.state))}. Last attempt ${e(date(collection.lastAttemptAt))}; last successful check ${e(date(collection.lastSuccessAt))}.</p>
      <p>${site.source==='fronius' ? 'Each scheduled check requests the preceding 24 hours, up to 200 messages.' : 'Each scheduled check reads the manufacturer’s open alarms.'} Collection availability does not establish equipment health.</p>
      <p>${Number(history.retainedMessages)||0} retained manufacturer messages. First saved ${e(date(history.firstRecordedAt))}; oldest manufacturer timestamp ${e(date(history.oldestManufacturerAt))}.</p>
      <p>Health-check snapshots retained since ${e(date(site.checksRetainedSince))}. Earlier checks were not reconstructed.</p>
      ${imports.length ? `<p>Historical retrieval completed for these windows. This does not establish complete lifetime history.</p>${imports.map(i=>`<p>${e(date(i.window_from))} – ${e(date(i.window_to))}: ${Number(i.message_count)} messages returned; ${Number(i.inserted_count)} newly saved.</p>`).join('')}` : '<p>Older manufacturer history has not been imported for this site. A longstanding condition can have no recent manufacturer message.</p>'}
    </details>
    ${site.latestCheck ? '<button type="button" data-error-check>View latest health-check codes</button><div data-error-check-detail></div>' : '<p>No manufacturer snapshot has been retained for a health check yet.</p>'}
  </section>`;
}
export function healthCheckCodes(check) {
  if (!check) return '<p>No manufacturer snapshot is retained for this check.</p>';
  const rows=check.evidence || [];
  return `<section class="review-evidence"><h4>Manufacturer codes at this health check</h4><p>${e(date(check.checkedAt))} · ${e(collectionState(check.state))}${check.reason ? ` · ${e(check.reason)}` : ''}</p>
    ${rows.length ? `<ul>${rows.map(v=>`<li><strong>${e(v.source)} ${e(v.code)} · ${e(v.label)}</strong><p>${e(v.providerMessage || 'No manufacturer description supplied.')}</p><small>${v.state==='reported'?'Historical message · current state unknown':'Open at this check'}</small><small>${e(v.namespace || 'Namespace not supplied')} · ${e(v.providerSeverity || 'Severity not supplied')} · Manufacturer time ${e(date(v.startedAt))}</small>${v.deviceIds?.length ? `<details><summary>Device references</summary>${v.deviceIds.map(id=>`<small>${e(id)}</small>`).join('')}</details>` : ''}<details><summary>Meaning and guidance</summary><p>${e(v.meaning || 'Review the original manufacturer message.')}</p><p>${e(v.guidance || '')}</p></details></li>`).join('')}</ul>` : `<p>${check.state==='available' ? 'No manufacturer messages were returned at this check. Known health conditions may still exist.' : 'Manufacturer evidence was unavailable or incomplete at this check.'}</p>`}
    <small>This saved observation does not create another event in the error log.</small></section>`;
}
export function mountVendorErrorLog(root, call, {onReview}={}) {
  let alive=true,generation=0,busy=false,loaded=false,cursor=null,next=null,previous=[],range;
  let selectedSite=null;
  root.innerHTML=`<div class="section-intro"><div><h3>Error log</h3><p>Manufacturer messages across all sites, including sites without an open health incident. Codes support investigation; they do not confirm a fault.</p></div></div>
    <div data-error-site-context></div><form data-error-filter class="rates-toolbar"><div><label for="error-site">Site name or reference</label><input id="error-site" type="search" maxlength="200" placeholder="All sites"></div><div><label for="error-vendor">Manufacturer</label><select id="error-vendor"><option value="">All manufacturers</option><option value="fronius">Fronius</option><option value="enphase">Enphase</option></select></div><div><label for="error-code">Code</label><input id="error-code" maxlength="32" placeholder="All codes"></div><div><label for="error-period">First recorded</label><select id="error-period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></div><button>Apply filters</button></form>
    <p>Filters search saved messages by when Moose first recorded them. A longer period does not retrieve older manufacturer data.</p>
    <p data-error-message class="access-message" role="status"></p><div data-error-coverage></div><div data-error-rows></div><div class="rates-pager"><button type="button" data-error-prev disabled>Previous messages</button><span data-error-page></span><button type="button" data-error-next disabled>Next messages</button></div>`;
  const $ = selector => root.querySelector(selector);
  function reset() {
    cursor=null;next=null;previous=[];
    const now=Date.now();range={from:new Date(now-Number($('#error-period').value)*86400000).toISOString(),to:new Date(now).toISOString()};
  }
  function controls() {
    root.querySelectorAll('input,select,button').forEach(el=>{el.disabled=busy;});
    $('[data-error-prev]').disabled=busy||previous.length===0;
    $('[data-error-next]').disabled=busy||next===null;
  }
  async function load() {
    const ticket=++generation;busy=true;controls();
    $('[data-error-message]').textContent='Loading manufacturer messages…';
    try {
      const response=await call('staff-site-access',{action:'vendor_error_log',input:{search:$('#error-site').value.trim(),source:$('#error-vendor').value,code:$('#error-code').value.trim(),...range,cursor}});
      if(!alive||ticket!==generation)return;
      const data=response.data;next=data.nextCursor;loaded=true;
      selectedSite=data.siteContext || null;
      $('[data-error-site-context]').innerHTML=siteLogContext(selectedSite);
      $('[data-error-rows]').innerHTML=errorLogRows(data.items);
      $('[data-error-coverage]').innerHTML=collectionCoverage(data.coverage);
      $('[data-error-page]').textContent=`Page ${previous.length+1} · ${data.items.length} messages · newest recordings first`;
      $('[data-error-message]').textContent='';
    } catch(err) {
      if(!alive||ticket!==generation)return;
      next=null;selectedSite=null;$('[data-error-site-context]').replaceChildren();$('[data-error-rows]').replaceChildren();$('[data-error-coverage]').replaceChildren();$('[data-error-page]').textContent='';
      $('[data-error-message]').textContent=`Error log unavailable. ${err.message} Apply filters to retry.`;
    } finally {if(alive&&ticket===generation){busy=false;controls();}}
  }
  const submit=event=>{if(!event.target.matches('[data-error-filter]'))return;event.preventDefault();if(!busy){reset();void load();}};
  const click=event=>{const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-error-review-site')&&selectedSite)onReview?.(selectedSite,button);
    else if(button.hasAttribute('data-error-check')&&selectedSite?.latestCheck){
      const ticket=generation,pollId=selectedSite.latestCheck.pollId;button.disabled=true;
      call('staff-site-access',{action:'vendor_health_check',input:{pollId}}).then(r=>{
        if(alive&&ticket===generation)$('[data-error-check-detail]').innerHTML=healthCheckCodes(r.data);
      }).catch(err=>{if(alive&&ticket===generation)$('[data-error-check-detail]').textContent=`Health-check codes unavailable. ${err.message}`;})
        .finally(()=>{if(alive&&ticket===generation)button.disabled=false;});
    }
    else if(button.hasAttribute('data-error-next')&&next){previous.push(cursor);cursor=next;void load();}
    else if(button.hasAttribute('data-error-prev')&&previous.length){cursor=previous.pop();void load();}
  };
  root.addEventListener('submit',submit);root.addEventListener('click',click);
  return {
    show(search) {if(search!==undefined){$('#error-site').value=search;reset();void load();}else if(!loaded&&!busy){reset();void load();}},
    destroy(){alive=false;++generation;root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.replaceChildren();},
  };
}
