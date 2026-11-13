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
      <td><strong>${e(v.source)} · ${e(v.code)}</strong><small>${e(v.namespace || 'Namespace not supplied')}</small><small>${e(v.providerSeverity)}</small></td>
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
export function mountVendorErrorLog(root, call) {
  let alive=true,generation=0,busy=false,loaded=false,cursor=null,next=null,previous=[],range;
  root.innerHTML=`<div class="section-intro"><div><h3>Error log</h3><p>Manufacturer messages across all sites, including sites without an open health incident. Codes support investigation; they do not confirm a fault.</p></div></div>
    <form data-error-filter class="rates-toolbar"><div><label for="error-site">Site name or reference</label><input id="error-site" type="search" maxlength="200" placeholder="All sites"></div><div><label for="error-vendor">Manufacturer</label><select id="error-vendor"><option value="">All manufacturers</option><option value="fronius">Fronius</option><option value="enphase">Enphase</option></select></div><div><label for="error-code">Code</label><input id="error-code" maxlength="32" placeholder="All codes"></div><div><label for="error-period">First recorded</label><select id="error-period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></div><button>Apply filters</button></form>
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
      $('[data-error-rows]').innerHTML=errorLogRows(data.items);
      $('[data-error-coverage]').innerHTML=collectionCoverage(data.coverage);
      $('[data-error-page]').textContent=`Page ${previous.length+1} · ${data.items.length} messages · newest recordings first`;
      $('[data-error-message]').textContent='';
    } catch(err) {
      if(!alive||ticket!==generation)return;
      next=null;$('[data-error-rows]').replaceChildren();$('[data-error-coverage]').replaceChildren();$('[data-error-page]').textContent='';
      $('[data-error-message]').textContent=`Error log unavailable. ${err.message} Apply filters to retry.`;
    } finally {if(alive&&ticket===generation){busy=false;controls();}}
  }
  const submit=event=>{if(!event.target.matches('[data-error-filter]'))return;event.preventDefault();if(!busy){reset();void load();}};
  const click=event=>{const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-error-next')&&next){previous.push(cursor);cursor=next;void load();}
    else if(button.hasAttribute('data-error-prev')&&previous.length){cursor=previous.pop();void load();}
  };
  root.addEventListener('submit',submit);root.addEventListener('click',click);
  return {
    show(search) {if(search!==undefined){$('#error-site').value=search;reset();void load();}else if(!loaded&&!busy){reset();void load();}},
    destroy(){alive=false;++generation;root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.replaceChildren();},
  };
}
