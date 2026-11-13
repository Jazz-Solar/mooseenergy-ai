import { mountVendorErrorLog } from './vendor-error-log.js?v=20261113-1';
import { providerSiteLink, mountConnectedAccounts } from './site-context.js?v=20261009-site-context-1';
import { escapeHtml as e } from "./site-access.js?v=20260914-fit-rates-1";
import { mountHealthModels } from './health-models.js?v=20261105-1';
export const healthState = (status) =>
  ({
    yellow: "Needs review",
    red: "Confirmed fault",
    pending: "Needs review",
    confirmed: "Confirmed fault",
    dispatched: "Confirmed fault",
    resolved: "Recovered",
    dismissed: "Dismissed",
  })[status] || "Unavailable";
export const healthCause = c => {
  const reason = ({provider_offline:'Reported offline',below_70_percent:'Production below 70% of expected',sustained_zero:'Sustained zero output'})[c.reason];
  if(c.kind === 'inverter') return `${c.name || c.deviceId || 'Inverter'}: ${reason || 'Monitoring needs review'}`;
  if(c.kind === 'production') return 'Site production below 70% of expected output.';
  if(c.kind === 'physical') return c.summary || 'Staff observed a physical fault.';
  return 'Scheduled monitoring readings are unavailable.';
};
export const vendorEvidenceCards = evidence => Array.isArray(evidence) && evidence.length ? `<section class="review-evidence"><h4>Manufacturer evidence</h4><p>Shared meanings below support review. They do not confirm a physical fault.</p>${evidence.map(v=>`<article class="fault-card"><div><h4>${e(v.label)} <small>${e(v.condition)}</small></h4><p>${e(v.meaning)}</p><p>${e(v.guidance)}</p><small>${e(v.source)} · Code ${e(v.code)}${v.namespace?` · ${e(v.namespace)}`:''} · ${v.state==='reported'?'Recent message; current state unknown':'Open at last observation'}</small><p>${e(v.providerMessage)}</p>${v.occurrences>1?`<small>${Number(v.occurrences)} manufacturer reports</small>`:''}<small>Reported ${e(date(v.startedAt))} · Observed ${e(date(v.observedAt))}</small>${v.deviceIds?.length?`<details><summary>Device references</summary>${v.deviceIds.map(id=>`<small>${e(id)}</small>`).join('')}</details>`:''}</div></article>`).join('')}</section>` : '';
const faultCard = c => {
  const performance = c.performance || {};
  const power = value => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()} W` : null;
  const guidance = c.kind === 'physical' ? 'Verify the repair before recording recovery.' : c.reason === 'provider_offline' ? 'Check inverter power and its provider connection.' : c.reason === 'below_70_percent' || c.kind === 'production' ? 'Check shading, weather and model settings alongside equipment.' : c.reason === 'sustained_zero' ? 'Check whether the inverter stopped producing during daylight.' : 'Restore valid readings before drawing a fault conclusion.';
  return `<article class="fault-card"><span class="fault-marker" aria-hidden="true">!</span><div><h4>${e(healthCause(c))}</h4><p>${guidance}</p>${power(performance.actualPowerW) && power(performance.expectedPowerW) ? `<p><strong>${e(power(performance.actualPowerW))}</strong> actual · ${e(power(performance.expectedPowerW))} expected</p>` : ''}${c.observedAt ? `<small>Observed ${e(date(c.observedAt))}</small>` : ''}${c.deviceId ? `<details><summary>Device reference</summary><small>${e(c.deviceId)}</small></details>` : ''}</div></article>`;
};
const date = (value) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
export function healthDuration(start, end = Date.now()) {
  const from = Date.parse(start), to = typeof end === "number" ? end : Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return "Not recorded";
  const minutes = Math.floor((to - from) / 60000);
  if (minutes < 1) return "Less than a minute";
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", !days && minutes % 60 ? `${minutes % 60}m` : ""].filter(Boolean).join(" ");
}
export function mountSiteHealth(root, call) {
  let alive = true,
    generation = 0,
    busy = false,
    offset = 0,
    next = null,
    rows = [],
    selected = null,
    connectedAccounts = null,
    reviewModels = null,
    site = null,
    incidents = [],
    incidentOffset = 0,
    incidentNext = null,
    returnFocus = null;
  const keys = new Map();
  root.innerHTML = `<div class="section-intro"><p>Sites that need your attention</p><a href="#site-model-comparison" data-show-models>Compare models <span aria-hidden="true">↗</span></a></div>
    <div class="review-cases health-view-switch" role="group" aria-label="Health view"><button type="button" data-health-view="queue" aria-pressed="true">Review queue</button><button type="button" data-health-view="log" aria-pressed="false">Error log</button></div>
    <div data-health-queue><form data-health-filter class="rates-toolbar"><div><label for="health-status">Status</label><select id="health-status"><option value="active">Open issues</option><option value="yellow">Needs review</option><option value="red">Confirmed faults</option><option value="resolved">Recovered</option><option value="dismissed">Dismissed</option></select></div><button>Refresh queue</button></form>
    <p data-health-message role="status" class="access-message"></p><div data-health-rows></div><div class="rates-pager"><button type="button" data-health-prev>Previous</button><span data-health-page></span><button type="button" data-health-next>Next</button></div>
    <details class="site-model-comparison" id="site-model-comparison"><summary>Digital Twin vs GCP <span>Compare a completed day</span></summary><div data-health-models></div></details></div><section data-vendor-error-log hidden></section>
    <dialog class="rate-dialog health-dialog" aria-labelledby="health-title"><div class="access-dialog-top"><div><span class="eyebrow">Health review</span><h3 id="health-title">Review site health</h3></div><button type="button" data-health-close aria-label="Close health review">Close</button></div><div data-health-site-link></div><div data-health-issues></div><div data-health-detail></div><div data-review-models></div><div data-health-accounts></div></dialog>`;
  const $ = (s) => root.querySelector(s),
    dialog = $("dialog");
  const errorLog = mountVendorErrorLog($('[data-vendor-error-log]'), call);
  function viewLog(show, search) {
    $('[data-health-queue]').hidden=show; $('[data-vendor-error-log]').hidden=!show;
    root.querySelectorAll('[data-health-view]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.healthView==='log')===show)));
    if(show)errorLog.show(search);
  }
  const reviewRoot = $('[data-review-models]');
  const models = mountHealthModels($('[data-health-models]'), call);
  const message = (text) => {
    if (alive) $("[data-health-message]").textContent = text;
  };
  function render(data) {
    rows = data.items;
    next = data.nextOffset;
    $("[data-health-rows]").innerHTML = rows.length
      ? `<div class="access-table-scroll" role="region" aria-label="Site health queue" tabindex="0"><table class="access-table"><thead><tr><th>Site</th><th>Status and issues</th><th>Open for</th><th>Latest evidence</th><th></th></tr></thead><tbody>${rows.map((r, index) => `<tr><td><strong>${e(r.systemName)}</strong>${providerSiteLink(r.systemId, r.systemName)}<small>${Number(r.issueCount)} issue${r.issueCount === 1 ? "" : "s"}</small></td><td><strong>${e(healthState(r.status))}</strong><small>${e((r.summaries || []).join(" · "))}</small></td><td>${["yellow", "red"].includes(r.status) ? `<strong data-health-duration="${e(r.firstObservedAt)}">${e(healthDuration(r.firstObservedAt))}</strong><small>Since ${e(date(r.firstObservedAt))}</small>` : "Closed · see issue history"}</td><td>${e(date(r.latestObservedAt))}</td><td><button type="button" data-health-open="${index}" aria-label="Review health for ${e(r.systemName)}">Review site</button><button type="button" data-site-error-log="${index}" aria-label="Error log for ${e(r.systemName)}">Error log</button></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="access-empty">No sites match this status.</div>';
    $("[data-health-page]").textContent = rows.length
      ? `${offset + 1}–${offset + rows.length} of ${data.total} sites`
      : "No sites";
    $("[data-health-prev]").disabled = offset === 0;
    $("[data-health-next]").disabled = next == null;
  }
  async function load() {
    const ticket = ++generation;
    message("Loading site health…");
    try {
      const r = await call("staff-site-access", {
        action: "health_sites",
        input: { status: $("#health-status").value, offset },
      });
      if (!alive || ticket !== generation) return;
      render(r.data);
      message("");
    } catch (err) {
      if (alive && ticket === generation) {
        rows = [];
        next = null;
        $("[data-health-rows]").replaceChildren();
        $("[data-health-page]").textContent = "";
        $("[data-health-next]").disabled = true;
        message(err.message);
      }
    }
  }
  async function open(row, button) {
    site = row;
    $("#health-title").textContent = row.systemName;
    reviewModels?.destroy();
    reviewModels = mountHealthModels(reviewRoot, call, {systemId:row.systemId});
    incidentOffset = 0;
    returnFocus = button;
    $("[data-health-site-link]").innerHTML = providerSiteLink(row.systemId, row.systemName);
    connectedAccounts?.destroy();
    connectedAccounts = mountConnectedAccounts($("[data-health-accounts]"), call, row.systemId, true);
    dialog.showModal();
    await loadIssues();
  }
  async function loadIssues() {
    const ticket = ++generation;
    selected = null;
    $("[data-health-detail]").replaceChildren();
    $("[data-health-issues]").innerHTML = '<p role="status">Loading site issues…</p>';
    try {
      const r = await call("staff-site-access", { action: "health_sites",
        input: { systemId: site.systemId, status: $("#health-status").value, offset: incidentOffset } });
      if (!alive || ticket !== generation || !dialog.open) return;
      incidents = r.data.items;
      incidentNext = r.data.nextOffset;
      $("[data-health-issues]").innerHTML = incidents.length
        ? `<div class="review-case-heading"><h4>Issues at this site</h4><span>${incidentOffset + 1}–${incidentOffset + incidents.length} of ${r.data.total}</span></div><div class="review-cases" role="group" aria-label="Choose an issue">${incidents.map((v,i)=>`<button type="button" data-health-issue="${i}" aria-pressed="${i===0}"><span>${e(v.summary)}</span><small>${e(healthState(v.status))} · ${v.scope === 'site' ? 'Shared site' : 'Account-specific'}</small></button>`).join('')}</div><div class="rates-pager" ${incidentOffset || incidentNext != null ? '' : 'hidden'}><button type="button" data-issue-prev ${incidentOffset ? '' : 'disabled'}>Previous issues</button><button type="button" data-issue-next ${incidentNext == null ? 'disabled' : ''}>Next issues</button></div>`
        : '<p>No issues remain in this view. Close and refresh the queue.</p>';
      if (incidents.length) await loadIncident(incidents[0]);
    } catch (err) {
      if (alive && ticket === generation) $("[data-health-issues]").innerHTML = `<p role="alert">${e(err.message)} Close this review and try again.</p>`;
    }
  }
  async function loadIncident(row) {
    const ticket = ++generation;
    selected = null;
    $("[data-health-detail]").innerHTML = '<p role="status">Loading evidence…</p>';
    try {
      const r = await call("staff-site-access", { action: "health", input: { id: row.id } });
      if (!alive || ticket !== generation || !dialog.open) return;
      selected = r.data;
      detail();
    } catch (err) {
      if (alive && ticket === generation) $("[data-health-detail]").innerHTML = `<p role="alert">${e(err.message)} Close this review and try again.</p>`;
    }
  }
  function detail() {
    reviewRoot.remove();
    const r = selected,
      pending = r.status === "pending",
      active = ["pending", "confirmed", "dispatched"].includes(r.status);
    $("[data-health-detail]").innerHTML =
      `<div class="review-evidence"><div class="review-evidence-heading"><h4>${r.causes.length} finding${r.causes.length===1?'':'s'}</h4><span class="review-status">${e(healthState(r.status))}</span></div>
      <div class="review-timing"><span>${active ? `Open for <strong data-health-duration="${e(r.firstObservedAt)}">${e(healthDuration(r.firstObservedAt))}</strong>` : `First recorded ${e(date(r.firstObservedAt))}`}</span><span>Latest evidence ${e(date(r.latestObservedAt))}</span></div>
      ${r.scope === 'account' ? `<div class="review-scope">Account-specific production warning. The model comparison below uses shared site settings.<details><summary>Account reference</summary>${e(r.accountId)}</details></div>` : ''}
      <div class="fault-list">${r.causes.map(faultCard).join('') || '<p>No fault details were recorded.</p>'}</div></div>${vendorEvidenceCards(r.providerEvidence)}<div data-review-model-slot></div>
      ${
        active
          ? `<form class="review-decision" data-health-review><h4>Record your decision</h4><label for="health-decision">Decision</label><select id="health-decision" name="decision">${pending ? '<option value="confirm">Confirm physical fault · red</option><option value="dismiss">Dismiss warning</option>' : ""}<option value="resolve">Record manual recovery</option></select>
      <label for="health-note">Review note</label><textarea id="health-note" name="note" minlength="10" maxlength="2000" required placeholder="Describe what you verified and the supporting evidence."></textarea>
      <div data-shared-field ${pending ? "" : "hidden"}><label for="health-shared">Summary for owners and technicians</label><textarea id="health-shared" name="sharedSummary" minlength="10" maxlength="500" ${pending ? "required" : ""} placeholder="Describe the physical fault without private model assumptions."></textarea><small>Confirm red only after verifying a physical fault. This updates the site in Moose and queues email to its connected owners and preferred technicians. Share factual evidence here; review notes and private model settings stay internal.</small></div>
      <p data-review-error role="alert" class="access-message"></p><button type="submit">Save review</button></form>`
          : ""
      }
      <details><summary>Review history</summary><ol>${(r.events || []).map((v) => `<li><strong>${e(v.kind)}</strong> · ${e(v.actorKind)}${v.actorId ? ` (${e(v.actorId)})` : ""} · ${e(date(v.at))}${v.note ? `<p>${e(v.note)}</p>` : ""}</li>`).join("")}</ol></details>`;

    $('[data-review-model-slot]').append(reviewRoot);
  }
  function close() {
    if (busy) return;
    ++generation;
    selected = null;
    reviewModels?.destroy(); reviewModels = null;
    site = null;
    incidents = [];
    connectedAccounts?.destroy();
    connectedAccounts = null;
    $("[data-health-site-link]").replaceChildren();
    dialog.close();
    $("[data-health-issues]").replaceChildren();
    $("[data-health-detail]").replaceChildren();
    returnFocus?.focus();
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !selected) return;
    const form = event.target;
    if (!form.reportValidity()) return;
    const input = {
      id: selected.id,
      revision: selected.revision,
      decision: form.elements.decision.value,
      note: form.elements.note.value.trim(),
      sharedSummary:
        form.elements.decision.value === "confirm"
          ? form.elements.sharedSummary.value.trim()
          : null,
    };
    const fingerprint = JSON.stringify(input);
    if (!keys.has(fingerprint)) keys.set(fingerprint, crypto.randomUUID());
    const ticket = generation;
    busy = true;
    [...dialog.querySelectorAll("input,select,textarea,button")].forEach((c) => (c.disabled = true));
    $("[data-review-error]").textContent = "Saving review…";
    try {
      await call("staff-site-access", {
        action: "review_health",
        input,
        idempotencyKey: keys.get(fingerprint),
      });
      if (!alive || ticket !== generation) return;
      busy = false;
      close();
      await load();
      message(input.decision === "confirm" ? "Red fault confirmed. Connected owners see the red site status; owner and preferred-technician notifications are queued for delivery." : "Review saved. Connected accounts see the updated status.");
    } catch (err) {
      if (alive && ticket === generation)
        $("[data-review-error]").textContent =
          err.code === "CONFLICT"
            ? "The incident changed while you were reviewing it. Your notes are retained. Close this dialog and refresh the queue before reviewing again."
            : `${err.message} Your notes are retained; retrying the same review is safe.`;
    } finally {
      busy = false;
      if (alive) {
        [...dialog.querySelectorAll("input,select,textarea,button")].forEach((c) => (c.disabled = false));
        const prev = $("[data-issue-prev]"), nextIssue = $("[data-issue-next]");
        if (prev) prev.disabled = incidentOffset === 0;
        if (nextIssue) nextIssue.disabled = incidentNext == null;
      }
    }
  }
  const click = (event) => {
    const b = event.target.closest("button");
    const showModels = event.target.closest('[data-show-models]');
    if(showModels){event.preventDefault();viewLog(false);$('#site-model-comparison').open=true;$('#site-model-comparison').scrollIntoView({behavior:'smooth',block:'start'});return;}
    if (!b || busy) return;
    if(b.hasAttribute('data-health-view')){viewLog(b.dataset.healthView==='log');return;}
    if(b.hasAttribute('data-site-error-log')){viewLog(true,rows[Number(b.dataset.siteErrorLog)].systemId);return;}
    if(b.hasAttribute('data-health-issue')) {
      root.querySelectorAll('[data-health-issue]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));
      void loadIncident(incidents[Number(b.dataset.healthIssue)]);return;
    }
    if (b.hasAttribute("data-health-open"))
      void open(rows[Number(b.dataset.healthOpen)], b);
    else if (b.hasAttribute("data-health-close")) close();
    else if (b.hasAttribute("data-issue-prev")) { incidentOffset = Math.max(0, incidentOffset - 50); void loadIssues(); }
    else if (b.hasAttribute("data-issue-next") && incidentNext != null) { incidentOffset = incidentNext; void loadIssues(); }
    else if (b.hasAttribute("data-health-prev")) {
      offset = Math.max(0, offset - 50);
      void load();
    } else if (b.hasAttribute("data-health-next") && next != null) {
      offset = next;
      void load();
    }
  };
  const submit = (event) => {
    if (event.target.matches("[data-health-review]")) void save(event);
    else if (event.target.matches("[data-health-filter]")) {
      event.preventDefault();
      if (!busy) {
        offset = 0;
        void load();
      }
    }
  };
  const change = (event) => {
    if (busy) return;
    if (event.target.id === "health-issue") void loadIncident(incidents[Number(event.target.value)]);
    if (event.target.id === "health-decision") {
      const visible =
        event.target.value === "confirm";
      $("[data-shared-field]").hidden = !visible;
      $("#health-shared").required = visible;
    }
  };
  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  root.addEventListener("change", change);
  dialog.oncancel = (e) => {
    e.preventDefault();
    close();
  };
  const timer = setInterval(() => {
    if (!alive || document.hidden) return;
    root.querySelectorAll("[data-health-duration]").forEach(el => { el.textContent = healthDuration(el.dataset.healthDuration); });
  }, 60000);
  void load();
  return {
    canLeave: () => !busy,
    destroy() {
      alive = false;
      clearInterval(timer);
      ++generation;
      keys.clear();
      models.destroy();
      errorLog.destroy();
      reviewModels?.destroy();
      connectedAccounts?.destroy();
      dialog.close();
      root.removeEventListener("click", click);
      root.removeEventListener("submit", submit);
      root.removeEventListener("change", change);
      root.replaceChildren();
    },
  };
}
