const pages = [
  ['overview','Overview','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  ['sites','Sites','M3 20h18 M5 16V9l7-5 7 5v7 M9 20v-7h6v7'],
  ['people','People & access','M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M13 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8'],
  ['pilot','Pilot','M4 21V3 M4 4h14l-3 4 3 4H4'],
  ['feedback','Feedback','M3 4h18v13H8l-5 4z M7 8h10 M7 12h7'],
];
export const groups = {
  sites: [['health','Health'], ['alerts','Alerts'], ['rates','Site attributes']],
  people: [['users','Users'], ['reviews','Requests'], ['mappings','Assignments'], ['assignments','Active access'], ['history','History']],
};
const groupFor = id => Object.keys(groups).find(group => groups[group].some(([view]) => view === id)) || id;
const panelFor = id => ['reviews','mappings','assignments','history'].includes(id) ? 'site-access' : ({health:'site-health',alerts:'alert-monitoring',rates:'site-rates',users:'people-users'})[id];

export function mountAdminShell(onNavigate) {
  const sidebar=document.getElementById('admin-sidebar'), menu=document.getElementById('admin-menu');
  const main=document.getElementById('admin-main'), scrim=document.getElementById('admin-scrim');
  const nav=document.getElementById('admin-nav'), close=document.getElementById('admin-nav-close');
  const tabs=document.getElementById('admin-tabs');
  const mobile=matchMedia('(max-width: 900px)');
  let active='overview', enabled=false;
  const remembered={sites:'health',people:'users'};
  nav.innerHTML=pages.map(([id,label,path])=>`<button type="button" data-admin-page="${id}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg><span>${label}</span></button>`).join('');
  function drawer(open,focus=true) {
    const visible=enabled&&mobile.matches&&open;
    document.body.classList.toggle('admin-nav-open',visible);
    menu.setAttribute('aria-expanded',String(visible));scrim.hidden=!visible;main.inert=visible;
    sidebar.inert=!enabled||(mobile.matches&&!visible);
    if(visible)close.focus();else if(focus&&enabled&&mobile.matches)menu.focus();
  }
  function select(requested,focus=true,fromHistory=false) {
    let id=String(requested).split('/').at(-1);
    id=remembered[id]||id;
    if(id==='pipeline')id='overview';
    const group=groupFor(id);
    if(!enabled||!pages.some(([page])=>page===group)||onNavigate(id)===false)return false;
    active=id;if(groups[group])remembered[group]=id;
    nav.querySelectorAll('button').forEach(button=>{
      if(button.dataset.adminPage===group)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    document.getElementById('admin-page-title').textContent=pages.find(([page])=>page===group)[1];
    tabs.hidden=!groups[group];
    tabs.setAttribute('aria-label',`${pages.find(([page])=>page===group)[1]} views`);
    tabs.innerHTML=(groups[group]||[]).map(([view,label])=>`<button type="button" role="tab" id="tab-${view}" data-admin-tab="${view}" aria-selected="${view===id}" tabindex="${view===id?0:-1}" aria-controls="${panelFor(view)}">${label}</button>`).join('');
    for(const [view] of groups[group]||[]){const panel=document.getElementById(panelFor(view));if(panel){panel.setAttribute('role','tabpanel');if(view===id)panel.setAttribute('aria-labelledby',`tab-${view}`);}}
    const hash=groups[group]?`${group}/${id}`:id;
    if(!fromHistory&&location.hash!==`#${hash}`)history[focus?'pushState':'replaceState'](null,'',`#${hash}`);
    drawer(false,false);
    if(focus){document.getElementById('admin-page-title').focus();window.scrollTo({top:0,behavior:'instant'});}
    return true;
  }
  nav.onclick=event=>{const button=event.target.closest('[data-admin-page]');if(button)select(button.dataset.adminPage);};
  tabs.onclick=event=>{const button=event.target.closest('[data-admin-tab]');if(button&&select(button.dataset.adminTab))tabs.querySelector('[aria-selected=true]')?.focus();};
  tabs.onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=[...tabs.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(index<0)return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[next].click();
  };
  menu.onclick=()=>drawer(true);close.onclick=()=>drawer(false);scrim.onclick=()=>drawer(false);
  document.addEventListener('keydown',event=>{
    if(!document.body.classList.contains('admin-nav-open'))return;
    if(event.key==='Escape'){event.preventDefault();drawer(false);}
    if(event.key==='Tab'){
      const controls=[...sidebar.querySelectorAll('button')].filter(el=>!el.hidden&&el.getClientRects().length&&!el.disabled);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  window.addEventListener('hashchange',()=>{if(enabled&&!select(location.hash.slice(1)||'overview',false,true))history.replaceState(null,'',`#${groupFor(active)}/${active}`);});
  mobile.addEventListener('change',()=>drawer(false,false));
  return {
    enable(){enabled=true;document.body.classList.add('admin-signed-in');sidebar.hidden=false;menu.hidden=false;drawer(false,false);select(location.hash.slice(1)||active,false)||select('overview',false);},
    reset(){enabled=false;active='overview';remembered.sites='health';remembered.people='users';tabs.hidden=true;tabs.replaceChildren();document.body.classList.remove('admin-signed-in');sidebar.hidden=true;menu.hidden=true;drawer(false,false);},
    select,
  };
}
