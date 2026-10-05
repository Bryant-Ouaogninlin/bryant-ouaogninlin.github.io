// Hero : le monogramme K en 3D, réactif à la souris et au défilement (three.js)
(function(){
  var box=document.getElementById('hero3d'); if(!box) return;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hudRot=document.getElementById('hudrot');
  function start(){ import('./vendor/three.module.min.js').then(init).catch(function(){}) }
  if(document.body.classList.contains('ready')) setTimeout(start,60);
  else document.addEventListener('kineo:begin',function(){setTimeout(start,60)},{once:true});

  function init(THREE){
    var canvas=box.querySelector('canvas'), renderer;
    try{renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:true})}catch(e){return}
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
    var scene=new THREE.Scene(), cam=new THREE.PerspectiveCamera(32,1,1,500); cam.position.set(0,0,110);

    // reflexions : un mini studio de lumière (softboxes) converti en carte d'environnement
    var env=new THREE.Scene(); env.background=new THREE.Color(0x0b0d10);
    function softbox(w,h,color,k,pos){var m;m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(pos[0],pos[1],pos[2]);m.lookAt(0,0,0);env.add(m);return m}
    softbox(14,8,0xffffff,6,[-10,10,12]); var sbAcc=softbox(10,10,0xff5a1f,5,[12,-4,-10]); softbox(18,3,0xbcd0ff,3,[0,14,-8]); softbox(8,8,0xffffff,2,[0,-12,10]);
    var pm=new THREE.PMREMGenerator(renderer), envTex=pm.fromScene(env,.03); scene.environment=envTex.texture;
    scene.add(new THREE.HemisphereLight(0xffffff,0x20242b,.4));
    var key=new THREE.DirectionalLight(0xfff1e2,1.8); key.position.set(-30,40,50); scene.add(key);
    var rim=new THREE.DirectionalLight(0xff5a1f,3); rim.position.set(40,-10,-30); scene.add(rim);

    // le K : trois pièces extrudées et biseautées (coordonnées y vers le haut)
    function shape(pts){var s=new THREE.Shape(); pts.forEach(function(p,i){i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1])}); s.closePath(); return s}
    var opt={depth:7,bevelEnabled:true,bevelThickness:.9,bevelSize:.7,bevelSegments:4,curveSegments:1};
    function geo(pts){var g=new THREE.ExtrudeGeometry(shape(pts),opt); g.translate(-19,-20,-3.5); return g}
    var cream=new THREE.MeshPhysicalMaterial({color:0xf2f1ec,roughness:.3,metalness:.12,clearcoat:1,clearcoatRoughness:.12});
    var orange=new THREE.MeshPhysicalMaterial({color:0xff5a1f,roughness:.25,metalness:.2,emissive:0xff3d00,emissiveIntensity:.3,envMapIntensity:.55,clearcoat:1,clearcoatRoughness:.1});
    var stem=new THREE.Mesh(geo([[8,5],[15,5],[15,35],[8,35]]),cream);
    var up=new THREE.Mesh(geo([[15,24.95],[15,20],[19.95,20],[30,30.05],[25.05,35]]),orange);
    var lo=new THREE.Mesh(geo([[15,15.05],[15,20],[19.95,20],[30,9.95],[25.05,5]]),cream);
    var K=new THREE.Group(); K.add(stem,up,lo); scene.add(K);
    var sc_=document.createElement('canvas'); sc_.width=sc_.height=128; var sx_=sc_.getContext('2d'), gr_=sx_.createRadialGradient(64,64,0,64,64,64);
    gr_.addColorStop(0,'rgba(0,0,0,.75)'); gr_.addColorStop(.6,'rgba(0,0,0,.28)'); gr_.addColorStop(1,'rgba(0,0,0,0)'); sx_.fillStyle=gr_; sx_.fillRect(0,0,128,128);
    var shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc_),transparent:true,depthWrite:false})); shadow.position.set(0,-23,-6); scene.add(shadow);

    // anneaux de lecture : un fin anneau orange avec un marqueur, un anneau pâle
    var rings=new THREE.Group(); scene.add(rings);
    var r1=new THREE.Mesh(new THREE.TorusGeometry(28,.14,8,220),new THREE.MeshBasicMaterial({color:0xff5a1f,toneMapped:false})); r1.rotation.x=1.15; r1.rotation.y=.3; rings.add(r1);
    var r2=new THREE.Mesh(new THREE.TorusGeometry(33,.1,8,220),new THREE.MeshBasicMaterial({color:0xf2f1ec,transparent:true,opacity:.22,toneMapped:false})); r2.rotation.x=.45; r2.rotation.y=-.5; rings.add(r2);
    var mk=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),new THREE.MeshBasicMaterial({color:0xf2f1ec,toneMapped:false})); rings.add(mk);

    // objets flottants à différentes profondeurs : web, vidéo, curseur, réseaux
    var dark=new THREE.MeshPhysicalMaterial({color:0x151a21,roughness:.22,metalness:.65,clearcoat:1,clearcoatRoughness:.1});
    var accMat=new THREE.MeshPhysicalMaterial({color:0xff5a1f,roughness:.3,metalness:.2,emissive:0xff5a1f,emissiveIntensity:.35,clearcoat:1});
    var floaters=[];
    function put(obj,pos,rs,spd){obj.position.set(pos[0],pos[1],pos[2]);obj.userData={b:obj.position.clone(),rs:rs,spd:spd,ph:Math.random()*6.28};scene.add(obj);floaters.push(obj);return obj}
    function ext(pts,depth,mat,bevel){var g=new THREE.ExtrudeGeometry(shape(pts),{depth:depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:1}); g.center(); return new THREE.Mesh(g,mat)}
    function rrect(w,h,r){var s2=new THREE.Shape(),x=-w/2,y=-h/2; s2.moveTo(x+r,y); s2.lineTo(x+w-r,y); s2.quadraticCurveTo(x+w,y,x+w,y+r); s2.lineTo(x+w,y+h-r); s2.quadraticCurveTo(x+w,y+h,x+w-r,y+h); s2.lineTo(x+r,y+h); s2.quadraticCurveTo(x,y+h,x,y+h-r); s2.lineTo(x,y+r); s2.quadraticCurveTo(x,y,x+r,y); return s2}
    // lecture
    put(ext([[-3,-4],[-3,4],[4.6,0]],2.2,cream,.5),[-16,15,10],[.25,.4,.1],.0009).scale.setScalar(1.25);
    // fenêtre de navigateur
    var win=new THREE.Group(); var wb=new THREE.Mesh(new THREE.BoxGeometry(13,8.4,1),dark); var wt=new THREE.Mesh(new THREE.BoxGeometry(13,1.5,1.2),accMat); wt.position.y=3.45;
    win.add(wb,wt); [-5.2,-4,-2.8].forEach(function(x,i){var d=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10),i?cream:accMat); d.position.set(x,3.45,.7); win.add(d)});
    var wl=new THREE.Mesh(new THREE.BoxGeometry(7,.6,1.1),cream); wl.position.set(-2.4,.8,.1); win.add(wl); var wl2=wl.clone(); wl2.scale.x=.55; wl2.position.set(-3.7,-.6,.1); win.add(wl2);
    put(win,[16,-9,12],[.18,-.3,.08],.0011);
    // curseur
    put(ext([[0,0],[0,10],[2.6,7.6],[4.4,11.6],[6.2,10.8],[4.4,6.9],[7.8,6.9]].map(function(p){return [p[0],-p[1]]}),1.4,cream,.35),[16,18,-8],[.12,.35,.05],.0008).scale.setScalar(1.2);
    // pellicule
    var film=new THREE.Group(); film.add(new THREE.Mesh(new THREE.BoxGeometry(15,6.5,.7),dark));
    for(var k=0;k<7;k++){[-2.6,2.6].forEach(function(y){var h=new THREE.Mesh(new THREE.BoxGeometry(1.2,.7,.8),accMat); h.position.set(-6.3+k*2.1,y,0); film.add(h)})}
    var fr=new THREE.Mesh(new THREE.BoxGeometry(11,3.2,.8),cream); fr.position.z=.05; film.add(fr);
    put(film,[-12,-19,-4],[.1,.3,-.1],.0007);
    // bulle de message
    var bub=ext([[-5.5,-3.2],[5.5,-3.2],[5.5,3.2],[-5.5,3.2]],2.4,accMat,.9);
    bub.geometry.dispose(); var bg=new THREE.ExtrudeGeometry(rrect(11,6.4,2.2),{depth:2.4,bevelEnabled:true,bevelThickness:.7,bevelSize:.7,bevelSegments:4,curveSegments:8}); bg.center(); bub.geometry=bg;
    put(bub,[4,-23,14],[.2,.35,.12],.001);
    // lumière qui suit le curseur
    var pl=new THREE.PointLight(0xff5a1f,2600,90,2); scene.add(pl);

    // dimensions
    function resize(){
      var w=box.clientWidth, h=box.clientHeight; if(!w||!h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75)); renderer.setSize(w,h,false);
      cam.aspect=w/h; cam.updateProjectionMatrix();
    }
    resize(); if('ResizeObserver' in window) new ResizeObserver(resize).observe(box); else addEventListener('resize',resize);

    // teinte : les matériaux, l'anneau et la lumière suivent la couleur d'accent du site
    var accCur=new THREE.Color(0xff5a1f), accTar=new THREE.Color(0xff5a1f), spinT=1;
    try{var c0=getComputedStyle(document.documentElement).getPropertyValue('--rec').trim(); if(c0){accCur.set(c0);accTar.set(c0);rim.color.copy(accCur);sbAcc.material.color.copy(accCur).multiplyScalar(5)}}catch(e){}
    document.addEventListener('kineo:theme',function(e){
      accTar.set(e.detail.rec); sbAcc.material.color.copy(accTar).multiplyScalar(5);
      var old=envTex; envTex=pm.fromScene(env,.03); scene.environment=envTex.texture; old.dispose();
      spinT=0;
    });
    // pointeur et défilement
    var nx=0,ny=0,cx=0,cy=0;
    addEventListener('pointermove',function(e){nx=(e.clientX/innerWidth-.5)*2; ny=(e.clientY/innerHeight-.5)*2},{passive:true});
    var visible=true; if('IntersectionObserver' in window) new IntersectionObserver(function(es){visible=es[0].isIntersecting;if(visible&&!raf)loop(performance.now())}).observe(box);

    var t0=performance.now(), raf=0;
    var ease=function(u){return 1-Math.pow(1-u,4)};
    function draw(now){
      var t=now-t0;
      // assemblage à l'arrivée : les trois pièces glissent à leur place
      var a=reduce?1:ease(Math.min(1,t/1500)), b=reduce?1:ease(Math.min(1,Math.max(0,t-150)/1500)), c=reduce?1:ease(Math.min(1,Math.max(0,t-300)/1500));
      stem.position.set(-16*(1-a),0,0); up.position.set(18*(1-b),20*(1-b),Math.sin(t*.0012)*1.1*b); lo.position.set(18*(1-c),-20*(1-c),0);
      up.rotation.z=(1-b)*.6; lo.rotation.z=-(1-c)*.6;
      if(!reduce){cx+=(nx-cx)*.06; cy+=(ny-cy)*.06}
      accCur.lerp(accTar,.07); accMat.color.copy(accCur); accMat.emissive.copy(accCur); pl.color.copy(accCur); orange.color.copy(accCur); orange.emissive.copy(accCur); r1.material.color.copy(accCur); rim.color.copy(accCur);
      spinT=Math.min(1,spinT+.016/1.1); var spin=ease(spinT); var spinY=(spinT<1?(1-spin):0)*-Math.PI*2*-1; var pulse=1+Math.sin(Math.PI*spinT)*.07*(spinT<1?1:0);
      var fl=Math.sin(t*.0014); K.position.y=fl*1.3; K.scale.setScalar(pulse); shadow.scale.set(17-fl*1.2,2.6-fl*.25,1); shadow.material.opacity=.85-fl*.18;
      var sr=Math.min(1,(window.scrollY||0)/800)*1.1;
      K.rotation.y=-.38+cx*.6+Math.sin(t*.0005)*.1+sr+spinY; K.rotation.x=cy*.28;
      rings.rotation.z=reduce?0:t*.00012; rings.rotation.y=cx*.2;
      var ang=reduce?0:t*.0009; mk.position.set(Math.cos(ang)*28,0,Math.sin(ang)*28);
      mk.position.applyEuler(r1.rotation);
      floaters.forEach(function(o,i){var u=o.userData, d=u.b.z/12;
        o.position.set(u.b.x+Math.sin(t*u.spd+u.ph)*1.3-cx*d*3.2, u.b.y+Math.cos(t*u.spd*.8+u.ph)*1.7+cy*d*2+sr*d*6, u.b.z);
        if(!reduce){o.rotation.x+=u.rs[0]*.01; o.rotation.y+=u.rs[1]*.01; o.rotation.z+=u.rs[2]*.01}
      });
      pl.position.set(cx*30,-cy*26,24);
      renderer.render(scene,cam);
      if(hudRot){var d=Math.round(((K.rotation.y*57.2958)%360+360)%360); hudRot.textContent='ROT '+(d<100?(d<10?'00':'0'):'')+d+'°'}
    }
    function loop(now){
      raf=0; if(!visible||document.hidden) return;
      draw(now); if(!reduce) raf=requestAnimationFrame(loop);
    }
    box.classList.add('live');
    if(reduce){ draw(performance.now()); addEventListener('resize',function(){draw(performance.now())}) } else loop(performance.now());
    document.addEventListener('visibilitychange',function(){if(!document.hidden&&visible&&!raf&&!reduce)loop(performance.now())});
  }
})();
