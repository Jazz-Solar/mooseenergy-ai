const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deliveryNames={photo_pending:'Waiting for photo upload',pending:'Queued',processing:'Sending',retry:'Retry scheduled',uncertain:'Delivery needs review',dead:'Delivery needs review',sent:'Delivered'};
export function feedbackDeliveryCell(f){
  if(f.destination!=='jira')return f.hubspot_ok?`<span class="ok">HubSpot · ${esc(f.ticket)}</span>`:`<span class="dim">HubSpot · ${esc(deliveryNames[f.delivery_status]??'Not delivered')}</span>`;
  const link=typeof f.issue_key==='string'&&/^MAI-[0-9]+$/.test(f.issue_key)?`<a href="https://jazzsolar.atlassian.net/browse/${f.issue_key}" target="_blank" rel="noopener noreferrer">${esc(f.issue_key)}</a>`:'Jira';
  const checked=f.checked_at&&Number.isFinite(Date.parse(f.checked_at))?new Date(f.checked_at).toLocaleString():'Not synced yet';
  return `${link}<div>${esc(f.issue_status??deliveryNames[f.delivery_status]??'Queued')}</div><div class="dim">Priority: ${esc(f.issue_priority??f.priority??'medium')}</div><small class="dimmer">Checked: ${esc(checked)}</small>${f.sync_error?'<div class="fail">Sync needs attention; showing last saved status.</div>':''}${['uncertain','rejected'].includes(f.attachment_state)?'<div class="fail">Jira photo needs review. The saved photo is available here.</div>':''}`;
}
export function feedbackMessageCell(f){
  return `<b>${esc(f.subject)||'—'}</b><div class="fb-msg">${esc(f.message)}</div>${f.has_photo&&/^[a-f0-9-]{36}$/.test(f.id)?`<button type="button" data-feedback-photo="${f.id}">View photo</button><div data-photo-preview="${f.id}"></div>`:''}`;
}
export function bindFeedbackPhotos(root,callFn,supabaseUrl){
  root.querySelectorAll('[data-feedback-photo]').forEach(button=>{
    button.onclick=async()=>{
      button.disabled=true;button.textContent='Loading photo…';
      try{
        const result=await callFn('admin-stats',{view:'feedback_photo',input:{id:button.dataset.feedbackPhoto}});
        if(!root.isConnected||!root.contains(button))return;
        const url=new URL(result.url);
        if(url.origin!==supabaseUrl||!url.pathname.startsWith('/storage/v1/object/sign/feedback-photos/'))throw new Error('Invalid photo response');
        const preview=root.querySelector(`[data-photo-preview="${button.dataset.feedbackPhoto}"]`);
        const image=document.createElement('img');image.alt='Bug report photo';image.src=url.href;image.style.cssText='display:block;max-width:100%;max-height:360px;margin-top:12px;border-radius:8px';
        image.onerror=()=>{if(preview.isConnected){preview.textContent='Photo could not be loaded. Try again.';button.textContent='Retry photo';}};
        preview.replaceChildren(image);button.textContent='Reload photo';
      }catch{if(root.contains(button))button.textContent='Retry photo';}
      finally{if(root.contains(button))button.disabled=false;}
    };
  });
}
export function mountFeedbackRefresh(root,callFn,onData){
  let disposed=false,busy=false;
  const button=root.querySelector('[data-feedback-refresh]'),message=root.querySelector('[data-feedback-refresh-status]');
  async function refresh(){
    if(disposed||busy)return;busy=true;button.disabled=true;message.textContent='Refreshing…';
    try{const result=await callFn('admin-stats',{view:'feedback'});if(disposed)return;if(!result.ok||!Array.isArray(result.feedback))throw new Error();onData(result.feedback);message.textContent='Latest saved Jira status loaded.';}
    catch{if(!disposed)message.textContent='Could not refresh. Previous reports remain visible.';}
    finally{busy=false;if(!disposed)button.disabled=false;}
  }
  button.onclick=refresh;
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!root.hidden)void refresh();},300000);
  return {refresh,destroy(){disposed=true;clearInterval(timer);button.onclick=null;}};
}
