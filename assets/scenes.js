// Scènes de services : le lapin 3D joue une boucle (site web, montage vidéo, digital)
import * as THREE from './vendor/three.module.min.js';
import { createBunny } from './bunny.js';

var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var cl=function(v,a,b){return Math.min(b,Math.max(a,v))};
var lerp=function(a,b,u){return a+(b-a)*u};
var eIO=function(u){return u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2};
var eOut=function(u){return 1-Math.pow(1-u,3)};
var tri=function(t,a,w){return Math.max(0,1-Math.abs(t-a)/w)};
var accent=new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--rec').trim()||'#ff5a1f');
var accentCss=function(){return '#'+accent.getHexString()};
document.addEventListener('kineo:theme',function(e){accent.set(e.detail.rec)});

// ---------- briques communes ----------
function makeStage(canvas){
  var renderer;
  try{renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:true})}catch(e){return null}
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
  var scene=new THREE.Scene(), cam=new THREE.PerspectiveCamera(28,4/3,10,2000); cam.position.set(30,100,540); cam.lookAt(30,88,0);
  // reflexions : mini studio de lumière
  var env=new THREE.Scene(); env.background=new THREE.Color(0x0b0d10);
  function sb(w,h,c,k,p){var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(p[0],p[1],p[2]);m.lookAt(0,0,0);env.add(m);return m}
  sb(14,8,0xffffff,6,[-10,10,12]); var sbA=sb(10,10,0xff5a1f,5,[12,-4,-10]); sb(18,3,0xbcd0ff,3,[0,14,-8]);
  var pm=new THREE.PMREMGenerator(renderer); var envTex=pm.fromScene(env,.03); scene.environment=envTex.texture;
  scene.add(new THREE.HemisphereLight(0xffffff,0x2a2f38,.9));
  var key=new THREE.DirectionalLight(0xfff1e2,2.2); key.position.set(-200,300,300); scene.add(key);
  var rim=new THREE.DirectionalLight(0xff5a1f,3); rim.position.set(300,120,-250); scene.add(rim);
  function size(){var w=canvas.clientWidth,h=canvas.clientHeight; if(!w||!h) return; renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75)); renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix()}
  size(); if('ResizeObserver' in window) new ResizeObserver(size).observe(canvas); else addEventListener('resize',size);
  function tint(){S_edges.forEach(function(e){e.material.color.copy(accent);e.material.emissive.copy(accent)}); rim.color.copy(accent); sbA.material.color.copy(accent).multiplyScalar(5)}
  tint(); document.addEventListener('kineo:theme',function(){tint(); var o=envTex; envTex=pm.fromScene(env,.03); scene.environment=envTex.texture; o.dispose()});
  // ombre
  var c=document.createElement('canvas'); c.width=c.height=128; var x=c.getContext('2d'), g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,.8)'); g.addColorStop(.6,'rgba(0,0,0,.3)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,128,128);
  var shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false})); shadow.rotation.x=-Math.PI/2; shadow.position.y=.5; scene.add(shadow);
  var bunny=createBunny(); scene.add(bunny.group);
  return {renderer:renderer,scene:scene,cam:cam,bunny:bunny,shadow:shadow};
}
var darkM=new THREE.MeshPhysicalMaterial({color:0x151a21,roughness:.25,metalness:.6,clearcoat:1,clearcoatRoughness:.1});
var creamM=new THREE.MeshPhysicalMaterial({color:0xf2f1ec,roughness:.35,metalness:.1,clearcoat:1});
function accM(){var m=new THREE.MeshPhysicalMaterial({color:0xff5a1f,roughness:.3,metalness:.2,emissive:0xff5a1f,emissiveIntensity:.35,clearcoat:1}); return m}
function screenTex(w,h){var c=document.createElement('canvas'); c.width=w; c.height=h; var t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return {c:c,x:c.getContext('2d'),t:t,w:w,h:h}}
function monitor(sx,sy,w,h,tex,pos){
  var g=new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w+6,h+6,4),darkM));
  var edge=new THREE.Mesh(new THREE.BoxGeometry(w+1.6,h+1.6,.4),accM()); edge.position.z=1.9; g.add(edge); S_edges.push(edge);
  var scr=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex.t,toneMapped:false})); scr.position.z=2.3; g.add(scr);
  var fh=Math.max(4,pos[1]-h/2-3), foot=new THREE.Mesh(new THREE.BoxGeometry(12,fh,4),darkM); foot.position.set(0,-(h/2+3)-fh/2,-1); g.add(foot);
  var base=new THREE.Mesh(new THREE.BoxGeometry(40,2,22),darkM); base.position.set(0,-(h/2+3)-fh-0,2); g.add(base);
  g.position.set(pos[0],pos[1],pos[2]); return g;
}
var S_edges=[];
function rr(x,cx,cy,w,h,r,fill){x.beginPath();x.moveTo(cx+r,cy);x.arcTo(cx+w,cy,cx+w,cy+h,r);x.arcTo(cx+w,cy+h,cx,cy+h,r);x.arcTo(cx,cy+h,cx,cy,r);x.arcTo(cx,cy,cx+w,cy,r);x.closePath();x.fillStyle=fill;x.fill()}

// ---------- scène 1 : le lapin construit un site ----------
function sceneWeb(S,canvas){
  var tex=screenTex(640,400);
  var mon=monitor(0,0,112,70,tex,[78,112,-30]); S.scene.add(mon);
  var desk=new THREE.Mesh(new THREE.BoxGeometry(92,5,52),darkM); desk.position.set(58,40,-2); S.scene.add(desk);
  var leg1=new THREE.Mesh(new THREE.BoxGeometry(5,38,5),darkM); leg1.position.set(16,19,18); S.scene.add(leg1);
  var leg2=leg1.clone(); leg2.position.set(100,19,18); S.scene.add(leg2);
  var kb=new THREE.Mesh(new THREE.BoxGeometry(34,2,12),creamM); kb.position.set(40,43.5,6); S.scene.add(kb);
  var keys=[]; for(var i=0;i<4;i++){var k=new THREE.Mesh(new THREE.BoxGeometry(6,1.4,4),darkM); k.position.set(29+i*7,45,6); S.scene.add(k); keys.push(k)}
  S.bunny.group.position.set(-22,0,4);
  function draw(t){
    var u=(t%6)/6, x=tex.x, W=tex.w, H=tex.h, A=accentCss();
    x.fillStyle='#181d25'; x.fillRect(0,0,W,H);
    rr(x,0,0,W,34,0,'#242b35'); [0,1,2].forEach(function(i){x.beginPath();x.arc(20+i*18,17,5,0,7);x.fillStyle=i?'#f2f1ec':A;x.fill()});
    rr(x,150,8,340,18,9,'#181d25');
    function pop(a,b){return eOut(cl((u-a)/(b-a),0,1))}
    var p1=pop(.05,.18), p2=pop(.15,.32), p3=pop(.3,.46), p4=pop(.44,.58), p5=pop(.56,.72), p6=pop(.7,.86);
    x.globalAlpha=p1; rr(x,28,52,34,34,8,A); [0,1,2,3].forEach(function(i){rr(x,330+i*68,62,52,12,6,'#3a424c')}); x.globalAlpha=1;
    x.globalAlpha=p2; rr(x,28,120,330*p2,34,6,'#f2f1ec'); rr(x,28,164,250*p2,34,6,'#f2f1ec'); x.globalAlpha=1;
    x.globalAlpha=p3; rr(x,28,216,300,10,5,'#8b919b'); rr(x,28,236,240,10,5,'#8b919b'); x.globalAlpha=1;
    x.globalAlpha=p4; rr(x,28,270,130,38,19,A); rr(x,170,270,110,38,19,'#1a1f26'); x.globalAlpha=1;
    x.globalAlpha=p5; var gr=x.createLinearGradient(400,110,600,320); gr.addColorStop(0,A); gr.addColorStop(1,'#1a1f26'); rr(x,396,104,216,204,14,gr); x.globalAlpha=1;
    x.globalAlpha=p6; [0,1,2].forEach(function(i){rr(x,28+i*198,334,180,46,10,'#1a1f26'); rr(x,40+i*198,346,60,8,4,A); rr(x,40+i*198,362,110,8,4,'#3a424c')}); x.globalAlpha=1;
    // curseur de texte
    if(Math.floor(t*2)%2===0){x.fillStyle='#f2f1ec'; x.fillRect(28+330*p2+4,126,3,22)}
    tex.t.needsUpdate=true;
  }
  return function(t,dt){
    draw(t); var u=(t%6)/6, tap=Math.max(0,Math.sin(t*15)), tap2=Math.max(0,Math.sin(t*15+Math.PI));
    var cel=u>.88&&u<.99, up=eIO(cl((u-.88)/.04,0,1))*(1-eIO(cl((u-.95)/.04,0,1)));
    var look=Math.sin(t*.8)*.5+.5;
    var blink=1-.92*tri(t%3.1,1.5,.07);
    var P={yaw:-.55,lean:.12+up*-.1,crouch:cel?3*Math.sin(t*20)*0+(1-up)*0:0,h:up*5*Math.abs(Math.sin(t*14)),sq:0,ha:(1-look)*-.12,blink:blink,mouth:cel?'joy':'smile',brow:cel?-2.5:0,
      footF:[10,0],footB:[-10,0],handF:[lerp(30-tap*0,34,0)+ -2*0,lerp(15-tap*4,-26,up)],handB:[lerp(28,30,0),lerp(16-tap2*4,-30,up)],earA:-.25+up*.1,kick:(!cel||up<.05)?0:0};
    P.handF[0]=lerp(31,16,up); P.handB[0]=lerp(29,2,up);
    S.bunny.update(P,dt);
    var o=S.bunny.group; o.position.y=0; S.shadow.scale.set(60,60,1); S.shadow.position.set(o.position.x+2,.5,o.position.z);
  };
}

// ---------- scène 2 : le lapin monte une vidéo ----------
function sceneVideo(S,canvas){
  var tex=screenTex(800,400);
  var mon=monitor(0,0,130,65,tex,[30,112,-40]); S.scene.add(mon);
  var wheel=new THREE.Mesh(new THREE.CylinderGeometry(9,9,5,40),darkM); wheel.position.set(104,2.5,16); S.scene.add(wheel);
  var ring=new THREE.Mesh(new THREE.TorusGeometry(9,.6,10,40),accM()); ring.rotation.x=Math.PI/2; ring.position.set(104,5.3,16); S.scene.add(ring);
  var span=70;
  function draw(t,u){
    var x=tex.x, W=tex.w, H=tex.h, A=accentCss();
    x.fillStyle='#181d25'; x.fillRect(0,0,W,H);
    rr(x,0,0,W,26,0,'#242b35'); x.fillStyle='#8b919b'; x.font='500 13px monospace'; x.fillText('KINÉO · MONTAGE',14,18);
    // aperçu
    rr(x,230,40,340,170,10,'#222a35');
    var cxp=400+Math.sin(u*Math.PI*2)*90, cyp=125+Math.cos(u*Math.PI*4)*20;
    x.beginPath(); x.arc(cxp,cyp,34,0,7); x.fillStyle=A; x.fill();
    x.beginPath(); x.moveTo(cxp-12,cyp-16); x.lineTo(cxp-12,cyp+16); x.lineTo(cxp+18,cyp); x.closePath(); x.fillStyle='#0e1114'; x.fill();
    // pistes
    var ty=236; var rows=[[A,[[0,.28],[.3,.2],[.55,.3]]],['#f2f1ec',[[.05,.2],[.3,.42]]],['#3a424c',[[.12,.4],[.55,.3]]]];
    rows.forEach(function(r,i){rr(x,0,ty+i*50,W,44,0,i%2?'#12161b':'#0e1114'); r[1].forEach(function(c){rr(x,28+c[0]*744,ty+i*50+6,c[1]*744,32,6,r[0])})});
    // tête de lecture
    var px=28+u*744; x.fillStyle=A; x.fillRect(px-1.5,224,3,176); x.beginPath(); x.moveTo(px-9,224); x.lineTo(px+9,224); x.lineTo(px,238); x.closePath(); x.fill();
    var fr=Math.floor(u*180*25), s=Math.floor(fr/25)%60, f=fr%25; x.fillStyle='#f2f1ec'; x.font='500 14px monospace'; x.fillText('00:00:'+(s<10?'0':'')+s+':'+(f<10?'0':'')+f,W-120,18);
    tex.t.needsUpdate=true;
  }
  S.bunny.group.position.set(-52,0,6);
  var phase=0, lastX=-30;
  return function(t,dt){
    var T=8, k=(t%T)/T, fwd=k<.5, u=fwd?k*2:(1-(k-.5)*2); u=eIO(u);
    draw(t,u);
    var bx=-52.5+u*120.5; S.bunny.group.position.x=bx; var dx=bx-lastX; lastX=bx;
    var rewind=!fwd; phase+=Math.min(Math.abs(dx)*Math.PI/(2*6),dt*20);
    var mv=cl(Math.abs(dx)/dt/60,0,1);
    var foot=function(ph,idle){return [lerp(idle,-6*Math.cos(ph)*(rewind?-1:1)+idle*0,mv), lerp(0,-4*Math.max(0,Math.sin(ph)),mv)]};
    var yaw=rewind?-1.15:-.45;
    var P={yaw:yaw,lean:rewind?-.05:.14,h:0,blink:1-.92*tri(t%3.4,2,.07),mouth:'smile',
      footF:foot(phase,8),footB:foot(phase+Math.PI,-8),
      handF:[22,-34+Math.sin(t*3)*1.5],handB:[10,28+Math.max(0,Math.sin(t*5))*3],earA:rewind?.1:-.5};
    S.bunny.update(P,dt);
    // la molette tourne
    ring.rotation.z=u*18; 
    var o=S.bunny.group; S.shadow.scale.set(60,60,1); S.shadow.position.set(o.position.x+2,.5,o.position.z);
  };
}

// ---------- scène 3 : le lapin publie sur les réseaux ----------
function sceneDigital(S,canvas){
  var phone=new THREE.Group(); phone.scale.setScalar(1.6);
  var body=new THREE.Mesh(new THREE.BoxGeometry(15,28,2.4),darkM); phone.add(body);
  var tex=screenTex(240,420); var scr=new THREE.Mesh(new THREE.PlaneGeometry(13.4,26.2),new THREE.MeshBasicMaterial({map:tex.t,toneMapped:false})); scr.position.z=1.3; phone.add(scr);
  S.scene.add(phone);
  // icônes qui montent : cœur, bulle, lecture
  function iconTex(kind){
    var c=document.createElement('canvas'); c.width=c.height=128; var x=c.getContext('2d'); x.fillStyle='#f2f1ec';
    if(kind==='heart'){x.fillStyle='ACC'}
    var t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return {c:c,x:x,t:t}
  }
  var icons=[]; var kinds=['heart','chat','play','heart','chat','play'];
  kinds.forEach(function(kd,i){
    var tx=iconTex(kd); var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tx.t,transparent:true,depthWrite:false,toneMapped:false})); sp.scale.set(14,14,1); S.scene.add(sp);
    icons.push({sp:sp,tx:tx,kind:kd,off:i/kinds.length,xo:(i%3-1)*14});
  });
  function paintIcon(ic){
    var x=ic.tx.x, A=accentCss(); x.clearRect(0,0,128,128);
    if(ic.kind==='heart'){x.fillStyle=A; x.beginPath(); x.moveTo(64,106); x.bezierCurveTo(8,62,26,14,64,40); x.bezierCurveTo(102,14,120,62,64,106); x.fill()}
    else if(ic.kind==='chat'){x.fillStyle='#f2f1ec'; rr(x,14,20,100,70,20,'#f2f1ec'); x.beginPath(); x.moveTo(38,86); x.lineTo(30,112); x.lineTo(62,90); x.fill(); x.fillStyle='#0e1114'; [0,1,2].forEach(function(i){x.beginPath();x.arc(42+i*22,55,6,0,7);x.fill()})}
    else {x.fillStyle='#f2f1ec'; x.beginPath(); x.arc(64,64,48,0,7); x.fill(); x.fillStyle=A; x.beginPath(); x.moveTo(50,38); x.lineTo(50,90); x.lineTo(94,64); x.closePath(); x.fill()}
    ic.tx.t.needsUpdate=true;
  }
  function drawPhone(t){
    var x=tex.x,W=tex.w,H=tex.h,A=accentCss(); x.fillStyle='#181d25'; x.fillRect(0,0,W,H);
    rr(x,16,20,40,40,20,A); rr(x,66,26,100,10,5,'#f2f1ec'); rr(x,66,44,70,8,4,'#3a424c');
    var gr=x.createLinearGradient(0,80,240,300); gr.addColorStop(0,A); gr.addColorStop(1,'#1a1f26'); rr(x,16,78,208,200,16,gr);
    var like=(t%2)>1.0; x.fillStyle=like?A:'#3a424c'; x.beginPath(); x.moveTo(40,336); x.bezierCurveTo(14,312,24,292,40,300); x.bezierCurveTo(56,292,66,312,40,336); x.fill();
    rr(x,90,306,100,10,5,'#3a424c'); rr(x,16,356,208,10,5,'#3a424c'); rr(x,16,376,140,10,5,'#3a424c');
    tex.t.needsUpdate=true;
  }
  S.bunny.group.position.set(0,0,6);
  var lastLike=-1;
  return function(t,dt){
    drawPhone(t);
    var c=t%2, liking=c>1.0&&c<1.5, hop=liking?Math.sin(Math.PI*(c-1)/.5):0;
    var P={yaw:-.75,lean:.06,h:hop*10,crouch:0,sq:-.06*hop,blink:1-.92*tri(t%3.3,1.2,.07),mouth:liking?'joy':'smile',brow:liking?-2.5:0,
      footF:[10,0],footB:[-10,0],handF:[22,-6+Math.sin(t*2)*1.5],handB:[16+Math.sin(t*6)*2,6-Math.max(0,Math.sin(t*6))*4],earA:-.2-hop*.3,kick:0};
    var r=S.bunny.update(P,dt);
    var o=S.bunny.group, sx=o.position.x+Math.sin(-.75)*0, sc=1;
    // téléphone dans la main avant : on le place au gant (en coordonnées monde approximatives)
    var yaw=-.75, hx=r.handF[0], hy=-r.handF[1];
    phone.position.set(o.position.x+hx*Math.cos(yaw)+17*Math.sin(yaw)*-1+4,hy+20,o.position.z+(-hx)*Math.sin(yaw)+17*Math.cos(yaw)+8);
    phone.rotation.set(-.1,-.25,.08);
    // icônes
    icons.forEach(function(ic){
      var u=((t*.45+ic.off)%1), a=u<.15?u/.15:(u>.7?1-(u-.7)/.3:1);
      ic.sp.position.set(phone.position.x+ic.xo*(.4+u*1.2), phone.position.y+16+u*80, phone.position.z+6);
      ic.sp.material.opacity=a*.95; ic.sp.scale.setScalar(7+u*9);
      if(!ic._p||t%2<.02||ic._acc!==accentCss()){paintIcon(ic);ic._p=1;ic._acc=accentCss()}
    });
    S.shadow.scale.set(60,60,1); S.shadow.position.set(o.position.x+2,.5,o.position.z);
  };
}

// ---------- boucle commune ----------
var builders={web:sceneWeb,video:sceneVideo,digital:sceneDigital};
document.querySelectorAll('canvas[data-scene]').forEach(function(cv){
  var b=builders[cv.getAttribute('data-scene')]; if(!b) return;
  var S=makeStage(cv); if(!S) return;
  var anim=b(S,cv), vis=false, last=0, t=+(new URLSearchParams(location.search).get('t'))||0, raf=0;
  function frame(now){
    raf=0; if(!vis||document.hidden) return;
    var dt=Math.min(.04,(now-last)/1000||.016); last=now; t+=dt;
    anim(t,dt); S.renderer.render(S.scene,S.cam);
    if(!reduce) raf=requestAnimationFrame(frame);
  }
  function start(){ if(!raf){last=performance.now(); raf=requestAnimationFrame(frame)} }
  if('IntersectionObserver' in window) new IntersectionObserver(function(es){vis=es[0].isIntersecting; if(vis) start()},{threshold:.1}).observe(cv); else {vis=true;start()}
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&vis)start()});
  if(reduce){ vis=true; t=3.2; anim(t,.016); anim(t,.016); S.renderer.render(S.scene,S.cam) }
  cv.classList.add('live');
});
