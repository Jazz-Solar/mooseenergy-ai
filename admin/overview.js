import { escapeHtml as e } from './site-access.js?v=20261105-1';
const count = value => Number.isFinite(value) ? value.toLocaleString() : '—';
const dayLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
export function chartGeometry(days, key) {
  const max=Math.max(1,...days.map(d=>d[key])), width=600, height=160;
  const points=days.map((day,i)=>[20+i*560/Math.max(1,days.length-1),150-day[key]/max*130]);
  return {max,width,height,points,line:points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')};
}
function chart(days,key,label) {
  if(!days?.length)return `<article class="growth-card"><h3>${label} growth</h3><p class="access-empty">Registration history is unavailable. Refresh after the statistics service is updated.</p></article>`;
  const {points,line,max}=chartGeometry(days,key),last=days.at(-1),first=days[0],gain=last[key]-first[key];
  return `<article class="growth-card" data-growth="${key}"><div class="growth-heading"><h3>${label}</h3><span>+${count(gain)} since ${e(dayLabel(first.date))}</span></div>
    <svg viewBox="0 0 600 170" role="img" aria-label="${label} grew from ${first[key]} to ${last[key]} between ${first.date} and ${last.date}. Explore dates below."><defs><linearGradient id="fill-${key}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${[20,85,150].map(y=>`<path d="M20 ${y}H580" class="growth-grid"/>`).join('')}<path d="${line} L580,150 L20,150 Z" fill="url(#fill-${key})"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle data-growth-dot cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="4" fill="currentColor"/>
    </svg><div class="growth-axis"><span>${e(dayLabel(first.date))}</span><span>0–${count(max)}</span><span>${e(dayLabel(last.date))}</span></div>
    <label class="sr-only" for="growth-${key}">Explore ${label.toLowerCase()} by date</label><input id="growth-${key}" type="range" min="0" max="${days.length-1}" value="${days.length-1}" data-growth-range><output for="growth-${key}" data-growth-reading>${e(dayLabel(last.date))} · ${count(last[key])} ${label.toLowerCase()}</output></article>`;
}
export function mountOverview(root,data) {
  let period=30,days=[];
  function render(){
    days=data.growth?.days?.slice(-period)||[];
    root.innerHTML=`<div class="overview-intro"><p>Your workspace at a glance</p><span>Updated ${e(new Date(data.generated_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))}</span></div>
      <div class="overview-totals"><article><span>Total users</span><strong>${count(data.totals.users)}</strong><small>Registered accounts</small></article><article><span>Total systems</span><strong>${data.growth?count(data.totals.systems):'—'}</strong><small>${data.growth?`${count(data.totals.connectedSystems)} connected to users`:'System totals await the updated statistics service'}</small></article></div>
      <div class="growth-toolbar"><h2>Growth</h2><div class="period-switch" role="group" aria-label="Growth period">${[30,90].map(n=>`<button type="button" data-period="${n}" aria-pressed="${period===n}">${n} days</button>`).join('')}</div></div>
      <div class="growth-charts">${chart(days,'users','Users')}${chart(days,'systems','Systems')}</div>
      <p class="growth-note">Current records by registration date · UTC. Deleted records are excluded.</p>
      <div class="overview-shortcuts"><a href="#sites/health"><span>Site health</span><strong>Review faults <span aria-hidden="true">↗</span></strong></a><a href="#people/reviews"><span>Access requests</span><strong>Review connections <span aria-hidden="true">↗</span></strong></a></div>
      ${days.length?`<details class="growth-data"><summary>View chart data</summary><div class="access-table-scroll"><table class="access-table"><thead><tr><th>Date (UTC)</th><th>Users</th><th>Systems</th></tr></thead><tbody>${days.map(d=>`<tr><th scope="row">${e(d.date)}</th><td>${count(d.users)}</td><td>${count(d.systems)}</td></tr>`).join('')}</tbody></table></div></details>`:''}`;
  }
  const click=event=>{const b=event.target.closest('[data-period]');if(b){period=Number(b.dataset.period);render();root.querySelector(`[data-period="${period}"]`).focus();}};
  const input=event=>{if(!event.target.matches('[data-growth-range]'))return;const card=event.target.closest('[data-growth]'),key=card.dataset.growth,index=Number(event.target.value),day=days[index],point=chartGeometry(days,key).points[index];card.querySelector('[data-growth-dot]').setAttribute('cx',point[0]);card.querySelector('[data-growth-dot]').setAttribute('cy',point[1]);card.querySelector('output').textContent=`${dayLabel(day.date)} · ${count(day[key])} ${key}`;};
  root.addEventListener('click',click);root.addEventListener('input',input);render();
  return {destroy(){root.removeEventListener('click',click);root.removeEventListener('input',input);root.replaceChildren();}};
}
