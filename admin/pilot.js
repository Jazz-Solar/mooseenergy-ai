export const priorities = {1:'Recent reporting',2:'Older reporting',3:'Shared mailbox',4:'Identity to confirm',5:'Referral or partner'};
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const collator = new Intl.Collator('en', {numeric:true,sensitivity:'base'});
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const reviewState = c => c.decision || (c.status === 'hold' ? 'Held' : 'Pending');
const https = value => {try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const siteLink = s => https(s.url) ? `<a href="${e(https(s.url))}" target="_blank" rel="noopener noreferrer">${e(s.name)} <span aria-hidden="true">↗</span></a>` : e(s.name);
export function selectContacts(contacts, {query='',priority='',provider='',review='',sort='priority',direction='asc'}={}) {
  const terms=normalized(query).trim().split(/\s+/).filter(Boolean);
  const selected=contacts.filter(c=>(!priority||c.priority===Number(priority))&&(!provider||c.providers.includes(provider))&&(!review||reviewState(c)===review)&&terms.every(t=>normalized([c.id,c.name,c.email,c.phone,c.contactType,...c.providers,...c.sites.map(s=>s.name)].join(' ')).includes(t)));
  const value = c => ({priority:c.priority,contact:c.name||c.email,provider:c.providers.join(', '),sites:c.sites.length,review:reviewState(c)})[sort];
  return selected.sort((a,b)=>{
    const x=value(a),y=value(b),comparison=typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y));
    return comparison*(direction==='desc'?-1:1)||collator.compare(a.id,b.id);
  });
}
const priorityBadge = c => `<span class="pilot-priority p${c.priority}">P${c.priority}</span><small>${e(priorities[c.priority])}</small>`;
const reviewBadge = c => `<span class="pilot-review ${c.status==='hold'&&!c.decision?'held':''}">${e(reviewState(c))}</span>`;
export function mountPilot(root,call) {
  let alive=true,loaded=false,loading=false,generation=0,contacts=[],sourceDate='',offset=0,sort='priority',direction='asc',returnFocus=null;
  const pageSize=25;
  root.innerHTML=`<div class="section-intro"><p>Find your next pilot conversation</p><span data-pilot-source></span></div>
    <form class="pilot-toolbar" aria-label="Filter pilot contacts"><div class="pilot-search"><label for="pilot-search">Search</label><input id="pilot-search" type="search" placeholder="Name, email or site" autocomplete="off"></div>
    <div><label for="pilot-priority">Priority</label><select id="pilot-priority"><option value="">All priorities</option>${Object.entries(priorities).map(([n,label])=>`<option value="${n}">P${n} · ${label}</option>`).join('')}</select></div>
    <div><label for="pilot-provider">Provider</label><select id="pilot-provider"><option value="">All providers</option><option>Fronius</option><option>Enphase</option></select></div>
    <div><label for="pilot-review">Review</label><select id="pilot-review"><option value="">All contacts</option>${['Pending','Held','Yes','No','Maybe'].map(v=>`<option>${v}</option>`).join('')}</select></div><button type="button" data-pilot-reset>Clear filters</button></form>
    <div class="pilot-summary"><p data-pilot-count role="status"></p><details><summary>Priority guide</summary><ol>${Object.values(priorities).map(label=>`<li>${e(label)}</li>`).join('')}</ol><p>Priorities from the contact review. P1 is the first group to consider.</p></details></div>
    <p data-pilot-message role="status"></p><div data-pilot-results></div><div class="rates-pager" data-pilot-pager hidden><button type="button" data-pilot-prev>Previous</button><span data-pilot-page></span><button type="button" data-pilot-next>Next</button></div>
    <dialog class="rate-dialog pilot-dialog" aria-labelledby="pilot-detail-title"><div class="access-dialog-top"><div><span class="eyebrow" data-pilot-id></span><h3 id="pilot-detail-title"></h3></div><button type="button" data-pilot-close aria-label="Close contact details">Close</button></div><div data-pilot-detail></div></dialog>`;
  const $=s=>root.querySelector(s),dialog=$('dialog');
  const filters=()=>({query:$('#pilot-search').value,priority:$('#pilot-priority').value,provider:$('#pilot-provider').value,review:$('#pilot-review').value,sort,direction});
  function render() {
    const rows=selectContacts(contacts,filters()),page=rows.slice(offset,offset+pageSize);
    $('[data-pilot-count]').textContent=`${rows.length} of ${contacts.length} contacts`;
    $('[data-pilot-source]').textContent=`Contact review · ${sourceDate}`;
    $('[data-pilot-results]').innerHTML=rows.length?`<div class="access-table-scroll" role="region" aria-label="Pilot contacts table" tabindex="0"><table class="access-table pilot-table"><caption class="sr-only">Pilot contacts. Select a column heading to sort.</caption><thead><tr>${[['priority','Priority'],['contact','Contact'],['provider','Provider'],['sites','Sites'],['review','Review']].map(([key,label])=>`<th scope="col" aria-sort="${sort===key?(direction==='asc'?'ascending':'descending'):'none'}"><button type="button" data-pilot-sort="${key}">${label}<span aria-hidden="true">${sort===key?(direction==='asc'?'↑':'↓'):'↕'}</span></button></th>`).join('')}<th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody>${page.map(c=>`<tr data-pilot-contact="${e(c.id)}"><td>${priorityBadge(c)}</td><td><strong>${e(c.name||'Name not confirmed')}</strong><small>${e(c.id)} · ${e(c.contactType)}</small><a class="pilot-email" href="mailto:${e(encodeURIComponent(c.email))}">${e(c.email)}</a><small>${e(c.phone||'Phone not recorded')}</small></td><td><span class="pilot-provider">${c.providers.map(e).join(' + ')}</span></td><td><strong>${c.sites.length} site${c.sites.length===1?'':'s'}</strong><small>${e(c.sites[0]?.name||'No sites recorded')}${c.sites.length>1?` · +${c.sites.length-1} more`:''}</small></td><td>${reviewBadge(c)}${c.status==='hold'?'<small>Owner decision needed</small>':''}</td><td><button type="button" data-pilot-open="${e(c.id)}" aria-label="View ${e(c.name||c.email)}">View <span aria-hidden="true">↗</span></button></td></tr>`).join('')}</tbody></table></div>`:'<div class="pilot-empty"><strong>No contacts match</strong><p>Try a different search or clear the filters.</p></div>';
    $('[data-pilot-pager]').hidden=!rows.length;
    $('[data-pilot-prev]').disabled=offset===0;$('[data-pilot-next]').disabled=offset+pageSize>=rows.length;
    $('[data-pilot-page]').textContent=`${offset+1}–${Math.min(offset+pageSize,rows.length)} of ${rows.length}`;
  }
  async function load() {
    if(!alive||loaded||loading)return;
    loading=true;const ticket=++generation;$('[data-pilot-message]').textContent='Loading contacts…';
    try {
      const data=await call('admin-stats',{view:'pilot'});
      if(!alive||ticket!==generation)return;
      if(!data.ok||!Array.isArray(data.contacts)||!data.contacts.length)throw Error('Pilot contacts are unavailable.');
      contacts=data.contacts;sourceDate=data.sourceDate;loaded=true;$('[data-pilot-message]').textContent='';render();
    } catch(error) {if(alive&&ticket===generation){$('[data-pilot-message]').innerHTML=`${e(error.message)} <button type="button" data-pilot-retry>Try again</button>`;}}
    finally{loading=false;}
  }
  function open(c,button) {
    returnFocus=button;$('[data-pilot-id]').textContent=c.id;$('#pilot-detail-title').textContent=c.name||'Name not confirmed';
    $('[data-pilot-detail]').innerHTML=`<div class="pilot-detail-meta">${priorityBadge(c)}<span>${c.providers.map(e).join(' + ')}</span>${reviewBadge(c)}</div>
      <div class="pilot-detail-contact"><a href="mailto:${e(encodeURIComponent(c.email))}">${e(c.email)}</a><p>${e(c.phone||'Phone not recorded')}${c.phoneType?` <small>· ${e(c.phoneType)}</small>`:''}</p><p>${e(c.contactType)}</p></div>
      ${c.reviewNotes||c.status==='hold'?`<aside class="pilot-note"><strong>${c.status==='hold'?'Held for your decision':'Review note'}</strong><p>${e(c.reviewNotes||c.assessment)}</p>${!c.decision?'<small>No final decision recorded.</small>':''}</aside>`:''}
      <h4>${c.sites.length} associated site${c.sites.length===1?'':'s'}</h4><ul class="pilot-sites">${c.sites.map(s=>`<li>${siteLink(s)}<small>${e(s.provider)}</small></li>`).join('')}</ul>
      <details class="pilot-evidence"><summary>Contact details and sources</summary><p>${e(c.quality)}</p><p>${e(c.notes)}</p>${c.feedbackSource?`<p>${e(c.feedbackSource)} · ${e(c.feedbackDate)}</p>`:''}<ul>${c.sources.map(url=>https(url)?`<li><a href="${e(https(url))}" target="_blank" rel="noopener noreferrer">${e(new URL(url).hostname)} <span aria-hidden="true">↗</span></a></li>`:'').join('')}</ul></details><p class="pilot-footnote">Outreach shortlist only. A review decision does not record consent or enroll any sites.</p>`;
    dialog.showModal();
  }
  function close(){dialog.close();$('[data-pilot-detail]').replaceChildren();returnFocus?.focus();returnFocus=null;}
  const filter=()=>{offset=0;if(loaded)render();};
  const input=event=>{if(event.target.id==='pilot-search')filter();};
  const change=event=>{if(event.target.matches('.pilot-toolbar select'))filter();};
  const submit=event=>event.preventDefault();
  const click=event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-pilot-close'))return close();
    if(b.hasAttribute('data-pilot-open')){const c=contacts.find(c=>c.id===b.dataset.pilotOpen);if(c)open(c,b);return;}
    if(b.hasAttribute('data-pilot-retry'))return void load();
    if(b.hasAttribute('data-pilot-reset')){$('.pilot-toolbar').reset();filter();return;}
    if(b.hasAttribute('data-pilot-sort')){const key=b.dataset.pilotSort;direction=sort===key&&direction==='asc'?'desc':'asc';sort=key;offset=0;render();$(`[data-pilot-sort="${key}"]`).focus();return;}
    if(b.hasAttribute('data-pilot-prev'))offset=Math.max(0,offset-pageSize);
    else if(b.hasAttribute('data-pilot-next'))offset+=pageSize;
    else return;
    render();$(`[data-pilot-${b.hasAttribute('data-pilot-prev')?'prev':'next'}]`).focus();
  };
  const cancel=event=>{event.preventDefault();close();};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);dialog.addEventListener('cancel',cancel);
  return {show:load,destroy(){alive=false;++generation;contacts=[];if(dialog.open)dialog.close();returnFocus=null;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);dialog.removeEventListener('cancel',cancel);root.replaceChildren();}};
}
