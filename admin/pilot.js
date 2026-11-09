export const priorities = {1:'Highest',2:'High',3:'Medium',4:'Low',5:'Lowest'};
const sourcePriorities = {1:'Recent reporting',2:'Older reporting',3:'Shared mailbox',4:'Identity to confirm',5:'Referral or partner'};
export const stages = {not_contacted:'To contact',contacted:'Contacted',interested:'Interested',follow_up:'Follow up',invited:'Invited',on_hold:'On hold',not_interested:'Not interested',account_created:'Account created',check_account:'Check account'};
const editableStages=Object.entries(stages).filter(([id])=>!['account_created','check_account'].includes(id));
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const collator = new Intl.Collator('en', {numeric:true,sensitivity:'base'});
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const reviewState = c => stages[c.outreachStatus] || (c.status==='hold'?'On hold':'Not contacted');
const assigneeName=(c,assignees)=>assignees.find(a=>a.id===c.tracking?.assigneeId)?.name||'Unassigned';
const https = value => {try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const siteLink = s => https(s.url) ? `<a href="${e(https(s.url))}" target="_blank" rel="noopener noreferrer">${e(s.name)} <span aria-hidden="true">↗</span></a>` : e(s.name);

// The composer is user-controlled: opening it never sends or changes tracking.
export function pilotEmailDraft(contact) {
  const stage=contact.tracking?.stage||contact.outreachStatus;
  if(stage==='on_hold'||contact.outreachStatus==='on_hold')return {reason:'On hold. Review the outreach status before emailing.'};
  if(stage==='not_interested'||contact.outreachStatus==='not_interested')return {reason:'Marked not interested. Review the outreach status before emailing.'};
  const email=String(contact.email||'').trim();
  if(email.length>254||!/^\S+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(email)||/[\r\n,;<>]/.test(email)||email.split('@').length!==2)return {reason:'A valid contact email is needed.'};
  const name=String(contact.name||'').trim();
  const greeting=name&&name.length<=100&&!/[<>\r\n]/.test(name)?`Hi ${name},`:'Hi,';
  const existing=contact.account?.state==='created';
  const subject=existing?'Getting started with your solar systems in Moose':'Moose for your solar system';
  const body=[greeting,'',existing
    ?'We would like to help you get more from your Moose account and connect any solar systems you would like to monitor.'
    :'We are inviting solar owners to use Moose to see production and system information in one place.',
    '', 'Would you like Glani to help you connect your system? If so, please let us know whether you use iPhone or Android and whether you or your installer manages the solar portal.',
    '', 'Reply here and we will introduce you to Glani for the next steps.', '', 'Thanks,'].join('\n');
  const gmail=new URL('https://mail.google.com/mail/');
  gmail.search=new URLSearchParams({view:'cm',fs:'1',to:email,su:subject,body}).toString();
  const mailto=`mailto:${encodeURIComponent(email)}?${new URLSearchParams({subject,body}).toString().replace(/\+/g,'%20')}`;
  return {email,subject,body,gmail:gmail.href,mailto};
}

function draftAction(contact,alternative=false) {
  const draft=pilotEmailDraft(contact);
  if(draft.reason)return `<div class="pilot-draft-unavailable"><button type="button" disabled aria-label="Draft email unavailable for ${e(contact.name||contact.email)}">Draft email</button><small>${e(draft.reason)}</small></div>`;
  return `<div class="pilot-draft-actions"><a class="pilot-draft" data-pilot-draft="${e(contact.id)}" href="${e(draft.gmail)}" target="_blank" rel="noopener noreferrer" aria-label="Draft email to ${e(contact.name||contact.email)} in Gmail">Draft email <span aria-hidden="true">↗</span></a>${alternative?`<a class="pilot-draft-alternative" href="${e(draft.mailto)}">Use email app</a>`:''}</div>`;
}
export function selectContacts(contacts, {query='',priority='',provider='',review='',assignee='',sort='priority',direction='asc',assignees=[]}={}) {
  const terms=normalized(query).trim().split(/\s+/).filter(Boolean);
  const selected=contacts.filter(c=>(!priority||c.priority===Number(priority))&&(!provider||c.providers.includes(provider))&&(!review||c.outreachStatus===review)&&(!assignee||(assignee==='unassigned'?!c.tracking?.assigneeId:c.tracking?.assigneeId===assignee))&&terms.every(t=>normalized([c.id,c.name,c.email,c.phone,c.contactType,...c.providers,...c.sites.map(s=>s.name)].join(' ')).includes(t)));
  const value = c => ({priority:c.priority,contact:c.name||c.email,provider:c.providers.join(', '),sites:c.sites.length,review:reviewState(c),assignee:assigneeName(c,assignees)})[sort];
  return selected.sort((a,b)=>{
    const x=value(a),y=value(b),comparison=typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y));
    return comparison*(direction==='desc'?-1:1)||collator.compare(a.id,b.id);
  });
}
const priorityBadge = c => `<span class="pilot-priority p${c.priority}">P${c.priority}</span><small>${e(priorities[c.priority])}</small>`;
const reviewBadge = c => `<span class="pilot-review ${c.outreachStatus==='account_created'?'converted':c.outreachStatus==='on_hold'?'held':''}">${e(reviewState(c))}</span>${c.account?.state==='created'?`<small>${c.account.emailVerified?'Verified email':'Email not verified'}${!c.account.active?' · Account inactive':''}</small>`:''}`;

export function mountPilot(root,call) {
  let alive=true,loaded=false,loading=false,generation=0,contacts=[],sourceDate='',offset=0,sort='priority',direction='asc',returnFocus=null,assignees=[],selected=null,saving=false,dirty=false;
  const pageSize=25;
  root.innerHTML=`<div class="section-intro"><p>From first contact to account created</p><span data-pilot-source></span></div>
    <div class="pilot-progress" data-pilot-progress></div>
    <form class="pilot-toolbar" aria-label="Filter pilot contacts"><div class="pilot-search"><label for="pilot-search">Search</label><input id="pilot-search" type="search" placeholder="Name, email or site" autocomplete="off"></div>
    <div><label for="pilot-priority">Priority</label><select id="pilot-priority"><option value="">All priorities</option>${Object.entries(priorities).map(([n,label])=>`<option value="${n}">P${n} · ${label}</option>`).join('')}</select></div>
    <div><label for="pilot-provider">Provider</label><select id="pilot-provider"><option value="">All providers</option><option>Fronius</option><option>Enphase</option></select></div>
    <div><label for="pilot-review">Status</label><select id="pilot-review"><option value="">All contacts</option>${Object.entries(stages).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></div><div><label for="pilot-assignee">Assigned to</label><select id="pilot-assignee"><option value="">Everyone</option><option value="unassigned">Unassigned</option></select></div><button type="button" data-pilot-reset>Clear filters</button></form>
    <div class="pilot-summary"><p data-pilot-count role="status"></p><button type="button" class="pilot-refresh" data-pilot-refresh>Refresh accounts</button><details><summary>Priority guide</summary><ol>${Object.values(priorities).map(label=>`<li>${e(label)}</li>`).join('')}</ol><p>P1 is the highest priority. The initial order comes from the contact review; you can adjust it as outreach progresses.</p></details></div>
    <p class="pilot-compose-help">Draft email opens a personalized message in Gmail. Check the From address before sending; update the outreach status after you send.</p><p data-pilot-message role="status"></p><div data-pilot-results></div><div class="rates-pager" data-pilot-pager hidden><button type="button" data-pilot-prev>Previous</button><span data-pilot-page></span><button type="button" data-pilot-next>Next</button></div>
    <dialog class="rate-dialog pilot-dialog" aria-labelledby="pilot-detail-title"><div class="access-dialog-top"><div><span class="eyebrow" data-pilot-id></span><h3 id="pilot-detail-title"></h3></div><button type="button" data-pilot-close aria-label="Close contact details">Close</button></div><div data-pilot-detail></div></dialog>`;
  const $=s=>root.querySelector(s),dialog=$('dialog');
  const filters=()=>({query:$('#pilot-search').value,priority:$('#pilot-priority').value,provider:$('#pilot-provider').value,review:$('#pilot-review').value,assignee:$('#pilot-assignee').value,sort,direction,assignees});
  function render() {
    const rows=selectContacts(contacts,filters());if(offset>=rows.length)offset=0;const page=rows.slice(offset,offset+pageSize);
    const converted=contacts.filter(c=>c.outreachStatus==='account_created').length;
    $('[data-pilot-progress]').innerHTML=`<div><strong>${converted}<small> / ${contacts.length}</small></strong><span>Accounts created</span></div><div><strong>${contacts.length-converted}</strong><span>Without an account</span></div><div><strong>${contacts.filter(c=>!c.tracking?.assigneeId&&c.outreachStatus!=='account_created').length}</strong><span>Unassigned prospects</span></div>`;
    $('[data-pilot-count]').textContent=`${rows.length} of ${contacts.length} contacts`;
    $('[data-pilot-source]').textContent=`Contact review · ${sourceDate}`;
    $('[data-pilot-results]').innerHTML=rows.length?`<div class="access-table-scroll" role="region" aria-label="Pilot contacts table" tabindex="0"><table class="access-table pilot-table"><caption class="sr-only">Pilot contacts. Select a column heading to sort.</caption><thead><tr>${[['priority','Priority'],['contact','Contact'],['assignee','Assigned to'],['review','Status'],['sites','Sites']].map(([key,label])=>`<th scope="col" aria-sort="${sort===key?(direction==='asc'?'ascending':'descending'):'none'}"><button type="button" data-pilot-sort="${key}">${label}<span aria-hidden="true">${sort===key?(direction==='asc'?'↑':'↓'):'↕'}</span></button></th>`).join('')}<th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody>${page.map(c=>`<tr data-pilot-contact="${e(c.id)}"><td><button type="button" class="pilot-priority-control" data-pilot-open="${e(c.id)}" data-pilot-focus="priority" aria-label="Change priority for ${e(c.name||c.email)}">${priorityBadge(c)}</button></td><td><strong>${e(c.name||'Name not confirmed')}</strong><small>${e(c.id)} · ${c.providers.map(e).join(' + ')}</small><a class="pilot-email" href="mailto:${e(encodeURIComponent(c.email))}">${e(c.email)}</a><small>${e(c.phone||'Phone not recorded')}</small>${draftAction(c)}</td><td><button type="button" class="pilot-assignee-control" data-pilot-open="${e(c.id)}" data-pilot-focus="assignee" aria-label="Assign ${e(c.name||c.email)}">${e(assigneeName(c,assignees))}</button></td><td>${reviewBadge(c)}</td><td><strong>${c.sites.length} site${c.sites.length===1?'':'s'}</strong><small>${e(c.sites[0]?.name||'No sites recorded')}${c.sites.length>1?` · +${c.sites.length-1} more`:''}</small></td><td><button type="button" data-pilot-open="${e(c.id)}" aria-label="Manage ${e(c.name||c.email)}">Manage <span aria-hidden="true">↗</span></button></td></tr>`).join('')}</tbody></table></div>`:'<div class="pilot-empty"><strong>No contacts match</strong><p>Try a different search or clear the filters.</p></div>';
    $('[data-pilot-pager]').hidden=!rows.length;
    $('[data-pilot-prev]').disabled=offset===0;$('[data-pilot-next]').disabled=offset+pageSize>=rows.length;
    $('[data-pilot-page]').textContent=`${offset+1}–${Math.min(offset+pageSize,rows.length)} of ${rows.length}`;
  }
  async function load(force=false) {
    if(!alive||loaded&&!force||loading||saving)return;
    loading=true;const ticket=++generation;$('[data-pilot-message]').textContent='Loading contacts…';
    try {
      const data=await call('admin-stats',{view:'pilot'});
      if(!alive||ticket!==generation)return;
      if(!data.ok||!Array.isArray(data.contacts)||!data.contacts.length)throw Error('Pilot contacts are unavailable.');
      contacts=data.contacts;assignees=data.assignees||[];sourceDate=data.sourceDate;loaded=true;
      const previous=$('#pilot-assignee').value;$('#pilot-assignee').innerHTML='<option value="">Everyone</option><option value="unassigned">Unassigned</option>'+assignees.map(a=>`<option value="${e(a.id)}">${e(a.name)}</option>`).join('');$('#pilot-assignee').value=previous;$('[data-pilot-message]').textContent='';render();
    } catch(error) {if(alive&&ticket===generation){$('[data-pilot-message]').innerHTML=`${e(error.message)} <button type="button" data-pilot-retry>Try again</button>`;}}
    finally{loading=false;}
  }
  function open(c,button) {
    selected=c;dirty=false;returnFocus=button;$('[data-pilot-id]').textContent=c.id;$('#pilot-detail-title').textContent=c.name||'Name not confirmed';
    $('[data-pilot-detail]').innerHTML=`<div class="pilot-detail-meta">${priorityBadge(c)}<span>${c.providers.map(e).join(' + ')}</span>${reviewBadge(c)}</div>
      <div class="pilot-detail-contact"><a href="mailto:${e(encodeURIComponent(c.email))}">${e(c.email)}</a><p>${e(c.phone||'Phone not recorded')}${c.phoneType?` <small>· ${e(c.phoneType)}</small>`:''}</p><p>${e(c.contactType)}</p></div>
      <div class="pilot-compose-detail">${draftAction(c,true)}<p>Outreach owner: <strong>${e(assigneeName(c,assignees))}</strong>. Review the From address and message in Gmail. Opening a draft does not mark this contact as contacted.</p></div>
      <form class="pilot-editor" data-pilot-editor><div><label for="pilot-edit-priority">Priority</label><select id="pilot-edit-priority" name="priority">${Object.entries(priorities).map(([id,label])=>`<option value="${id}" ${Number(id)===c.priority?'selected':''}>P${id} · ${label}</option>`).join('')}</select></div><div><label for="pilot-edit-assignee">Assigned to</label><select id="pilot-edit-assignee" name="assignee"><option value="">Unassigned</option>${assignees.filter(a=>a.active||a.id===c.tracking.assigneeId).map(a=>`<option value="${e(a.id)}" ${a.id===c.tracking.assigneeId?'selected':''}>${e(a.name)}</option>`).join('')}</select></div><div class="full"><label for="pilot-edit-stage">Outreach status</label>${c.account?.state==='created'?`<div class="pilot-goal"><strong>Account created</strong><small>Matched automatically to this email${c.account.createdAt?` · ${e(new Date(c.account.createdAt).toLocaleDateString('en-CA'))}`:''}. ${c.account.emailVerified?'Email verified.':'Email is not verified yet.'}</small></div>`:`<select id="pilot-edit-stage" name="stage">${editableStages.map(([id,label])=>`<option value="${id}" ${id===(c.outreachStatus==='invited'?'invited':c.tracking.stage)?'selected':''}>${label}</option>`).join('')}</select>`}</div><div class="full"><label for="pilot-edit-note">Outreach note</label><textarea id="pilot-edit-note" name="note" maxlength="2000" rows="3" placeholder="Latest conversation or next step">${e(c.tracking.note)}</textarea></div><p class="full" data-pilot-save-message role="status"></p><button type="submit" data-pilot-save disabled>Save changes</button></form>
      ${c.reviewNotes||c.status==='hold'?`<aside class="pilot-note"><strong>${c.outreachStatus==='on_hold'?'On hold · original review note':'Original review note'}</strong><p>${e(c.reviewNotes||c.assessment)}</p>${c.outreachStatus==='on_hold'&&!c.tracking.version?'<small>No final decision recorded.</small>':''}</aside>`:''}
      <h4>${c.sites.length} associated site${c.sites.length===1?'':'s'}</h4><ul class="pilot-sites">${c.sites.map(s=>`<li>${siteLink(s)}<small>${e(s.provider)}</small></li>`).join('')}</ul>
      <details class="pilot-evidence"><summary>Contact details and sources</summary><p>Original priority: P${c.sourcePriority} · ${e(sourcePriorities[c.sourcePriority])}</p><p>${e(c.quality)}</p><p>${e(c.notes)}</p>${c.feedbackSource?`<p>${e(c.feedbackSource)} · ${e(c.feedbackDate)}</p>`:''}<ul>${c.sources.map(url=>https(url)?`<li><a href="${e(https(url))}" target="_blank" rel="noopener noreferrer">${e(new URL(url).hostname)} <span aria-hidden="true">↗</span></a></li>`:'').join('')}</ul></details><details class="pilot-history" data-pilot-history><summary>Outreach history</summary><div data-pilot-history-content></div></details><p class="pilot-footnote">Account creation is matched automatically by email. Tracking outreach does not send messages or enroll sites.</p>`;
    dialog.showModal();const focus=button.dataset.pilotFocus;if(focus)$(`#pilot-edit-${focus}`)?.focus();
  }
  function canLeave(){if(saving||dirty&&!confirm('Discard unsaved outreach changes?'))return false;if(dialog.open){dialog.close();$('[data-pilot-detail]').replaceChildren();selected=null;dirty=false;}return true;}
  function close(){if(!canLeave())return;dialog.close();$('[data-pilot-detail]').replaceChildren();selected=null;dirty=false;returnFocus?.focus();returnFocus=null;}
  async function save(){
    if(!selected||saving||!dirty)return;
    const contact=selected,data=new FormData($('[data-pilot-editor]'));
    const input={id:contact.id,priority:Number(data.get('priority')),assigneeId:String(data.get('assignee')||'')||null,
      stage:contact.account?.state==='created'?contact.tracking.stage:String(data.get('stage')),note:String(data.get('note')),version:contact.tracking.version};
    saving=true;$('[data-pilot-save]').disabled=true;$('[data-pilot-save-message]').textContent='Saving…';
    $('[data-pilot-editor]').querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
    try{
      const result=await call('admin-stats',{view:'pilot_update',input});
      if(!alive)return;
      if(!result.ok||result.contact?.id!==contact.id)throw Error('Save could not be confirmed. Refresh to check.');
      contacts=contacts.map(c=>c.id===contact.id?result.contact:c);dirty=false;selected=null;saving=false;dialog.close();$('[data-pilot-detail]').replaceChildren();render();
      $('[data-pilot-message]').textContent=`Saved ${contact.name||contact.email}.`;
      root.querySelector(`[data-pilot-open="${contact.id}"]`)?.focus();returnFocus=null;
    }catch(error){if(alive){$('[data-pilot-save-message]').textContent=error.message;if(error.code==='PILOT_CONFLICT')$('[data-pilot-save-message]').innerHTML=`${e(error.message)} <button type="button" data-pilot-reload>Reload contact</button>`;}}
    finally{saving=false;if(alive&&selected){$('[data-pilot-save]').disabled=false;$('[data-pilot-editor]').querySelectorAll('input,select,textarea').forEach(el=>el.disabled=false);}}
  }
  async function history(){
    if(!selected||!$('[data-pilot-history]')?.open)return;const contact=selected,node=$('[data-pilot-history-content]');if(node.childElementCount)return;
    node.textContent='Loading history…';
    try{const data=await call('admin-stats',{view:'pilot_history',input:{id:contact.id}});if(!alive||selected?.id!==contact.id)return;
      node.innerHTML=data.history.length?`<ol>${data.history.map(h=>`<li><strong>${e(h.by)}</strong> · ${e(new Date(h.at).toLocaleString())}<p>P${h.after.priority} · ${e(assignees.find(a=>a.id===h.after.assigneeId)?.name||'Unassigned')} · ${e(stages[h.after.stage])}</p>${h.after.note?`<p>${e(h.after.note)}</p>`:''}</li>`).join('')}</ol>`:'<p>No outreach updates yet.</p>';
    }catch(error){if(alive&&selected?.id===contact.id)node.textContent=error.message;}
  }
  const filter=()=>{offset=0;if(loaded)render();};
  const input=event=>{if(event.target.closest('[data-pilot-editor]')){dirty=true;$('[data-pilot-save]').disabled=false;}else if(event.target.id==='pilot-search')filter();};
  const change=event=>{if(event.target.closest('[data-pilot-editor]')){dirty=true;$('[data-pilot-save]').disabled=false;}else if(event.target.matches('.pilot-toolbar select'))filter();};
  const submit=event=>{event.preventDefault();if(event.target.matches('[data-pilot-editor]'))void save();};
  const click=event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-pilot-close'))return close();
    if(b.hasAttribute('data-pilot-open')){const c=contacts.find(c=>c.id===b.dataset.pilotOpen);if(c)open(c,b);return;}
    if(b.hasAttribute('data-pilot-refresh'))return void load(true);
    if(b.hasAttribute('data-pilot-reload')){if(!canLeave())return;dirty=false;dialog.close();selected=null;return void load(true);}
    if(b.hasAttribute('data-pilot-retry'))return void load();
    if(b.hasAttribute('data-pilot-reset')){$('.pilot-toolbar').reset();filter();return;}
    if(b.hasAttribute('data-pilot-sort')){const key=b.dataset.pilotSort;direction=sort===key&&direction==='asc'?'desc':'asc';sort=key;offset=0;render();$(`[data-pilot-sort="${key}"]`).focus();return;}
    if(b.hasAttribute('data-pilot-prev'))offset=Math.max(0,offset-pageSize);
    else if(b.hasAttribute('data-pilot-next'))offset+=pageSize;
    else return;
    render();$(`[data-pilot-${b.hasAttribute('data-pilot-prev')?'prev':'next'}]`).focus();
  };
  const cancel=event=>{event.preventDefault();close();};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('toggle',history,true);dialog.addEventListener('cancel',cancel);
  return {show:()=>load(true),canLeave,destroy(){alive=false;++generation;contacts=[];selected=null;assignees=[];dirty=false;if(dialog.open)dialog.close();returnFocus=null;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('toggle',history,true);dialog.removeEventListener('cancel',cancel);root.replaceChildren();}};
}
