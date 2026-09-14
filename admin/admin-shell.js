const pages = [
  ['overview','Overview','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  ['rates','Sites & FIT rates','M3 20h18 M5 16V9l7-5 7 5v7 M9 20v-7h6v7'],
  ['reviews','Requests','M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h4'],
  ['mappings','Assignments','M8 12h8 M9 7H6a5 5 0 0 0 0 10h3 M15 7h3a5 5 0 0 1 0 10h-3'],
  ['assignments','Active access','M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6'],
  ['history','Access history','M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v6l4 2'],
  ['pipeline','Onboarding','M4 6h16 M4 12h11 M4 18h6'],
  ['users','Users','M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M13 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8'],
  ['feedback','Feedback','M3 4h18v13H8l-5 4z M7 8h10 M7 12h7'],
];

export function mountAdminShell(onNavigate) {
  const sidebar=document.getElementById('admin-sidebar'), menu=document.getElementById('admin-menu');
  const main=document.getElementById('admin-main'), scrim=document.getElementById('admin-scrim');
  const nav=document.getElementById('admin-nav'), close=document.getElementById('admin-nav-close');
  const mobile=matchMedia('(max-width: 900px)');
  let active='overview', enabled=false;
  nav.innerHTML=pages.map(([id,label,path])=>`<button type="button" data-admin-page="${id}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg><span>${label}</span></button>`).join('');
  function drawer(open,focus=true) {
    const visible=enabled&&mobile.matches&&open;
    document.body.classList.toggle('admin-nav-open',visible);
    menu.setAttribute('aria-expanded',String(visible));
    scrim.hidden=!visible;
    main.inert=visible;
    sidebar.inert=!enabled||(mobile.matches&&!visible);
    if(visible)close.focus();else if(focus&&enabled&&mobile.matches)menu.focus();
  }
  function select(id,focus=true) {
    if(!enabled||!pages.some(([page])=>page===id)||onNavigate(id)===false)return false;
    active=id;
    nav.querySelectorAll('button').forEach(button=>{
      if(button.dataset.adminPage===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    history.replaceState(null,'',`#${id}`);
    drawer(false,false);
    if(focus){document.getElementById('admin-page-title').focus();window.scrollTo({top:0,behavior:'instant'});}
    return true;
  }
  nav.onclick=event=>{const button=event.target.closest('[data-admin-page]');if(button)select(button.dataset.adminPage);};
  menu.onclick=()=>drawer(true);close.onclick=()=>drawer(false);scrim.onclick=()=>drawer(false);
  const keydown=event=>{
    if(!document.body.classList.contains('admin-nav-open'))return;
    if(event.key==='Escape'){event.preventDefault();drawer(false);}
    if(event.key==='Tab'){
      const controls=[...sidebar.querySelectorAll('button')].filter(el=>!el.hidden&&el.getClientRects().length&&!el.disabled);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  };
  document.addEventListener('keydown',keydown);
  mobile.addEventListener('change',()=>drawer(false,false));
  return {
    enable(){enabled=true;document.body.classList.add('admin-signed-in');sidebar.hidden=false;menu.hidden=false;drawer(false,false);select(location.hash.slice(1)||active,false)||select('overview',false);},
    reset(){enabled=false;document.body.classList.remove('admin-signed-in');sidebar.hidden=true;menu.hidden=true;drawer(false,false);},
    select,
  };
}
