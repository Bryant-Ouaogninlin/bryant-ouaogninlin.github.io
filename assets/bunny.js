// Lapin 3D réutilisable (squelette procédural + cinématique inverse) — utilisé par les scènes de services
import * as THREE from './vendor/three.module.min.js';
var lerp=function(a,b,u){return a+(b-a)*u};
var cl=function(v,a,b){return Math.min(b,Math.max(a,v))};

export function createBunny(){
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
    var R=new THREE.Group(), Q=new THREE.Group(); R.add(Q);
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


  function update(P,dt){
    P=P||{}; dt=cl(dt||.016,.001,.04);
    var lean=P.lean==null?.05:P.lean, crouch=P.crouch||0, h=P.h||0, sq=P.sq||0, yaw=P.yaw==null?-.5:P.yaw, tuck=P.tuck||0;
    var Px=0, Py=-(legH-crouch+h);
    var Sx=Px+30*Math.sin(lean), Sy=Py-30*Math.cos(lean);
    var ha=lean*.5-.05+(P.ha||0), Hx=Sx+27*Math.sin(ha), Hy=Sy-27*Math.cos(ha), hr=ha*.8+(P.hr||0);
    var fF=(P.footF||[10,0]).slice(), fB=(P.footB||[-10,0]).slice();
    fF[1]-=h*.88+tuck; fB[1]-=h*.88+tuck*1.25;
    var hipF=[Px+4,Py+6], hipB=[Px-4,Py+6];
    var kF=ik(hipF[0],hipF[1],fF[0],fF[1],L1,L2,-1), kB=ik(hipB[0],hipB[1],fB[0],fB[1],L1,L2,-1);
    limb3(legF,hipF,[kF.kx,kF.ky],[kF.ex,kF.ey],9); limb3(legB,hipB,[kB.kx,kB.ky],[kB.ex,kB.ey],-9);
    pawF.position.set(kF.ex,-kF.ey,9); pawF.rotation.z=-(P.footAngF||0); pawB.position.set(kB.ex,-kB.ey,-9); pawB.rotation.z=-(P.footAngB||0);
    var hf=P.handF||[4,22], hb=P.handB||[-3,23];
    var sF=[Sx,Sy], sB=[Sx-3,Sy+1];
    var aF=ik(sF[0],sF[1],sF[0]+hf[0],sF[1]+hf[1],A1,A2,P.elbowF==null?1:P.elbowF), aB=ik(sB[0],sB[1],sB[0]+hb[0],sB[1]+hb[1],A1,A2,P.elbowB==null?1:P.elbowB);
    limb3(armF,sF,[aF.kx,aF.ky],[aF.ex,aF.ey],17); limb3(armB,sB,[aB.kx,aB.ky],[aB.ex,aB.ey],-17);
    gloveF.position.set(aF.ex,-aF.ey,17); gloveB.position.set(aB.ex,-aB.ey,-17);
    body.position.set((Px+Sx)/2+1,-(Py+Sy)/2,0); body.rotation.z=-lean;
    haunchF.position.set(Px,-(Py+5),10); haunchB.position.set(Px,-(Py+5),-10);
    tail.position.set(Px-21,-(Py+3),0);
    head.position.set(Hx,-Hy,0); head.rotation.z=-hr;
    var b=Math.max(.08,P.blink==null?1:P.blink), br=P.brow||0, mouth=P.mouth||'smile';
    eyes.forEach(function(e_){e_.g.scale.y=b; e_.brow.rotation.x=e_.s*br*.07; e_.brow.position.y=16-br*.25});
    var joy=mouth==='joy', strn=mouth==='strain';
    smile.visible=!joy; smile.scale.y=strn?.12:1; mJoy.visible=joy; tongue.visible=joy; tooth.visible=!joy&&!strn;
    var base_=P.earA==null?-.2:P.earA;
    springs(dt,base_,base_*.85-.1,P.kick||0);
    var ca=Math.cos(hr), sa=Math.sin(hr);
    function hp(lx,ly){return [Hx+lx*ca-ly*sa, Hy+lx*sa+ly*ca]}
    var bB=hp(-11,-24), bF=hp(10,-25);
    ear3(earB,bB[0],bB[1],sp[1].a+hr-.4,50,-sp[1].w*1.1-11,-9);
    ear3(earF,bF[0],bF[1],sp[0].a+hr,58,-sp[0].w*1.1,9);
    R.rotation.y=yaw; Q.scale.set(1-.55*sq,1+sq,1-.55*sq);
    return {shoulder:sF,head:[Hx,Hy],handF:[aF.ex,aF.ey],handB:[aB.ex,aB.ey]};
  }
  return {group:R,update:update,parts:{head:head,gloveF:gloveF,gloveB:gloveB}};
}
