import { escapeHtml as e } from "./site-access.js?v=20260914-fit-rates-1";
export const healthState = (status) =>
  ({
    yellow: "Yellow · needs review",
    red: "Red · confirmed",
    pending: "Yellow · needs review",
    confirmed: "Red · confirmed",
    dispatched: "Red · confirmed",
    resolved: "Recovered",
    dismissed: "Dismissed",
  })[status] || "Unavailable";
export const healthCause = (c) =>
  c.kind === "inverter"
    ? `${c.name || c.deviceId}: ${c.reason === "provider_offline" ? "reported offline" : c.reason === "below_70_percent" ? "production below 70% of expected output" : "sustained zero output"}`
    : c.kind === "production"
      ? "Production below 70% of expected output for this account."
      : c.kind === "physical"
        ? c.summary || "Staff observed a physical fault."
        : "Scheduled monitoring readings are unavailable.";
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
    site = null,
    incidents = [],
    incidentOffset = 0,
    incidentNext = null,
    returnFocus = null;
  const keys = new Map();
  root.innerHTML = `<h2>Site health</h2><p>One entry per site. Open a site to review its issues, confirm a physical fault or record recovery. Duration starts with the earliest recorded open issue.</p>
    <form data-health-filter class="rates-toolbar"><div><label for="health-status">Status</label><select id="health-status"><option value="active">All active sites</option><option value="yellow">Yellow · needs review</option><option value="red">Red · confirmed</option><option value="resolved">Recovered</option><option value="dismissed">Dismissed</option></select></div><button>Refresh queue</button></form>
    <p data-health-message role="status" class="access-message"></p><div data-health-rows></div><div class="rates-pager"><button type="button" data-health-prev>Previous</button><span data-health-page></span><button type="button" data-health-next>Next</button></div>
    <dialog class="rate-dialog health-dialog" aria-labelledby="health-title"><div class="access-dialog-top"><h3 id="health-title">Review site health</h3><button type="button" data-health-close aria-label="Close health review">Close</button></div><div data-health-issues></div><div data-health-detail></div></dialog>`;
  const $ = (s) => root.querySelector(s),
    dialog = $("dialog");
  const message = (text) => {
    if (alive) $("[data-health-message]").textContent = text;
  };
  function render(data) {
    rows = data.items;
    next = data.nextOffset;
    $("[data-health-rows]").innerHTML = rows.length
      ? `<div class="access-table-scroll" role="region" aria-label="Site health queue" tabindex="0"><table class="access-table"><thead><tr><th>Site</th><th>Status and issues</th><th>Open for</th><th>Latest evidence</th><th></th></tr></thead><tbody>${rows.map((r, index) => `<tr><td><strong>${e(r.systemName)}</strong><small>${Number(r.issueCount)} issue${r.issueCount === 1 ? "" : "s"} · ${Number(r.sharedCount)} shared · ${Number(r.privateCount)} account</small></td><td><strong>${e(healthState(r.status))}</strong><small>${e((r.summaries || []).join(" · "))}</small></td><td>${["yellow", "red"].includes(r.status) ? `<strong data-health-duration="${e(r.firstObservedAt)}">${e(healthDuration(r.firstObservedAt))}</strong><small>Since ${e(date(r.firstObservedAt))}</small>` : "Closed · see issue history"}</td><td>${e(date(r.latestObservedAt))}</td><td><button type="button" data-health-open="${index}" aria-label="Review health for ${e(r.systemName)}">Review site</button></td></tr>`).join("")}</tbody></table></div>`
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
    incidentOffset = 0;
    returnFocus = button;
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
        ? `<label for="health-issue">Issue to review</label><select id="health-issue">${incidents.map((v, i) => `<option value="${i}">${e(v.summary)} · ${v.scope === "site" ? "Shared site evidence" : `Account ${e(v.accountId)}`} · ${e(healthState(v.status))}</option>`).join("")}</select><p>${incidentOffset + 1}–${incidentOffset + incidents.length} of ${r.data.total} issues</p><div class="rates-pager"><button type="button" data-issue-prev ${incidentOffset ? "" : "disabled"}>Previous issues</button><button type="button" data-issue-next ${incidentNext == null ? "disabled" : ""}>Next issues</button></div>`
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
    const r = selected,
      pending = r.status === "pending",
      active = ["pending", "confirmed", "dispatched"].includes(r.status);
    $("[data-health-detail]").innerHTML =
      `<p><strong>${e(r.systemName)}</strong> · ${e(healthState(r.status))}</p><p>${r.scope === "account" ? "Private account warning. This review does not expose account settings or grant site access." : "This issue applies to connected accounts for this site."}</p>
      ${r.scope === "account" ? `<p><small>Account reference<br>${e(r.accountId)}</small></p>` : ""}
      <p>${active ? `Open for <strong data-health-duration="${e(r.firstObservedAt)}">${e(healthDuration(r.firstObservedAt))}</strong> · since ${e(date(r.firstObservedAt))}` : `First recorded: ${e(date(r.firstObservedAt))}${r.resolvedAt ? ` · Recovered: ${e(date(r.resolvedAt))}` : ""}`}</p><ul>${r.causes.map((c) => `<li>${e(healthCause(c))}</li>`).join("")}</ul><p>Latest evidence: ${e(date(r.latestObservedAt))}</p>
      ${
        active
          ? `<form data-health-review><label for="health-decision">Decision</label><select id="health-decision" name="decision">${pending ? '<option value="confirm">Confirm physical fault · red</option><option value="dismiss">Dismiss warning</option>' : ""}<option value="resolve">Record manual recovery</option></select>
      <label for="health-note">Review note</label><textarea id="health-note" name="note" minlength="10" maxlength="2000" required placeholder="Describe what you verified and the supporting evidence."></textarea>
      <div data-shared-field ${pending ? "" : "hidden"}><label for="health-shared">Evidence summary to email owners and preferred technicians</label><textarea id="health-shared" name="sharedSummary" minlength="10" maxlength="500" ${pending ? "required" : ""} placeholder="Describe the physical fault without private model assumptions."></textarea><small>Confirm red only after verifying a physical fault. This updates the site in Moose and queues email to its connected owners and preferred technicians. Share factual evidence here; review notes and private model settings stay internal.</small></div>
      <p data-review-error role="alert" class="access-message"></p><button type="submit">Save review</button></form>`
          : ""
      }
      <details><summary>Recorded review history</summary><ol>${(r.events || []).map((v) => `<li><strong>${e(v.kind)}</strong> · ${e(v.actorKind)}${v.actorId ? ` (${e(v.actorId)})` : ""} · ${e(date(v.at))}${v.note ? `<p>${e(v.note)}</p>` : ""}</li>`).join("")}</ol></details>`;
    const form = $("[data-health-review]");
    if (form) form.elements.note.focus();
  }
  function close() {
    if (busy) return;
    ++generation;
    selected = null;
    site = null;
    incidents = [];
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
    if (!b || busy) return;
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
      dialog.close();
      root.removeEventListener("click", click);
      root.removeEventListener("submit", submit);
      root.removeEventListener("change", change);
      root.replaceChildren();
    },
  };
}
