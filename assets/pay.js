// Page de paiement : lit la référence dans l'adresse, interroge le Worker et affiche l'état du paiement.
(function(){
  var api=((window.KINEO&&window.KINEO.api)||"").replace(/\/$/,"");
  var $=function(id){return document.getElementById(id)};
  var panels=["closed","ask","load","pending","manual","declared","paid","failed","unknown"];
  document.body.setAttribute("data-paymode",(window.KINEO&&window.KINEO.mode)||"manual");
  function show(name){panels.forEach(function(p){var el=$("pay-"+p); if(el) el.hidden=(p!==name)})}
  function fill(root,d){root.querySelectorAll("[data-f]").forEach(function(el){var k=el.getAttribute("data-f"); if(d[k]!=null) el.textContent=d[k]})}
  function fcfa(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g," ")+" FCFA"}
  function fdate(iso){try{return new Date(iso).toLocaleString("fr-FR",{dateStyle:"long",timeStyle:"short"})}catch(e){return ""}}
  function el(tag,cls,text){var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e}

  var m=location.search.match(/[?&]ref=([A-Za-z0-9]{6,32})/);
  var ref=m?m[1].toUpperCase():"";
  if(!api){show("closed");return}
  if(!ref){
    show("ask");
    $("pay-form").addEventListener("submit",function(e){e.preventDefault(); var v=$("pay-ref").value.replace(/[^A-Za-z0-9]/g,"").toUpperCase(); if(v) location.search="?ref="+v});
    return;
  }

  var timer=null, tries=0, shownPaid=false, builtManual=false;
  function copyBtn(text){
    var b=el("button","copy","Copier"); b.type="button";
    b.addEventListener("click",function(){
      var done=function(){b.textContent="Copié"; setTimeout(function(){b.textContent="Copier"},1600)};
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done,function(){});
    });
    return b;
  }
  function buildManual(ins){
    var ul=$("pay-ops"), sel=$("pay-method"); ul.textContent=""; sel.textContent="";
    (ins.operators||[]).forEach(function(o){
      var li=el("li"); li.appendChild(el("span","op",o.operator)); li.appendChild(el("span","num",o.number)); li.appendChild(copyBtn(o.number.replace(/\s+/g,""))); ul.appendChild(li);
      var op=el("option",null,o.operator); op.value=o.operator; sel.appendChild(op);
    });
    if(ins.bank){
      var li2=el("li","bank"); li2.appendChild(el("span","op","Virement bancaire"));
      var det=el("span","num"); det.textContent=[ins.bank.bank,ins.bank.holder,ins.bank.rib].filter(Boolean).join(" · "); li2.appendChild(det); li2.appendChild(copyBtn(ins.bank.rib)); ul.appendChild(li2);
      var op2=el("option",null,"Virement bancaire"); op2.value="Virement bancaire"; sel.appendChild(op2);
    }
    $("pay-holder").textContent=ins.holder?"Mobile Money : au nom de "+ins.holder.replace(/\.$/,"")+".":"";
    builtManual=true;
  }
  function render(d){
    document.body.setAttribute("data-paymode",d.mode||"cinetpay");
    var data={label:d.label,amount:fcfa(d.amount),ref:d.ref,date:fdate(d.paidAt)};
    if(d.status==="paid"){
      fill($("pay-paid"),data); show("paid");
      if(!shownPaid){shownPaid=true; var host=$("pay-win"); if(host&&!host.firstChild){var c=document.createElement("canvas"); c.setAttribute("data-scene","win"); c.setAttribute("aria-hidden","true"); host.appendChild(c); window.dispatchEvent(new Event("kineo:scene"))}}
      stop(); return;
    }
    if(d.status==="failed"){fill($("pay-failed"),data); show("failed"); stop(); return}
    if(d.status==="declared"){fill($("pay-declared"),data); show("declared"); return}
    if(d.mode==="manual"){ if(!builtManual&&d.instructions) buildManual(d.instructions); fill($("pay-manual"),data); show("manual"); return }
    fill($("pay-pending"),data); $("pay-go").href=d.url||"#"; show("pending");
  }
  function stop(){if(timer){clearInterval(timer);timer=null}}
  function load(first){
    fetch(api+"/pay/status?ref="+encodeURIComponent(ref),{cache:"no-store"}).then(function(r){
      if(r.status===404){show("unknown");stop();return null}
      return r.json();
    }).then(function(d){if(d) render(d)}).catch(function(){ if(first) show("unknown") });
  }
  var form=$("pay-declare");
  if(form) form.addEventListener("submit",function(e){
    e.preventDefault();
    var btn=form.querySelector("button"); btn.disabled=true;
    fetch(api+"/pay/declare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ref:ref,operator:$("pay-method").value,txref:$("pay-tx").value})})
      .then(function(){load(false)}).catch(function(){}).then(function(){btn.disabled=false});
  });
  show("load"); load(true);
  // En attente : on revérifie toutes les 5 secondes (environ 20 minutes au plus).
  timer=setInterval(function(){ if(document.hidden) return; if(++tries>240) return stop(); load(false) },5000);
})();
