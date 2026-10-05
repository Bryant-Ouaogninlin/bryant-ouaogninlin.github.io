// Page de paiement : lit la référence dans l'adresse, interroge le Worker et affiche l'état du paiement.
(function(){
  var api=((window.KINEO&&window.KINEO.api)||"").replace(/\/$/,"");
  var $=function(id){return document.getElementById(id)};
  var panels=["closed","ask","load","pending","paid","failed","unknown"];
  function show(name){panels.forEach(function(p){var el=$("pay-"+p); if(el) el.hidden=(p!==name)})}
  function fill(root,d){
    root.querySelectorAll("[data-f]").forEach(function(el){var k=el.getAttribute("data-f"); if(d[k]!=null) el.textContent=d[k]});
  }
  function fcfa(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g," ")+" FCFA"}
  function fdate(iso){try{return new Date(iso).toLocaleString("fr-FR",{dateStyle:"long",timeStyle:"short"})}catch(e){return ""}}

  var m=location.search.match(/[?&]ref=([A-Za-z0-9]{6,32})/);
  var ref=m?m[1].toUpperCase():"";
  if(!api){show("closed");return}
  if(!ref){
    show("ask");
    $("pay-form").addEventListener("submit",function(e){e.preventDefault(); var v=$("pay-ref").value.replace(/[^A-Za-z0-9]/g,"").toUpperCase(); if(v) location.search="?ref="+v});
    return;
  }

  var timer=null, tries=0, shownPaid=false;
  function render(d){
    var data={label:d.label,amount:fcfa(d.amount),ref:d.ref,date:fdate(d.paidAt)};
    if(d.status==="paid"){
      fill($("pay-paid"),data); show("paid");
      if(!shownPaid){shownPaid=true; var host=$("pay-win"); if(host&&!host.firstChild){var c=document.createElement("canvas"); c.setAttribute("data-scene","win"); c.setAttribute("aria-hidden","true"); host.appendChild(c); window.dispatchEvent(new Event("kineo:scene"))}}
      stop(); return;
    }
    if(d.status==="failed"){fill($("pay-failed"),data); show("failed"); stop(); return}
    fill($("pay-pending"),data); $("pay-go").href=d.url||"#"; show("pending");
  }
  function stop(){if(timer){clearInterval(timer);timer=null}}
  function load(first){
    fetch(api+"/pay/status?ref="+encodeURIComponent(ref),{cache:"no-store"}).then(function(r){
      if(r.status===404){show("unknown");stop();return null}
      return r.json();
    }).then(function(d){if(d) render(d)}).catch(function(){ if(first) show("unknown") });
  }
  show("load"); load(true);
  // En attente : on revérifie toutes les 5 secondes (environ 20 minutes au plus).
  timer=setInterval(function(){ if(document.hidden) return; if(++tries>240) return stop(); load(false) },5000);
})();
