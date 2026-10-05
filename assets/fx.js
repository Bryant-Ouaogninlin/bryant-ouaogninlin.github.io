// Effets d'interface : décodage de texte, anneau de curseur, règle de défilement
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine=matchMedia('(pointer:fine)').matches;

  // 1) Décodage : le texte se « résout » lettre par lettre quand il apparaît
  var CH='01<>/\\_-+=#';
  function scramble(el){
    if(el._sc||el.children.length) return; el._sc=1;
    var txt=el.textContent, n=txt.length, t0=performance.now(), dur=Math.min(900,380+n*16);
    el.setAttribute('aria-busy','true');
    (function tick(now){
      var p=Math.min(1,(now-t0)/dur), k=Math.floor(p*n), out='';
      for(var i=0;i<n;i++){var c=txt.charAt(i); out+=(i<k||c===' ')?c:CH.charAt(Math.random()*CH.length|0)}
      el.textContent=out;
      if(p<1) requestAnimationFrame(tick); else {el.textContent=txt; el.removeAttribute('aria-busy')}
    })(t0);
  }
  var sc=document.querySelectorAll('[data-scramble]');
  if(!reduce && 'IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){scramble(e.target);io.unobserve(e.target)}})},{threshold:.4});
    sc.forEach(function(el){io.observe(el)});
  }

  if(reduce||!fine) return;

  // 2) Anneau de curseur + coordonnées
  var ring=document.createElement('div'); ring.className='cur'; ring.setAttribute('aria-hidden','true');
  var pos=document.createElement('div'); pos.className='pos'; pos.setAttribute('aria-hidden','true');
  document.body.appendChild(ring); document.body.appendChild(pos);
  var mx=-100,my=-100,rx=-100,ry=-100,seen=false;
  addEventListener('pointermove',function(e){mx=e.clientX;my=e.clientY;if(!seen){seen=true;ring.classList.add('on');pos.classList.add('on')}},{passive:true});
  document.addEventListener('mouseover',function(e){var t=e.target.closest&&e.target.closest('a,button,.btn');ring.classList.toggle('big',!!t)});
  function pad(n,l){n=String(n);while(n.length<l)n='0'+n;return n}
  (function loop(){
    rx+=(mx-rx)*.18; ry+=(my-ry)*.18;
    ring.style.transform='translate('+(rx-16)+'px,'+(ry-16)+'px)';
    var max=document.documentElement.scrollHeight-innerHeight, p=max>0?Math.round(scrollY/max*100):0;
    pos.textContent='X '+pad(Math.max(0,Math.round(mx)),4)+'  Y '+pad(Math.max(0,Math.round(my)),4)+'  SCROLL '+pad(p,3)+'%';
    requestAnimationFrame(loop);
  })();

  // 3) Règle de défilement (comme la règle d'une timeline de montage)
  if(innerWidth>1100){
    var rule=document.createElement('div'); rule.className='vrule'; rule.setAttribute('aria-hidden','true'); rule.innerHTML='<i></i>';
    document.body.appendChild(rule);
    var mark=rule.firstChild;
    function upd(){var max=document.documentElement.scrollHeight-innerHeight,p=max>0?scrollY/max:0; mark.style.top=(p*100)+'%'}
    addEventListener('scroll',upd,{passive:true}); upd();
  }
})();
