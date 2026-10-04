import { escapeHtml as e } from "./site-access.js?v=20260914-fit-rates-1";
export const healthState = (status) =>
  ({
    pending: "Yellow · needs review",
    confirmed: "Red · confirmed",
    dispatched: "Red · confirmed",
    resolved: "Recovered",
    dismissed: "Dismissed",
  })[status] || "Unavailable";
export const healthCause = (c) =>
  c.kind === "inverter"
    ? `${c.name || c.deviceId}: ${c.reason === "provider_offline" ? "reported offline" : "sustained zero output"}`
    : c.kind === "production"
      ? "Production below 70% of expected output for this account."
      : c.kind === "physical"
        ? c.summary || "Staff observed a physical fault."
        : "Scheduled monitoring readings are unavailable.";
const date = (value) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
export function mountSiteHealth(root, call) {
  let alive = true,
    generation = 0,
    busy = false,
    offset = 0,
    next = null,
    rows = [],
    selected = null,
    returnFocus = null;
  const keys = new Map();
  root.innerHTML = `<h2>Site health</h2><p>Review system warnings, confirm physical faults and record recovery.</p>
    <form data-health-filter class="rates-toolbar"><div><label for="health-status">Status</label><select id="health-status"><option value="yellow">Yellow · needs review</option><option value="red">Red · confirmed</option><option value="resolved">Recovered</option><option value="dismissed">Dismissed</option></select></div><button>Refresh queue</button></form>
    <p data-health-message role="status" class="access-message"></p><div data-health-rows></div><div class="rates-pager"><button type="button" data-health-prev>Previous</button><span data-health-page></span><button type="button" data-health-next>Next</button></div>
    <dialog class="rate-dialog health-dialog" aria-labelledby="health-title"><div class="access-dialog-top"><h3 id="health-title">Review site health</h3><button type="button" data-health-close aria-label="Close health review">Close</button></div><div data-health-detail></div></dialog>`;
  const $ = (s) => root.querySelector(s),
    dialog = $("dialog");
  const message = (text) => {
    if (alive) $("[data-health-message]").textContent = text;
  };
  function render(data) {
    rows = data.items;
    next = data.nextOffset;
    $("[data-health-rows]").innerHTML = rows.length
      ? `<div class="access-table-scroll" role="region" aria-label="Site health queue" tabindex="0"><table class="access-table"><thead><tr><th>Site and scope</th><th>Issue</th><th>Detected / latest evidence</th><th>Technician contact</th><th></th></tr></thead><tbody>${rows.map((r, index) => `<tr><td><strong>${e(r.systemName)}</strong><small>${r.scope === "account" ? "Private account production" : "Shared site evidence"}</small></td><td>${e(r.summary)}<small>${e(healthState(r.status))} · ${Number(r.affectedInverters || 0)} affected inverters</small></td><td>${e(date(r.firstObservedAt))}<small>${e(date(r.latestObservedAt))}</small></td><td>${Number(r.contact?.sent || 0)} sent · ${Number(r.contact?.queued || 0)} queued${r.contact?.attention ? ` · ${Number(r.contact.attention)} need attention` : ""}</td><td><button type="button" data-health-open="${index}" aria-label="Review health for ${e(r.systemName)}">Review</button></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="access-empty">No sites match this status.</div>';
    $("[data-health-page]").textContent = rows.length
      ? `${offset + 1}–${offset + rows.length} of ${data.total}`
      : "No incidents";
    $("[data-health-prev]").disabled = offset === 0;
    $("[data-health-next]").disabled = next == null;
  }
  async function load() {
    const ticket = ++generation;
    message("Loading site health…");
    try {
      const r = await call("staff-site-access", {
        action: "health",
        input: { status: $("#health-status").value, offset },
      });
      if (!alive || ticket !== generation) return;
      render(r.data);
      message("");
    } catch (err) {
      if (alive && ticket === generation) {
        rows = [];
        $("[data-health-rows]").replaceChildren();
        message(err.message);
      }
    }
  }
  async function open(row, button) {
    const ticket = ++generation;
    selected = null;
    returnFocus = button;
    $("[data-health-detail]").innerHTML =
      '<p role="status">Loading evidence…</p>';
    dialog.showModal();
    try {
      const r = await call("staff-site-access", {
        action: "health",
        input: { id: row.id },
      });
      if (!alive || ticket !== generation || !dialog.open) return;
      selected = r.data;
      detail();
    } catch (err) {
      if (alive && ticket === generation)
        $("[data-health-detail]").innerHTML =
          `<p role="alert">${e(err.message)} Close this review and try again.</p>`;
    }
  }
  function detail() {
    const r = selected,
      pending = r.status === "pending",
      active = ["pending", "confirmed", "dispatched"].includes(r.status);
    $("[data-health-detail]").innerHTML =
      `<p><strong>${e(r.systemName)}</strong> · ${e(healthState(r.status))}</p><p>${r.scope === "account" ? "Private account warning. This review does not expose account settings or grant site access." : "This issue applies to connected accounts for this site."}</p>
      ${r.scope === "account" ? `<p><small>Account reference<br>${e(r.accountId)}</small></p>` : ""}
      <ul>${r.causes.map((c) => `<li>${e(healthCause(c))}</li>`).join("")}</ul><p>Latest evidence: ${e(date(r.latestObservedAt))}</p>
      ${
        active
          ? `<form data-health-review><label for="health-decision">Decision</label><select id="health-decision" name="decision">${pending ? '<option value="confirm">Confirm physical fault · red</option><option value="dismiss">Dismiss warning</option>' : ""}<option value="resolve">Record manual recovery</option></select>
      <label for="health-note">Review note</label><textarea id="health-note" name="note" minlength="10" maxlength="2000" required placeholder="Describe what you verified and the supporting evidence."></textarea>
      <div data-shared-field ${r.scope === "account" ? "" : "hidden"}><label for="health-shared">Factual summary to share with site owners</label><textarea id="health-shared" name="sharedSummary" minlength="10" maxlength="500" ${r.scope === "account" ? "required" : ""} placeholder="Describe the physical fault without private model assumptions."></textarea><small>Confirming a private production warning creates or joins a shared physical fault. Its original production warning stays private.</small></div>
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
    dialog.close();
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
        selected.scope === "account" &&
        form.elements.decision.value === "confirm"
          ? form.elements.sharedSummary.value.trim()
          : null,
    };
    const fingerprint = JSON.stringify(input);
    if (!keys.has(fingerprint)) keys.set(fingerprint, crypto.randomUUID());
    const ticket = generation;
    busy = true;
    [...form.elements].forEach((c) => (c.disabled = true));
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
      message("Review saved. Connected accounts see the updated status.");
    } catch (err) {
      if (alive && ticket === generation)
        $("[data-review-error]").textContent =
          err.code === "CONFLICT"
            ? "The incident changed while you were reviewing it. Your notes are retained. Close this dialog and refresh the queue before reviewing again."
            : `${err.message} Your notes are retained; retrying the same review is safe.`;
    } finally {
      busy = false;
      if (alive && ticket === generation)
        [...form.elements].forEach((c) => (c.disabled = false));
    }
  }
  const click = (event) => {
    const b = event.target.closest("button");
    if (!b || busy) return;
    if (b.hasAttribute("data-health-open"))
      void open(rows[Number(b.dataset.healthOpen)], b);
    else if (b.hasAttribute("data-health-close")) close();
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
    if (event.target.id === "health-decision") {
      const visible =
        selected?.scope === "account" && event.target.value === "confirm";
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
  void load();
  return {
    canLeave: () => !busy,
    destroy() {
      alive = false;
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
