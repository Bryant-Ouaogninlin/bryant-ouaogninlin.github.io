(function(){
  var root=document.documentElement, reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Entrée : titre (mot par mot) + timeline
  document.querySelectorAll('h1 .w>span').forEach(function(w,i){w.style.transitionDelay=(i*70)+'ms'});
  var tl=document.getElementById('timeline');
  function laneWidth(){var lane=document.querySelector('.lane'); if(lane&&tl) tl.style.setProperty('--lane',(lane.offsetWidth-2)+'px')}
  laneWidth(); addEventListener('resize',laneWidth);
  function begin(){requestAnimationFrame(function(){requestAnimationFrame(function(){document.body.classList.add('ready')})})}
  window.kineoBegin=begin;
  if(!root.classList.contains('intro-on')) begin();   // sur l'accueil, l'intro appelle begin() à la fin

  // Révélation au scroll
  var items=document.querySelectorAll('.rv');
  if('IntersectionObserver' in window && !reduce){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.15});
    items.forEach(function(el){io.observe(el)});
  } else items.forEach(function(el){el.classList.add('in')});

  // Tête de lecture + timecode (25 i/s) liés au scroll ; sur l'accueil, la timeline du hero suit aussi le scroll
  var bar=document.getElementById('playhead'), tc=document.getElementById('tc'), tick=false;
  var cursor=document.getElementById('cursor'), clips=[].slice.call(document.querySelectorAll('.clip'));
  function pad(n){return (n<10?'0':'')+n}
  function update(){
    var max=document.documentElement.scrollHeight-innerHeight, p=max>0?Math.min(1,scrollY/max):0;
    bar.style.transform='scaleX('+p+')';
    var frames=Math.round(p*180*25);
    tc.textContent=pad(Math.floor(frames/90000))+':'+pad(Math.floor(frames/1500)%60)+':'+pad(Math.floor(frames/25)%60)+':'+pad(frames%25);
    if(tl&&cursor){
      var lane=document.querySelector('.lane'), lw=lane.offsetWidth, span=Math.max(1,tl.offsetTop-64), x=Math.min(1,scrollY/span)*lw;
      cursor.style.transform='translateX('+x+'px)';
      var base=lane.getBoundingClientRect().left;
      clips.forEach(function(c){var r=c.getBoundingClientRect(); c.classList.toggle('passed',(r.left-base)<=x)});
    }
    tick=false;
  }
  addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(update)}},{passive:true});
  addEventListener('resize',update); update();

  // Menu mobile
  var mb=document.querySelector('.menu-btn'), menu=document.getElementById('menu');
  if(mb&&menu){
    mb.addEventListener('click',function(){var o=menu.classList.toggle('open'); mb.setAttribute('aria-expanded',o?'true':'false'); mb.textContent=o?'Fermer':'Menu'});
    menu.addEventListener('click',function(e){if(e.target.tagName==='A') menu.classList.remove('open')});
    addEventListener('keydown',function(e){if(e.key==='Escape'){menu.classList.remove('open');mb.setAttribute('aria-expanded','false');mb.textContent='Menu'}});
  }
})();
