(function(){
  var root=document.documentElement, begin=window.kineoBegin;
  if(!root.classList.contains('intro-on')) return;
  // Intro : un lapin 3D (three.js) au squelette procédural pousse « ki » vers « néo »
  var intro=document.getElementById('intro');
  function runIntro(THREE){
    var $=function(i){return document.getElementById(i)};
    var cv=$('rig3d'), push=$('push'), neo=$('neo'), bl=$('bl'), word=intro.querySelector('.word');
    var W=innerWidth, H=innerHeight, renderer;
    try{renderer=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true})}catch(e){return false}
    renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); renderer.setSize(W,H,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
    var scene=new THREE.Scene();
    var cam=new THREE.OrthographicCamera(0,W,H,0,.1,6000); cam.position.z=3000;
    var cl=function(v,a,b){return Math.min(b,Math.max(a,v))};
    var sg=function(t,a,b){return cl((t-a)/(b-a),0,1)};
    var lerp=function(a,b,u){return a+(b-a)*u};
    var eOut=function(u){return 1-Math.pow(1-u,3)};
    var eIO=function(u){return u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2};
    var eIn=function(u){return u*u};
    var tri=function(t,a,w){return Math.max(0,1-Math.abs(t-a)/w)};

    // --- lumières : doux, avec un contre-jour orange (la couleur de la marque) ---
    scene.add(new THREE.HemisphereLight(0xffffff,0x4a3d44,1.15));
    var key=new THREE.DirectionalLight(0xfff1e2,2.6); key.position.set(-400,700,900); scene.add(key);
    var rim=new THREE.DirectionalLight(0xff5a1f,3.2); rim.position.set(600,300,-700); scene.add(rim);
    var fill=new THREE.DirectionalLight(0xbfd2ff,.7); fill.position.set(500,-200,600); scene.add(fill);

    // --- matériaux : fourrure veloutée, yeux laqués ---
    var fur=new THREE.MeshPhysicalMaterial({color:0xfbf9f6,roughness:.92,metalness:0,sheen:1,sheenRoughness:.5,sheenColor:new THREE.Color(0xffffff)});
    var furB=new THREE.MeshPhysicalMaterial({color:0xe8e5df,roughness:.92,metalness:0,sheen:1,sheenRoughness:.5,sheenColor:new THREE.Color(0xffffff)});
    var pink=new THREE.MeshStandardMaterial({color:0xf29aa9,roughness:.6});
    var pinkIn=new THREE.MeshStandardMaterial({color:0xf7aebb,roughness:.75});
    var pinkInB=new THREE.MeshStandardMaterial({color:0xe493a1,roughness:.75});
    var blush=new THREE.MeshBasicMaterial({color:0xf6a0b0,transparent:true,opacity:.5,depthWrite:false});
    var eyeM=new THREE.MeshPhysicalMaterial({color:0x14101a,roughness:.12,clearcoat:1,clearcoatRoughness:.05});
    var white=new THREE.MeshBasicMaterial({color:0xffffff});
    var dark=new THREE.MeshStandardMaterial({color:0x6e2f3c,roughness:.6});
    var brow=new THREE.MeshStandardMaterial({color:0xb9a09a,roughness:.8});
    var SG=new THREE.SphereGeometry(1,40,28), CG=new THREE.CylinderGeometry(1,1,1,24);
    var ell=function(mat,a,b,c,par,x,y,z){var m=new THREE.Mesh(SG,mat);m.scale.set(a,b,c);m.position.set(x||0,y||0,z||0);(par||Q).add(m);return m};

    // --- personnage ---
    var R=new THREE.Group(), Q=new THREE.Group(); R.add(Q); scene.add(R);
    var head=new THREE.Group(); head.scale.setScalar(1.22); Q.add(head);
    ell(fur,27,24,25,head);
    ell(fur,12,9.5,10,head,19,-9,7); ell(fur,12,9.5,10,head,19,-9,-7);
    ell(pink,3.8,2.8,3.8,head,28.4,-4,0);
    [1,-1].forEach(function(s_){
      var b=ell(blush,1.2,6,6.5,head,18,-6,17.3*s_); b.rotation.y=-s_*.85;
    });
    var eyes=[];
    [1,-1].forEach(function(s_){
      var g=new THREE.Group(); g.position.set(21.4,3.8,14*s_); g.rotation.y=-s_*.646; head.add(g);
      ell(eyeM,2.9,8.6,7,g);
      ell(white,2.6,2.6,2.6,g,2.3,3.4,-1.6); ell(white,1.2,1.2,1.2,g,2.4,-3.4,1.8);
      var bw=ell(brow,1,.9,5,head,14,16,12*s_); bw.rotation.y=-s_*.9;
      eyes.push({g:g,brow:bw,s:s_});
    });
    var smile=new THREE.Mesh(new THREE.TorusGeometry(3.6,.6,8,22,Math.PI),dark); smile.rotation.set(0,-Math.PI/2,Math.PI); smile.position.set(30.8,-11.2,0); head.add(smile);
    var mJoy=ell(dark,1.8,4.4,5.6,head,30,-13.6,0), tongue=ell(pink,1.3,2,3.7,head,30.8,-16,0);
    var tooth=ell(white,1.6,3,2.2,head,31.2,-14.6,0);
    var body=ell(fur,24,30,26), haunchF=ell(fur,18,16,18), haunchB=ell(furB,18,16,18), tail=ell(fur,8,8,8);
    function mkEar(m,mi){var o=[],n=[];for(var i=0;i<16;i++){o.push(ell(m,1,1,1));n.push(ell(mi,1,1,1))}return{o:o,n:n}}
    var earF=mkEar(fur,pinkIn), earB=mkEar(furB,pinkInB);
    function mkLimb(m,r){var c1=new THREE.Mesh(CG,m),c2=new THREE.Mesh(CG,m);c1.userData.r=r;c2.userData.r=r;
      var j1=ell(m,r,r,r),j2=ell(m,r,r,r);Q.add(c1,c2);return{c1:c1,c2:c2,j1:j1,j2:j2,r:r}}
    var legF=mkLimb(fur,8.6), legB=mkLimb(furB,8.6), armF=mkLimb(fur,6.8), armB=mkLimb(furB,6.8);
    function mkPaw(m,p){var g=new THREE.Group();Q.add(g);ell(m,14,8.2,10,g,5,5.5,0);ell(p,5,2,3.6,g,4,2.2,0);return g}
    var pawF=mkPaw(fur,pink), pawB=mkPaw(furB,pinkInB);
    var gloveF=ell(fur,8.5,8.5,8.5), gloveB=ell(furB,8.5,8.5,8.5);

    // ombre portée douce
    var cvs=document.createElement('canvas'); cvs.width=cvs.height=128; var cx=cvs.getContext('2d'), gr=cx.createRadialGradient(64,64,0,64,64,64);
    gr.addColorStop(0,'rgba(0,0,0,.85)'); gr.addColorStop(.6,'rgba(0,0,0,.35)'); gr.addColorStop(1,'rgba(0,0,0,0)'); cx.fillStyle=gr; cx.fillRect(0,0,128,128);
    var shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cvs),transparent:true,depthWrite:false})); shadow.position.z=-400; scene.add(shadow);
    // poussière
    var cw=document.createElement('canvas'); cw.width=cw.height=64; var cw2=cw.getContext('2d'), gw=cw2.createRadialGradient(32,32,0,32,32,32); gw.addColorStop(0,'rgba(242,241,236,1)'); gw.addColorStop(.55,'rgba(242,241,236,.55)'); gw.addColorStop(1,'rgba(242,241,236,0)'); cw2.fillStyle=gw; cw2.fillRect(0,0,64,64); var puffTex=new THREE.CanvasTexture(cw);
    var puffs=[]; for(var i=0;i<10;i++){var pm=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:puffTex,transparent:true,opacity:0,depthWrite:false}));pm.position.z=-300;scene.add(pm);puffs.push({m:pm,t0:-1e9,x:0,y:0,vx:0,r:0})}
    var pi_=0;
    function spawn(t,x,y,vx,r){var p=puffs[pi_++%puffs.length];p.t0=t;p.x=x;p.y=y;p.vx=vx;p.r=r}

    // --- mesures ---
    var fs=parseFloat(getComputedStyle(word).fontSize), sc=fs*1.3/150, gap=fs*.95;
    push.style.transform='none';
    var base=bl.getBoundingClientRect().bottom;
    var kiL0=push.getBoundingClientRect().left-gap;
    var reachU=40, xContact=kiL0-3-reachU*sc;
    var x0=-110*sc, xPlace=xContact-34*sc, xOff=-130*sc;
    push.style.transform='translateX('+(-gap)+'px)';
    R.scale.setScalar(sc);

    // --- cinématique inverse (plan XY du squelette) ---
    var legH=26, L1=15.5, L2=15.5, A1=15, A2=15;
    function ik(ax,ay,tx,ty,l1,l2,sd){
      var dx=tx-ax, dy=ty-ay, d=Math.max(1e-3,Math.hypot(dx,dy)), ux=dx/d, uy=dy/d;
      var dm=Math.min(d,l1+l2-.01), a=(l1*l1-l2*l2+dm*dm)/(2*dm), h=Math.sqrt(Math.max(0,l1*l1-a*a));
      return {kx:ax+ux*a-uy*h*sd, ky:ay+uy*a+ux*h*sd, ex:ax+ux*dm, ey:ay+uy*dm};
    }
    var UP=new THREE.Vector3(0,1,0), d_=new THREE.Vector3();
    function seg(m,ax,ay,bx,by,z){
      d_.set(bx-ax,-(by-ay),0); var L=d_.length()||1e-3;
      m.position.set((ax+bx)/2,-(ay+by)/2,z); m.quaternion.setFromUnitVectors(UP,d_.multiplyScalar(1/L)); m.scale.set(m.userData.r,L,m.userData.r);
    }
    function limb3(Lb,a,k,e,z){
      seg(Lb.c1,a[0],a[1],k[0],k[1],z); seg(Lb.c2,k[0],k[1],e[0],e[1],z);
      Lb.j1.position.set(a[0],-a[1],z); Lb.j2.position.set(k[0],-k[1],z);
    }
    function qb(p0,c,p1,u){var v=1-u;return [v*v*p0[0]+2*v*u*c[0]+u*u*p1[0], v*v*p0[1]+2*v*u*c[1]+u*u*p1[1]]}
    function ear3(Ear,bx,by,th,len,flop,z){
      var sx=Math.sin(th), cy=-Math.cos(th);
      var p0=[bx,by], p1=[bx+len*sx,by+len*cy], c=[bx+.5*len*sx+Math.cos(th)*flop, by+.5*len*cy+Math.sin(th)*flop];
      for(var i=0;i<16;i++){var u=i/15, q=qb(p0,c,p1,u), r=lerp(10.6,6.6,Math.pow(u,1.2));
        Ear.o[i].position.set(q[0],-q[1],z); Ear.o[i].scale.set(r,r*.95,r*.5);
        Ear.n[i].position.set(q[0],-q[1],z+r*.42); Ear.n[i].scale.set(r*.66,r*.9,r*.2); Ear.n[i].visible=(i>=2&&i<=13);
      }
    }
    var sp=[{a:-.2,w:0,k:230,c:15},{a:-.3,w:0,k:190,c:13}];
    function springs(dt,t1,t2,kick){
      var tg=[t1,t2];
      for(var i=0;i<2;i++){var s_=sp[i]; if(kick) s_.w+=kick*(i?.8:1); var acc=s_.k*(tg[i]-s_.a)-s_.c*s_.w; s_.w+=acc*dt; s_.a+=s_.w*dt}
    }

    // --- boucle d'animation ---
    var phase=0, xPrev=x0, v=0, hPrev=0, tPrev=0, lastDust=0, fired={}, raf=0, done=false, skipped=false, ST={t0:0};
    function frame(now){
      if(done) return;
      var t=now-ST.t0, dt=cl((t-tPrev)/1000,.001,.04), dtms=dt*1000; tPrev=t;

      var x, pushOff=0, h=0, crouch=0, sq=0;
      if(t<300) x=x0;
      else if(t<1800) x=lerp(x0,xPlace,eOut(sg(t,300,1800)));
      else if(t<2150) x=xPlace;
      else if(t<2600) x=lerp(xPlace,xContact,eIO(sg(t,2150,2600)));
      else if(t<2750) x=xContact;
      else if(t<3850){var e=eIO(sg(t,2750,3850)); pushOff=gap*e; x=xContact+pushOff}
      else { pushOff=gap; x=xContact+gap-14*sc*eOut(sg(t,3850,4050)) }
      var xs=xContact+gap-14*sc;
      if(t>=5420) x=lerp(xs,xOff,eIn(sg(t,5420,6100)));
      push.style.transform='translateX('+(pushOff-gap)+'px)';
      var bump=Math.sin(Math.PI*sg(t,3850,4090)); neo.style.transform='translateX('+(bump*.035*fs)+'px)';

      var dx=x-xPrev; xPrev=x; var vi=Math.abs(dx)/Math.max(1,dtms); v=lerp(v,vi,.35);
      var clv=cl(v/.35,0,1), mv=cl(v/.04,0,1);
      var S=5+8*clv, Lf=3+7*clv;
      phase+=Math.min(Math.abs(dx)*Math.PI/(2*S*sc), dt*28);

      var jumpU=sg(t,4250,4750);
      if(t>=4250&&t<4750) h=60*4*jumpU*(1-jumpU);
      var tuck=(t>=4250&&t<4750)?9*Math.sin(Math.PI*jumpU):0;
      var squat=eIO(sg(t,3950,4250))*(1-sg(t,4250,4290));
      var land=(t>=4750)?Math.exp(-(t-4750)/110)*Math.cos((t-4750)/55):0;
      var rebound=(t>=3850&&t<4050)?Math.sin(Math.PI*sg(t,3850,4050)):0;
      var pushW=eIO(sg(t,2500,2750))*(1-eIO(sg(t,3850,4000)));
      crouch=4*pushW+9*squat+8*Math.max(0,land)+3*rebound;
      sq=-.11*squat-.17*Math.max(0,land)-.08*rebound+(t>=4290&&t<4750?.1*Math.sin(Math.PI*jumpU):0);

      // orientation 3D : trois quarts face caméra, de profil pour pousser, face caméra pour fêter, demi-tour
      var yaw=lerp(-.55,-.1,pushW);
      yaw=lerp(yaw,-1.05,eIO(sg(t,4050,4300)));
      if(t>=5300) yaw=lerp(-1.05,-2.64,eIO(sg(t,5300,5520)));

      var lean=lerp(lerp(-.04,.26,clv),.44,pushW);
      lean=lerp(lean,.02,sg(t,4050,4250)*(t<5300?1:0));
      var bob=7*clv*Math.abs(Math.sin(phase));
      var Px=0, Py=-(legH-crouch+bob+h);
      var Sx=Px+30*Math.sin(lean), Sy=Py-30*Math.cos(lean);
      var ha=lean*.5-.05, Hx=Sx+27*Math.sin(ha), Hy=Sy-27*Math.cos(ha), hr=ha*.8+.05*Math.sin(2*phase)*mv;

      // pieds
      var cxF=6*pushW, cxB=-10*pushW;
      function foot(ph,cx,idleX){
        var cyc=[cx-S*Math.cos(ph), -Lf*Math.max(0,Math.sin(ph))];
        return [lerp(idleX+cx,cyc[0],mv), lerp(0,cyc[1],mv)];
      }
      var fF=foot(phase,cxF,10), fB=foot(phase+Math.PI,cxB,-10);
      fF[1]-=h*.88+tuck; fB[1]-=h*.88+tuck*1.25; if(h>0){fF[0]+=6;fB[0]-=4}
      var angF=-.5*(-fF[1]>1?1:0)*cl(-fF[1]/Lf,0,1)*mv-.5*Math.min(1,tuck/9);
      var angB=-.5*(-fB[1]>1?1:0)*cl(-fB[1]/Lf,0,1)*mv-.5*Math.min(1,tuck/9);
      var hipF=[Px+4,Py+6], hipB=[Px-4,Py+6];
      var kF=ik(hipF[0],hipF[1],fF[0],fF[1],L1,L2,-1), kB=ik(hipB[0],hipB[1],fB[0],fB[1],L1,L2,-1);
      limb3(legF,hipF,[kF.kx,kF.ky],[kF.ex,kF.ey],9); limb3(legB,hipB,[kB.kx,kB.ky],[kB.ex,kB.ey],-9);
      pawF.position.set(kF.ex,-kF.ey,9); pawF.rotation.z=-angF; pawB.position.set(kB.ex,-kB.ey,-9); pawB.rotation.z=-angB;

      // bras (en 3D les mains se posent sur le bord de « ki » malgré la rotation du lapin)
      var armPush=eIO(sg(t,2300,2650))*(1-eIO(sg(t,3850,4050)));
      var armUp=eIO(sg(t,4250,4400))*(1-eIO(sg(t,5200,5320)));
      var strain=pushW, jit=Math.sin(t/38)*1.1*strain, cyw=Math.cos(yaw), syw=Math.sin(yaw);
      function hand(front){
        var o=front?0:1, ph=phase+o*Math.PI, z=front?17:-17, sx=Sx-(front?0:3), sy=Sy+(front?0:1);
        var idle=[sx+4-(front?0:7)+.8*Math.sin(t/520+o), sy+22];
        var run=[sx+6+10*Math.cos(ph), sy+16-6*Math.cos(ph)];
        var hh=[lerp(idle[0],run[0],mv), lerp(idle[1],run[1],mv)];
        var pu=[(reachU-z*syw)/cyw-(front?0:3)+jit, -(front?46:42)+jit*.6];
        hh=[lerp(hh[0],pu[0],armPush), lerp(hh[1],pu[1],armPush)];
        var up=[sx+(front?13:-2)+(front&&t>4900&&t<5300?5*Math.sin(t/85):0), sy-(front?22:26)];
        hh=[lerp(hh[0],up[0],armUp), lerp(hh[1],up[1],armUp)];
        return {s:[sx,sy],h:hh,z:z};
      }
      var hF=hand(true), hB=hand(false);
      var aF=ik(hF.s[0],hF.s[1],hF.h[0],hF.h[1],A1,A2,1), aB=ik(hB.s[0],hB.s[1],hB.h[0],hB.h[1],A1,A2,1);
      limb3(armF,hF.s,[aF.kx,aF.ky],[aF.ex,aF.ey],17); limb3(armB,hB.s,[aB.kx,aB.ky],[aB.ex,aB.ey],-17);
      gloveF.position.set(aF.ex,-aF.ey,17); gloveB.position.set(aB.ex,-aB.ey,-17);

      // corps
      body.position.set((Px+Sx)/2+1,-(Py+Sy)/2,0); body.rotation.z=-lean;
      haunchF.position.set(Px,-(Py+5),10); haunchB.position.set(Px,-(Py+5),-10);
      tail.position.set(Px-21+2*Math.sin(t/160),-(Py+3+1.5*Math.sin(t/190)),0);

      // tête et visage
      head.position.set(Hx,-Hy,0); head.rotation.z=-hr;
      var blink=Math.max(tri(t,1960,90),tri(t,3300,90),tri(t,5050,90),tri(t,2420,90));
      var b=Math.max(.08,1-blink*.95)*(1-.3*pushW);
      var joy=t>=4250&&t<5330, strn=pushW>.5, br=strn?3.5:(joy?-2.5:0);
      eyes.forEach(function(e_){e_.g.scale.y=b; e_.brow.rotation.x=e_.s*br*.07; e_.brow.position.y=16-br*.25});
      smile.visible=!joy; smile.scale.y=strn?.12:1; mJoy.visible=joy; tongue.visible=joy; tooth.visible=!joy&&!strn;

      // oreilles (ressorts : traînent derrière, rebondissent à l'arrivée)
      var vh=(h-hPrev)/Math.max(1,dtms); hPrev=h;
      var base_=-.9*cl(v/.35,0,1.2)-vh*1.6+.25*lean+.05*Math.sin(t/400);
      var kick=0; if(!fired.imp&&t>=3850){fired.imp=1;kick=-7} if(!fired.lnd&&t>=4750){fired.lnd=1;kick=-9}
      springs(dt,base_,base_*.85-.1,kick);
      var ca=Math.cos(hr), sa=Math.sin(hr);
      function hp(lx,ly){return [Hx+lx*ca-ly*sa, Hy+lx*sa+ly*ca]}
      var bB=hp(-11,-24), bF=hp(10,-25);
      ear3(earB,bB[0],bB[1],sp[1].a+hr-.4,50,-sp[1].w*1.1-11,-9);
      ear3(earF,bF[0],bF[1],sp[0].a+hr,58,-sp[0].w*1.1,9);

      // poussière
      if(t>1350&&t<1800&&t-lastDust>75){lastDust=t;spawn(t,x-18*sc,base,-.5,6*sc+3)}
      if(!fired.ps&&t>=2750){fired.ps=1;spawn(t,x-22*sc,base,-.6,7*sc);spawn(t,x-10*sc,base,-.3,5*sc)}
      if(!fired.tk&&t>=4250){fired.tk=1;spawn(t,x-12*sc,base,-.6,8*sc);spawn(t,x+14*sc,base,.6,8*sc)}
      if(!fired.ld&&t>=4750){fired.ld=1;spawn(t,x-16*sc,base,-.9,10*sc);spawn(t,x+18*sc,base,.9,10*sc);spawn(t,x,base,0,8*sc)}
      if(t>5430&&t-lastDust>75&&t<5900){lastDust=t;spawn(t,x+16*sc,base,.5,6*sc+3)}
      puffs.forEach(function(p){var u=(t-p.t0)/600; if(u<0||u>1){p.m.material.opacity=0;return}
        p.m.position.set(p.x+p.vx*u*60, H-(p.y-u*16*sc-p.r*.4), -300); p.m.scale.setScalar(p.r*(.5+1.1*u)); p.m.material.opacity=.6*(1-u)});
      var shk=1-.5*cl(h/80,0,1);
      shadow.position.set(x+2*sc,H-(base+3),-400); shadow.scale.set(64*sc*shk*(1-.4*sq),12*sc*shk,1); shadow.material.opacity=.9*shk;

      // transformation globale
      R.position.set(x,H-base,0); R.rotation.y=yaw;
      Q.scale.set(1-.55*sq,1+sq,1-.55*sq);

      renderer.render(scene,cam);

      if(t>=5900&&!fired.cur){fired.cur=1;setTimeout(function(){if(!skipped)begin()},320);
        var a=intro.animate([{transform:'translateY(0)'},{transform:'translateY(-100%)'}],{duration:900,easing:'cubic-bezier(.7,0,.2,1)',fill:'forwards'});
        a.finished.then(function(){finish()}).catch(function(){})}
      raf=requestAnimationFrame(frame);
    }
    function finish(){
      if(done) return; done=true; cancelAnimationFrame(raf);
      try{renderer.dispose()}catch(e){}
      root.classList.remove('intro-on'); intro.style.display='none';
      try{sessionStorage.setItem('kineoIntro','1')}catch(e){}
      begin();
    }
    document.getElementById('skip').addEventListener('click',function(){skipped=true;finish()});
    var go=function(){ST.t0=performance.now();raf=requestAnimationFrame(frame)};
    if(document.fonts&&document.fonts.ready) Promise.race([document.fonts.ready,new Promise(function(r){setTimeout(r,1500)})]).then(function(){if(!skipped)go()}); else go();
    return true;
  }
  function skipIntro(){root.classList.remove('intro-on');intro.style.display='none';begin()}
  import('./vendor/three.module.min.js').then(function(T){ if(!runIntro(T)) skipIntro() }).catch(skipIntro);
})();
