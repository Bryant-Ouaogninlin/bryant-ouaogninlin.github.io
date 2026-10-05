// Teintes du site : une pastille change la couleur d'accent partout, le fond du hero (balayage circulaire) et le K en 3D
(function(){
  var root=document.documentElement, hero=document.querySelector('.hero'), box=document.querySelector('.theme');
  if(!hero||!box) return;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TH=[
    {n:'Orange',  rec:'#ff5a1f',dark:'#c2410c',stage:'#32140a'},
    {n:'Cobalt',  rec:'#1f8fff',dark:'#0b5fcf',stage:'#08224a'},
    {n:'Émeraude',rec:'#19c98c',dark:'#0b8a5e',stage:'#06302a'},
    {n:'Ambre',   rec:'#ffbf2e',dark:'#9a6a00',stage:'#33260a'}
  ];
  var dots=[].slice.call(box.querySelectorAll('.dot')), nameEl=document.getElementById('tname'), numEl=document.getElementById('tnum');
  var cur=0, busy=false, touched=false;
  try{var saved=JSON.parse(localStorage.getItem('kineoTheme')||'null'); if(saved&&typeof saved.i==='number'){cur=saved.i;touched=true}}catch(e){}
  function ui(i){dots.forEach(function(d,k){d.setAttribute('aria-pressed',k===i?'true':'false')}); nameEl.textContent=TH[i].n; numEl.textContent='0'+(i+1)}
  function bg(c){return 'linear-gradient(165deg,'+c+' 0%,#0e1114 60%)'}
  function apply(i,from,manual){
    if(i===cur&&!manual) return;
    var t=TH[i], x=from?from.x:innerWidth*.7, y=from?from.y:200;
    var hr=hero.getBoundingClientRect();
    cur=i; ui(i);
    root.style.setProperty('--rec',t.rec); root.style.setProperty('--rec-dark',t.dark);
    document.dispatchEvent(new CustomEvent('kineo:theme',{detail:t}));
    if(manual){try{localStorage.setItem('kineoTheme',JSON.stringify({i:i,rec:t.rec,dark:t.dark,stage:t.stage}))}catch(e){}}
    if(reduce||!hero.animate){root.style.setProperty('--stage',t.stage);return}
    // balayage circulaire du nouveau fond depuis la pastille
    var w=document.createElement('div'); w.className='wipe'; w.style.background=bg(t.stage); hero.insertBefore(w,hero.firstChild.nextSibling);
    var px=x-hr.left, py=y-hr.top, R=Math.hypot(Math.max(px,hr.width-px),Math.max(py,hr.height-py))+20;
    var a=w.animate([{clipPath:'circle(0px at '+px+'px '+py+'px)'},{clipPath:'circle('+R+'px at '+px+'px '+py+'px)'}],{duration:900,easing:'cubic-bezier(.6,.05,.2,1)',fill:'forwards'});
    a.finished.then(function(){root.style.setProperty('--stage',t.stage);w.remove()}).catch(function(){root.style.setProperty('--stage',t.stage);w.remove()});
  }
  function center(el){var r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}}
  dots.forEach(function(d,k){d.addEventListener('click',function(){touched=true;apply(k,center(d),true)})});
  document.getElementById('tprev').addEventListener('click',function(e){touched=true;apply((cur+3)%4,center(e.currentTarget),true)});
  document.getElementById('tnext').addEventListener('click',function(e){touched=true;apply((cur+1)%4,center(e.currentTarget),true)});
  ui(cur);
  // défilement automatique tant que personne n'a choisi
  if(!reduce&&!touched){
    var vis=true; if('IntersectionObserver' in window) new IntersectionObserver(function(es){vis=es[0].isIntersecting}).observe(hero);
    var iv=setInterval(function(){
      if(touched){clearInterval(iv);return}
      if(!vis||document.hidden||!document.body.classList.contains('ready')) return;
      apply((cur+1)%4,center(dots[(cur+1)%4]),false);
    },6500);
  }
})();
