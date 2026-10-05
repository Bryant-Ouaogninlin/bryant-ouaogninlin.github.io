// Film « Comment ça marche » : une scène 1280×720, une caméra 3D, de la typographie animée, des écrans réalistes.
// Tout est une fonction du temps (render(t)) : lecture, pause, chapitres, ou image figée avec ?film=12.5.
(function () {
  var player = document.getElementById("player");
  if (!player) return;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var vis = player.querySelector(".f-vis"), inner = player.querySelector(".f-in");
  var capT = document.getElementById("fct"), capP = document.getElementById("fcp");
  var tcEl = document.getElementById("ftc"), clipsEl = document.getElementById("fclips"), pp = document.getElementById("fpp");

  var CH = [
    { d: 8, d0: 8, n: "01", s: "Écrire", t: "Vous nous écrivez", p: "Un message sur WhatsApp, un e-mail ou un mot sur TikTok. Dites-nous simplement ce que vous voulez." },
    { d: 7, d0: 7, n: "02", s: "Cadrer", t: "On cadre votre besoin", p: "Pour qui, pour quand, dans quel style : quelques questions suffisent pour partir du bon pied." },
    { d: 8, d0: 8, n: "03", s: "Maquette", t: "On vous montre une maquette", p: "Vous voyez le projet avant qu'il soit fini, pas après." },
    { d: 8, d0: 8, n: "04", s: "Ajuster", t: "On ajuste ensemble", p: "Vos retours, nos corrections, autant de tours que nécessaire." },
    { d: 7, d0: 7, n: "05", s: "En ligne", t: "Mise en ligne", p: "Votre site est publié, et nous vous expliquons comment le prendre en main." },
    { d: 8, d0: 8, n: "06", s: "Vidéo", t: "Et vos vidéos, bien montées", p: "Souvenirs, événements, formats courts pour les réseaux : on garde ce qui compte, on coupe le reste." },
    { d: 8, d0: 8, n: "07", s: "Digital", t: "Et votre présence en ligne", p: "Vos profils, vos visuels et des conseils concrets pour qu'on vous trouve." },
  ];
  var START = [], BODY = 0;
  CH.forEach(function (c) { START.push(BODY); BODY += c.d; });
  var TOTAL = BODY + 5;

  // ---------- outils ----------
  var cl = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var E = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    io: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    spring: function (t) { return t >= 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(t * 11); },
    lin: function (t) { return t; },
  };
  function ramp(t, a, b, e) { return (e || E.out)(cl((t - a) / (b - a))); }
  function path(pts, t) { // [temps, x, y]
    if (t <= pts[0][0]) return { x: pts[0][1], y: pts[0][2] };
    for (var i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) { var a = pts[i - 1], b = pts[i], k = E.io(cl((t - a[0]) / (b[0] - a[0]))); return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k }; }
    }
    var l = pts[pts.length - 1]; return { x: l[1], y: l[2] };
  }
  var TKEYS = ["x", "y", "z", "rx", "ry", "rz", "s", "sx", "sy"];
  function T(e, o) {
    if (!e) return;
    var st = e.style, tr = "", any = false;
    for (var i = 0; i < TKEYS.length; i++) if (o[TKEYS[i]] !== undefined) { any = true; break; }
    if (o.o !== undefined) st.opacity = o.o;
    if (any) {
      if (o.x || o.y || o.z) tr += "translate3d(" + (o.x || 0) + "px," + (o.y || 0) + "px," + (o.z || 0) + "px) ";
      if (o.rx) tr += "rotateX(" + o.rx + "deg) ";
      if (o.ry) tr += "rotateY(" + o.ry + "deg) ";
      if (o.rz) tr += "rotateZ(" + o.rz + "deg) ";
      if (o.s !== undefined) tr += "scale(" + o.s + ") ";
      if (o.sx !== undefined) tr += "scale(" + o.sx + "," + (o.sy === undefined ? o.sx : o.sy) + ") ";
      st.transform = tr || "none";
    }
    if (o.b !== undefined) st.filter = o.b > .1 ? "blur(" + o.b + "px)" : "none";
  }
  function el(p, c, h, css) { var e = document.createElement("div"); if (c) e.className = c; if (h != null) e.innerHTML = h; if (css) e.style.cssText = css; p.appendChild(e); return e; }
  function kw(p, cls, words, size) {
    var b = el(p, "kw " + cls); b._ws = words.map(function (w) { var s = document.createElement("span"); s.className = "w"; s.textContent = w; if (size) s.style.fontSize = size + "px"; b.appendChild(s); return s; });
    return b;
  }
  // mots qui jaillissent un à un (ressort, flou, bascule), puis repartent vers le haut
  function kin(b, t, a, step, out) {
    var ex = out === undefined ? 0 : ramp(t, out, out + .45, E.io);
    b._ws.forEach(function (w, i) {
      var k = ramp(t, a + i * step, a + i * step + .75, E.spring), kk = cl(k * 1.3);
      T(w, { o: kk * (1 - ex), y: (1 - k) * 90 - ex * 70, rx: (1 - k) * -45, b: (1 - kk) * 18 + ex * 14 });
    });
  }
  function mix(c1, c2, k) { return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(c1[i] + (c2[i] - c1[i]) * k); }).join(",") + ")"; }
  var C_OR = [255, 90, 31], C_BL = [31, 143, 255], C_EM = [25, 201, 140];
  var CHECK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="#0e1114" stroke-width="2.4" stroke-linecap="square"/></svg>';
  var CURSOR = '<svg class="fcur" viewBox="0 0 24 24"><path d="M3 2l16 9-7 2-3 7z" fill="#f2f1ec" stroke="#0e1114" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  // maquette de site (réutilisée dans les scènes C, D et E)
  function site(parent, cls, css) {
    var w = el(parent, "bw " + (cls || ""), '<div class="bw-bar"><i></i><i></i><i></i><em>maquette</em></div><div class="bw-page">' +
      '<div class="bw-nav"><b class="bw-logo"></b><span>Accueil</span><span>Services</span><span>Contact</span><u>Écrire</u></div>' +
      '<div class="bw-hero"><div class="bw-txt"><h4 class="bw-h"></h4><p class="bw-p">Un site simple et clair, pensé pour vos clients.</p><span class="bw-btn">Découvrir<i class="rp"></i></span></div>' +
      '<div class="bw-img"><i class="c1"></i><i class="c2"></i><i class="c3"></i></div></div>' +
      '<div class="bw-cards"><div><b>Sur mesure</b><span></span><span></span></div><div><b>Simple à lire</b><span></span><span></span></div><div><b>Sur téléphone</b><span></span><span></span></div></div></div>', css);
    var r = { root: w, page: w.querySelector(".bw-page"), nav: w.querySelector(".bw-nav"), h: w.querySelector(".bw-h"), p: w.querySelector(".bw-p"), btn: w.querySelector(".bw-btn"), rp: w.querySelector(".rp"), img: w.querySelector(".bw-img"), cards: [].slice.call(w.querySelectorAll(".bw-cards div")) };
    r.text = "Votre activité,\nbien présentée.";
    r.type = function (n) { var s = r.text.slice(0, n).replace("\n", "<br>"); r.h.innerHTML = s + (n < r.text.length ? '<span class="caret"></span>' : ""); };
    r.full = function () { r.type(r.text.length); };
    return r;
  }

  // ---------- scènes ----------
  var scenes = [], hudDark = [false, true, false, false, false, false, true, true];
  function scene(build) {
    var r = el(inner, "sc"); var bg = el(r, "bg"); var cam = el(r, "cam");
    scenes.push({ el: r, draw: build(r, bg, cam) });
  }
  function CAM(cam, o) { T(cam, o); }

  // A · vous nous écrivez
  scene(function (r, bg, cam) {
    bg.style.background = "#0b0d10";
    var glow = el(cam, "a-glow"), disc = el(cam, "a-disc");
    var k1 = kw(cam, "a-k1", ["Votre", "idée"]), k2 = kw(cam, "a-k2 stack", ["devient", "un site."]);
    var phone = el(cam, "phone",
      '<i class="ph-notch"></i><div class="ph-head"><i class="ph-av"></i><div><b>Kinéo</b><small>Message</small></div></div>' +
      '<p class="bub me" style="top:112px">Bonjour, je voudrais un site pour mon activité.</p>' +
      '<p class="bub dots" style="top:222px"><i></i><i></i><i></i></p>' +
      '<p class="bub us" style="top:222px">Bonjour ! Parlez-moi de votre projet.</p>' +
      '<p class="bub me" style="top:318px">Quelque chose de simple, pour bientôt.</p>' +
      '<div class="ph-in">Écrire un message</div>');
    var m = [].slice.call(phone.querySelectorAll(".bub.me")), dots = phone.querySelector(".bub.dots"), us = phone.querySelector(".bub.us"), dd = [].slice.call(dots.querySelectorAll("i"));
    var ICON = [
      '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M14 3v11.2a3.5 3.5 0 11-2-3.1V3zM14 3c.5 2.2 2 3.6 4.5 3.9v2.3c-1.8 0-3.2-.6-4.5-1.6z" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    ];
    var NAME = ["WhatsApp", "TikTok", "E-mail"], POS = [[700, 150], [676, 486], [1070, 84]];
    var chips = POS.map(function (p, i) { return el(cam, "chip", "<i>" + ICON[i] + "</i><span>" + NAME[i] + "</span>", "left:" + p[0] + "px;top:" + p[1] + "px"); });
    return function (t) {
      CAM(cam, { z: -240 + t * 30, ry: 5 - t * 1.1, rx: 2 });
      var d = ramp(t, .1, 1.2, E.spring); T(disc, { s: d * 1.2, z: -260, o: cl(d * 3), x: Math.sin(t * .5) * 10, y: Math.cos(t * .4) * 8 });
      T(glow, { o: cl(ramp(t, 0, 1.5)) });
      kin(k1, t, .35, .2, 2.55); kin(k2, t, 2.85, .24);
      var pk = ramp(t, .9, 2.1, E.spring), pc = cl(pk);
      T(phone, { y: (1 - pk) * 780 + Math.sin(t * 1.3) * 7 * pc, ry: -16 + Math.sin(t * .7) * 2.5, rx: 4, rz: 1.5, z: 40, o: cl(pk * 4) });
      chips.forEach(function (c, i) { var k = ramp(t, 1.3 + i * .22, 2.2 + i * .22, E.spring); T(c, { s: k, o: cl(k * 2), z: 60 + i * 60, y: Math.sin(t * 1.4 + i * 2) * 9 }); });
      var a = ramp(t, 3.4, 3.9, E.spring); T(m[0], { o: cl(a * 3), s: .8 + .2 * a });
      var dk = ramp(t, 4.3, 4.6) * (1 - ramp(t, 5.3, 5.5)); T(dots, { o: dk }); dd.forEach(function (q, i) { T(q, { y: Math.sin(t * 9 + i * 1.1) * 3 }); });
      var b = ramp(t, 5.5, 6.0, E.spring); T(us, { o: cl(b * 3), s: .8 + .2 * b });
      var c = ramp(t, 6.9, 7.4, E.spring); T(m[1], { o: cl(c * 3), s: .8 + .2 * c });
    };
  });

  // B · on cadre votre besoin (plan clair, comme un écran de widgets)
  scene(function (r, bg, cam) {
    bg.style.background = "#e8e6e0 radial-gradient(circle at 1px 1px,rgba(14,17,20,.14) 1.4px,transparent 1.6px) 0 0/26px 26px";
    var k = kw(cam, "b-k stack dk", ["On cadre", "votre", "besoin."], 92);
    var t1 = el(cam, "tile t1", '<h5>Pour qui</h5><div class="av"><i></i><i></i><i></i></div><div class="ln" style="width:70%"></div><div class="ln" style="width:44%"></div>');
    var cal = ""; for (var i = 0; i < 28; i++) cal += "<i></i>";
    var t2 = el(cam, "tile t2", '<h5>Pour quand</h5><div class="cal">' + cal + "</div>");
    var cols = ["#f2f1ec", "#0e1114", "#1f8fff", "#19c98c"];
    var t3 = el(cam, "tile t3", '<h5>Quel style</h5><div class="aa">Aa</div><div class="fsw">' + cols.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</div>");
    var t4 = el(cam, "tile t4", '<h5>Pour quoi</h5><div class="chips2"><span>Un site</span><span>Une vidéo</span><span>Du digital</span></div>');
    var t5 = el(cam, "tile t5", "<b>Besoin cadré</b><u><s></s></u><div class=\"ok\">" + CHECK + "</div>");
    var tiles = [t1, t2, t3, t4, t5], dots = [].slice.call(t2.querySelectorAll(".cal i")), sw = [].slice.call(t3.querySelectorAll(".fsw i")), ch = [].slice.call(t4.querySelectorAll(".chips2 span")), fill = t5.querySelector("u s"), ok = t5.querySelector(".ok");
    dots[17].classList.add("on");
    return function (t) {
      CAM(cam, { z: -260 + t * 38, ry: 15 - t * 3.6, rx: 5 - t * .5, x: -30 + t * 5 });
      kin(k, t, .2, .22);
      tiles.forEach(function (tl, i) { var q = ramp(t, .3 + i * .25, 1.3 + i * .25, E.spring); T(tl, { z: (1 - q) * -1000, y: (1 - q) * 280, ry: (1 - q) * 34, o: cl(q * 2.5) }); });
      T(dots[17], { s: 1 + .22 * Math.max(0, Math.sin((t - 2.0) * 5)) * (t > 2 ? 1 : 0) });
      dots[17].style.opacity = t > 2.0 ? 1 : .4;
      var si = t < 2.5 ? -1 : t < 3.2 ? 2 : t < 3.9 ? 3 : 0;
      sw.forEach(function (s, i) { s.classList.toggle("sel", i === si); });
      ch[0].classList.toggle("sel", t > 3.0); ch[1].classList.toggle("sel", t > 3.8);
      fill.style.transform = "scaleX(" + ramp(t, 4.4, 5.6, E.io) + ")";
      var o = ramp(t, 5.7, 6.2, E.spring); T(ok, { s: o, o: cl(o * 3) });
    };
  });

  // C · la maquette se construit, vue en perspective
  scene(function (r, bg, cam) {
    bg.style.background = "#0b0d10";
    var glow = el(cam, "c-glow"), k1 = kw(cam, "c-k", ["Une", "maquette"], 118), k2 = kw(cam, "c-k", ["avant", "la fin."], 118);
    k2.style.top = "152px";
    var wrap = el(cam, "c-bw"); var S = site(wrap), cur = el(wrap, "", CURSOR, "position:absolute;left:0;top:0;z-index:9");
    var way = [[0, 720, 410], [1.6, 560, 330], [3.2, 130, 296], [5.0, 120, 300], [5.8, 118, 302], [6.8, 520, 380], [8, 560, 400]];
    return function (t) {
      CAM(cam, { z: -300 + t * 50, ry: 8 - t * 1.4, rx: 3 });
      T(glow, { o: ramp(t, 0, 1.5) });
      kin(k1, t, .2, .2); kin(k2, t, .65, .2);
      var q = ramp(t, .5, 1.6, E.spring); T(wrap, { y: (1 - q) * 600, ry: -15 + Math.sin(t * .5) * 2, rx: 6, rz: -1, o: cl(q * 4) });
      T(S.nav, { o: ramp(t, 1.0, 1.4), y: (1 - ramp(t, 1.0, 1.5)) * -16 });
      S.type(Math.floor(ramp(t, 1.5, 3.2, E.lin) * S.text.length));
      T(S.p, { o: ramp(t, 3.2, 3.7), y: (1 - ramp(t, 3.2, 3.7)) * 12 });
      var b = ramp(t, 3.7, 4.2, E.spring); T(S.btn, { s: .7 + .3 * b, o: cl(b * 3) });
      var im = ramp(t, 3.9, 4.8, E.spring); T(S.img, { sx: .6 + .4 * im, sy: .6 + .4 * im, o: cl(im * 3) });
      S.cards.forEach(function (c, i) { var k = ramp(t, 4.7 + i * .22, 5.4 + i * .22, E.spring); T(c, { y: (1 - k) * 40, o: cl(k * 3) }); });
      var p = path(way, t); T(cur, { x: p.x, y: p.y, o: ramp(t, 1.2, 1.6) });
      var cl2 = Math.max(0, 1 - Math.abs(t - 5.7) * 4); T(S.btn, { s: (.7 + .3 * b) * (1 - .06 * cl2) });
      T(S.rp, { s: 1 + 6 * cl(t - 5.7, 0, .5) * 2, o: t > 5.7 ? (1 - cl((t - 5.7) / .5)) * .9 : 0 });
      T(S.page, { y: -34 * ramp(t, 6.4, 7.6, E.io) });
    };
  });

  // D · on ajuste ensemble
  scene(function (r, bg, cam) {
    bg.style.background = "#0b0d10";
    var k1 = kw(cam, "d-k", ["On", "ajuste."], 112), k2 = kw(cam, "d-k", ["Ensemble."], 112); k2.style.top = "122px";
    var wrap = el(cam, "d-bw"); var S = site(wrap); S.full();
    var rev = el(cam, "rev", "<span>Tour 1</span><span>Tour 2</span><span class=\"ok\">Validé</span>", "left:928px;top:150px");
    var insp = el(cam, "insp", '<div class="irow"><h6>Taille du titre</h6><div class="sl"><s></s><i></i></div></div><div class="irow"><h6>Couleur du site</h6><div class="sws"><i style="background:#ff5a1f"></i><i style="background:#1f8fff"></i><i style="background:#19c98c"></i><i style="background:#ffbf2e"></i></div></div><div class="irow" style="margin:0"><h6>Version</h6><div style="font-size:24px;font-weight:700;letter-spacing:-.02em" class="vn">V1</div></div>');
    var pin1 = el(cam, "pin", "1", "left:112px;top:276px"), pin2 = el(cam, "pin", "2", "left:700px;top:272px");
    var c1 = el(cam, "cmt", "Plus grand ?", "left:150px;top:222px"), c2 = el(cam, "cmt", "Et en bleu ?", "left:540px;top:216px"), c3 = el(cam, "cmt", "Finalement, l'orange.", "left:430px;top:216px");
    var cur = el(cam, "", CURSOR, "left:0;top:0;z-index:12;width:34px;height:34px");
    var big = el(cam, "vbig", CHECK);
    var rv = [].slice.call(rev.querySelectorAll("span")), sl = insp.querySelector(".sl"), slf = sl.querySelector("s"), slh = sl.querySelector("i"), sws = [].slice.call(insp.querySelectorAll(".sws i")), vn = insp.querySelector(".vn");
    var way = [[0, 640, 600], [1.0, 150, 330], [2.0, 160, 330], [2.4, 1040, 282], [3.4, 1160, 282], [4.0, 1060, 360], [4.6, 1052, 358], [5.3, 1052, 358], [5.8, 972, 358], [6.4, 980, 358], [8, 700, 520]];
    return function (t) {
      CAM(cam, { z: -140 + t * 26, ry: -6 + t * .8, rx: 2 });
      kin(k1, t, .2, .2); kin(k2, t, .6, .2);
      var q = ramp(t, .1, .9, E.out); T(wrap, { o: q, y: (1 - q) * 30, ry: -10, rx: 4, z: -40 });
      T(insp, { o: ramp(t, .3, .9), x: (1 - ramp(t, .3, 1.1, E.spring)) * 80, ry: 12, rx: 3, z: 20 });
      // 1) le titre grandit
      var g = ramp(t, 2.3, 3.3, E.io);
      T(S.h, { sx: 1 + .13 * g });
      slf.style.width = (35 + 45 * g) + "%"; slh.style.left = (35 + 45 * g) + "%";
      // 2) la couleur change : orange → bleu → orange
      var acc = t < 4.5 ? C_OR : t < 5.9 ? mix(C_OR, C_BL, ramp(t, 4.5, 4.9)) : mix(C_BL, C_OR, ramp(t, 5.9, 6.3));
      wrap.firstChild.style.setProperty("--acc", Array.isArray(acc) ? "rgb(" + acc.join(",") + ")" : acc);
      sws.forEach(function (s, i) { s.classList.toggle("sel", i === (t < 4.5 ? 0 : t < 5.9 ? 1 : 0)); });
      // repères et commentaires
      var p1 = ramp(t, 1.0, 1.4, E.spring), cm1 = ramp(t, 1.4, 1.9, E.spring) * (1 - ramp(t, 3.3, 3.6));
      T(pin1, { s: p1 * (1 - ramp(t, 3.3, 3.6)), o: cl(p1 * 3), z: 90 }); T(c1, { s: .8 + .2 * cm1, o: cm1, z: 90 });
      var p2 = ramp(t, 3.7, 4.1, E.spring), cm2 = ramp(t, 3.9, 4.4, E.spring) * (1 - ramp(t, 5.2, 5.5));
      T(pin2, { s: p2 * (1 - ramp(t, 5.2, 5.5)), o: cl(p2 * 3), z: 90 }); T(c2, { s: .8 + .2 * cm2, o: cm2, z: 90 });
      var cm3 = ramp(t, 5.4, 5.9, E.spring) * (1 - ramp(t, 6.7, 7.0)); T(c3, { s: .8 + .2 * cm3, o: cm3, z: 90 });
      // version
      vn.textContent = t < 3.4 ? "V1" : t < 6.5 ? "V2" : "V3";
      T(rv[0], { o: ramp(t, .4, .8) * (1 - ramp(t, 3.3, 3.6)) });
      T(rv[1], { o: ramp(t, 3.5, 3.9) * (1 - ramp(t, 6.3, 6.6)) });
      var v = ramp(t, 6.6, 7.1, E.spring); T(rv[2], { o: cl(v * 3), s: .8 + .2 * v });
      var vb = ramp(t, 6.8, 7.4, E.spring) * (1 - ramp(t, 7.5, 7.9)); T(big, { s: vb * 1.0, o: cl(vb * 3) });
      var p = path(way, t); T(cur, { x: p.x, y: p.y, o: ramp(t, .5, .9), z: 170 });
    };
  });

  // E · en ligne
  scene(function (r, bg, cam) {
    bg.style.background = "#0b0d10";
    var glow = el(cam, "e-glow"), k1 = kw(cam, "e-k1", ["C'est"], 118), k2 = kw(cam, "e-k1", ["en ligne."], 118); k2.style.top = "136px";
    var lap = el(cam, "e-lap"); var S = site(lap, "", "transform:scale(.87);transform-origin:0 0"); S.full();
    var base = el(lap, "e-base");
    var ph = el(cam, "e-ph", '<div class="m-bar"><em>votre-site.com</em></div><div class="m-nav"><b></b><i></i></div><h4>Votre activité,<br>bien présentée.</h4><span class="m-btn">Découvrir</span><div class="m-img"></div>');
    var live = el(cam, "flive", "En ligne", "left:880px;top:96px"), rings = [0, 1, 2].map(function () { return el(cam, "ring", null, "left:880px;top:96px"); });
    var d1 = el(cam, "done", "Publié", "left:880px;top:650px"), d2 = el(cam, "done", "Prise en main", "left:1020px;top:650px");
    var sparks = []; for (var i = 0; i < 26; i++) sparks.push(el(cam, "spark", null, "left:964px;top:121px"));
    var urlL = S.root.querySelector(".bw-bar em");
    var addr = "votre-site.com";
    return function (t) {
      CAM(cam, { z: 170 - t * 28, ry: -4 + t * .6, rx: 1 });
      T(glow, { o: ramp(t, 0, 1.5) });
      kin(k1, t, .2, .2); kin(k2, t, .55, .2);
      var n = Math.floor(ramp(t, .5, 2.0, E.lin) * addr.length);
      urlL.textContent = addr.slice(0, n) + (n < addr.length && Math.floor(t * 3) % 2 ? "|" : "");
      var on = ramp(t, 2.5, 2.9), q = ramp(t, .2, 1.1, E.spring);
      T(lap, { y: (1 - q) * 500, o: cl(q * 3) * (.45 + .55 * on), ry: 9, rx: 3 });
      var q2 = ramp(t, .5, 1.5, E.spring); T(ph, { y: (1 - q2) * 560, o: cl(q2 * 3) * (.45 + .55 * on), ry: -14, rx: 3, rz: 2 });
      var b = ramp(t, 2.5, 2.95, E.spring); T(live, { s: b, o: cl(b * 3) });
      rings.forEach(function (g, i) { var p = ((t - 2.8) / 1.8 + i / 3) % 1; if (t < 2.8) { T(g, { o: 0 }); return; } T(g, { o: (1 - p) * .6, s: 1 + p * 1.7 }); });
      sparks.forEach(function (s, i) { var a = i / sparks.length * Math.PI * 2 + (i % 3) * .25, sp = 130 + (i % 5) * 60, p = cl((t - 2.55) / 1.6); T(s, { x: Math.cos(a) * sp * E.out(p), y: Math.sin(a) * sp * E.out(p) + p * p * 60, rz: p * 300, o: t < 2.55 ? 0 : (1 - p), s: 1 - p * .4 }); });
      var u = ramp(t, 4.2, 4.7, E.spring); T(d1, { y: (1 - u) * 30, o: cl(u * 3) });
      var w = ramp(t, 4.9, 5.4, E.spring); T(d2, { y: (1 - w) * 30, o: cl(w * 3) });
    };
  });

  // F · vos vidéos, bien montées : une vraie table de montage
  scene(function (r, bg, cam) {
    bg.style.background = "#0b0d10";
    var glow = el(cam, "c-glow");
    var k = kw(cam, "f-k stack", ["Vos vidéos,", "bien montées."], 94);
    var prev = el(cam, "vprev", '<i class="vp-c"></i><i class="vp-b"></i><i class="vp-r"></i><span class="vp-sub"></span><span class="vp-tc"></span>');
    var vt = el(cam, "vt", '<div class="vt-ruler"></div>' +
      '<div class="vt-row" style="top:60px"><b>V1</b><div class="vt-lane"><div class="cl cr" style="left:0;width:24%"><i>Souvenirs</i></div><div class="cl or" style="left:26%;width:22%"><i>Événement</i></div><div class="cl cut" style="left:50%;width:14%"><i>À couper</i></div><div class="cl cr" id="vcl4" style="left:66%;width:32%"><i>Format court</i></div></div></div>' +
      '<div class="vt-row" style="top:128px"><b>V2</b><div class="vt-lane"><div class="cl gr" style="left:8%;width:40%"><i>Sous-titres</i></div><div class="cl or" style="left:52%;width:30%"><i>Titre</i></div></div></div>' +
      '<div class="vt-row" style="top:196px"><b>A1</b><div class="vt-lane"><div class="cl au" style="left:0;width:100%"><i>Musique</i></div></div></div>' +
      '<div class="vt-head"></div>');
    var lane = vt.querySelector(".vt-lane"), clips = [].slice.call(vt.querySelectorAll(".cl")), cut = vt.querySelector(".cut"), c4 = vt.querySelector("#vcl4"), head = vt.querySelector(".vt-head");
    var ruler = vt.querySelector(".vt-ruler"); for (var i = 0; i < 11; i++) ruler.innerHTML += "<span>" + (i < 10 ? "00:0" + i : "00:10") + "</span>";
    var c = prev.querySelector(".vp-c"), b = prev.querySelector(".vp-b"), rr = prev.querySelector(".vp-r"), sub = prev.querySelector(".vp-sub"), ptc = prev.querySelector(".vp-tc");
    var LW = 1062;
    return function (t) {
      CAM(cam, { z: -200 + t * 24, ry: 6 - t * .9, rx: 2 });
      T(glow, { o: ramp(t, 0, 1.5) });
      kin(k, t, .2, .22);
      var q = ramp(t, .4, 1.4, E.spring); T(prev, { y: (1 - q) * 380, ry: -12, rx: 4, rz: 1.2, z: 40, o: cl(q * 3) });
      var p2 = ramp(t, .8, 1.8, E.spring); T(vt, { y: (1 - p2) * 520, rx: 8, z: -20, o: cl(p2 * 3) });
      clips.forEach(function (cl_, i) { var kk = ramp(t, 1.2 + i * .16, 1.9 + i * .16, E.spring); T(cl_, { sx: kk, sy: 1, o: cl(kk * 3) }); });
      var hd = cl((t - 1.3) / 5.6); // la tête de lecture traverse la table
      var hx = hd * LW; T(head, { x: hx, o: ramp(t, 1.2, 1.6) });
      // le morceau « à couper » disparaît, la suite se recolle
      var cc = ramp(t, 4.3, 5.0, E.io);
      T(cut, { sx: 1 - cc, o: 1 - cc * .6 }); cut.style.transformOrigin = "0 50%";
      T(c4, { x: -LW * .16 * cc });
      // aperçu : le disque suit la lecture, les sous-titres s'écrivent mot à mot
      T(c, { x: -hd * 160, y: Math.sin(hd * 6) * 18 }); T(b, { rz: -10 + hd * 40, y: -hd * 24 }); T(rr, { x: hd * 120 });
      var W1 = "On garde ce qui compte".split(" "), W2 = "on coupe le reste.".split(" ");
      var s = "", n1 = Math.floor(ramp(t, 1.9, 3.7, E.lin) * W1.length), n2 = Math.floor(ramp(t, 4.6, 6.1, E.lin) * W2.length);
      s = (t < 4.5 ? W1.slice(0, n1) : W2.slice(0, n2)).join(" ");
      sub.textContent = s; T(sub, { o: s ? 1 : 0 });
      var fr = Math.round(hd * 8 * 25), sec = Math.floor(fr / 25);
      ptc.textContent = "00:0" + sec + ":" + (fr % 25 < 10 ? "0" : "") + (fr % 25);
    };
  });

  // G · et le reste du digital : profils, visuels, être trouvé
  scene(function (r, bg, cam) {
    bg.style.background = "#e8e6e0 radial-gradient(circle at 1px 1px,rgba(14,17,20,.14) 1.4px,transparent 1.6px) 0 0/26px 26px";
    var k = kw(cam, "g-k stack dk", ["Et on", "s'occupe", "du reste."], 92);
    var g1 = el(cam, "tile g1", '<div class="g-ban"></div><div class="g-av"><svg viewBox="0 0 40 40"><rect x="8" y="5" width="7" height="30" fill="#f2f1ec"/><polygon points="15,15.05 15,20 19.95,20 30,9.95 25.05,5" fill="#ff5a1f"/><polygon points="15,24.95 15,20 19.95,20 30,30.05 25.05,35" fill="#f2f1ec"/></svg></div><div class="g-nm"></div><div class="g-ln" style="width:62%;top:150px"></div><div class="g-ln" style="width:40%;top:170px"></div><span class="g-fo">Suivre</span><h5>Vos profils</h5>');
    var g2 = el(cam, "tile g2", '<h5>Vos visuels</h5><div class="g-gr"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><i class="e"></i><i class="f"></i></div>');
    var g3 = el(cam, "tile g3", '<h5>Être trouvé</h5><div class="g-se"><svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="#0e1114" stroke-width="2"/><path d="M13 13l5 5" stroke="#0e1114" stroke-width="2"/></svg><span class="g-q"></span></div><div class="g-rs g-r1"><b></b><u><i>Votre site</i><em>votre-activite.com</em></u><s>Trouvé</s></div><div class="g-rs"><b></b><u><i></i><em></em></u></div><div class="g-rs"><b></b><u><i></i><em></em></u></div>');
    var tiles = [g1, g2, g3], gi = [].slice.call(g2.querySelectorAll(".g-gr i")), q = g3.querySelector(".g-q"), r1 = g3.querySelector(".g-r1"), fo = g1.querySelector(".g-fo");
    var rs = [].slice.call(g3.querySelectorAll(".g-rs"));
    return function (t) {
      CAM(cam, { z: -240 + t * 34, ry: 14 - t * 3, rx: 5 - t * .4, x: -26 + t * 4 });
      kin(k, t, .2, .22);
      tiles.forEach(function (tl, i) { var kk = ramp(t, .4 + i * .3, 1.4 + i * .3, E.spring); T(tl, { z: (1 - kk) * -1000, y: (1 - kk) * 280, ry: (1 - kk) * 34, o: cl(kk * 2.5) }); });
      gi.forEach(function (g, i) { var kk = ramp(t, 1.4 + i * .18, 2.0 + i * .18, E.spring); T(g, { s: .3 + .7 * kk, o: cl(kk * 3) }); });
      var f = ramp(t, 2.8, 3.2, E.spring); fo.style.transform = "scale(" + (1 + .08 * Math.sin(Math.min(1, f) * 3.14)) + ")"; fo.classList.toggle("on", t > 3.0);
      var TX = "votre activité", n = Math.floor(ramp(t, 3.2, 4.8, E.lin) * TX.length);
      q.textContent = TX.slice(0, n) + (n < TX.length && Math.floor(t * 3) % 2 ? "|" : "");
      rs.forEach(function (x, i) { var kk = ramp(t, 4.8 + i * .22, 5.4 + i * .22, E.spring); T(x, { y: (1 - kk) * 24, o: cl(kk * 3) }); });
      r1.classList.toggle("hit", t > 5.7);
    };
  });

  // Z · carte finale
  scene(function (r, bg, cam) {
    bg.style.background = "var(--rec)";
    var mark = el(cam, "z-mark", '<svg viewBox="0 0 40 40" width="150" height="150"><rect x="8" y="5" width="7" height="30" fill="#0e1114"/><polygon points="15,15.05 15,20 19.95,20 30,9.95 25.05,5" fill="#f2f1ec"/><polygon points="15,24.95 15,20 19.95,20 30,30.05 25.05,35" fill="#0e1114"/></svg>');
    var k = kw(cam, "z-k stack dk", ["Un projet ?", "Parlons-en."], 126);
    return function (t) {
      var q = ramp(t, .1, 1.0, E.spring); T(mark, { ry: (1 - q) * 200, s: .4 + .6 * q, o: cl(q * 3) });
      kin(k, t, .5, .28);
    };
  });

  var wipe = el(inner, "fwipe");
  var hud = el(inner, "fhud", '<div class="ht"></div><div class="hb"></div>'), hTr = hud.querySelector(".ht"), hBl = hud.querySelector(".hb");

  // ---------- son : bruitages et musique générés dans le navigateur ----------
  var NARR = [
    "Tout commence par un simple message. Dites-nous ce que vous voulez : un site, une vidéo, ou de l'aide en ligne.",
    "Ensuite, nous cadrons votre besoin : pour qui, pour quand, dans quel style. Quelques questions suffisent.",
    "Puis nous vous montrons une maquette. Vous voyez le projet avant qu'il soit terminé, pas après.",
    "Vous donnez vos retours, nous corrigeons. Autant de tours que nécessaire, jusqu'à ce que ce soit juste.",
    "Enfin, votre site est mis en ligne, et nous vous expliquons comment le prendre en main.",
    "Un projet ? Parlons-en.",
    "Nous montons aussi vos vidéos : souvenirs, événements, formats courts pour les réseaux. On garde ce qui compte, on coupe le reste.",
    "Et nous soignons votre présence en ligne : vos profils, vos visuels, et des conseils concrets pour qu'on vous trouve.",
  ];
  var VFILE = [1, 2, 3, 4, 5, 7, 8, 6, 9]; // fichier de chaque chapitre ; carte finale : voix-6 puis la conclusion voix-9
  var AC = null, master = null, soundOn = false, musicTimer = 0, musicGain = null, noiseB = null;
  function ac() {
    if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); master = AC.createGain(); master.gain.value = .9; master.connect(AC.destination); }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function env(g, t0, a, d, peak) { g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(.0001, t0 + a + d); }
  function blip(f0, f1, dur, vol, type, delay) {
    if (!soundOn || !AC) return;
    var t0 = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * .8);
    env(g, t0, .006, dur, vol); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + .05);
  }
  function whoosh(dur, f0, f1, vol) {
    if (!soundOn || !AC) return;
    if (!noiseB) { noiseB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); var d = noiseB.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var t0 = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noiseB; src.loop = true; f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * .45); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + .05);
  }
  var sfx = {
    tick: function () { blip(1500, 950, .05, .05, "triangle"); },
    key: function () { blip(2400, 1900, .02, .022, "square"); },
    pop: function () { blip(380, 780, .13, .12, "sine"); },
    pop2: function () { blip(300, 520, .13, .1, "sine"); },
    thud: function () { blip(160, 60, .22, .22, "sine"); },
    swoosh: function () { whoosh(.55, 300, 3400, .12); },
    chime: function () { [659.25, 987.77, 1318.5].forEach(function (f, i) { blip(f, f * 1.003, 1.1, .09 / (i + 1), "sine", i * .09); }); },
    live: function () { whoosh(1, 200, 4500, .16); sfx.chime(); },
  };
  var CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [130.81, 164.81, 196], [196, 246.94, 293.66]];
  function startMusic() {
    if (!AC || musicTimer) return;
    musicGain = AC.createGain(); musicGain.gain.value = 0; musicGain.connect(master); musicGain.gain.linearRampToValueAtTime(1, AC.currentTime + 1.5);
    var lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100; lp.connect(musicGain);
    var step = 0;
    function bar() {
      var ch = CHORDS[step % CHORDS.length], t0 = AC.currentTime;
      ch.forEach(function (f) { [0, 4].forEach(function (det) {
        var o = AC.createOscillator(), g = AC.createGain(); o.type = "triangle"; o.frequency.value = f; o.detune.value = det;
        g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(.022, t0 + 1.4); g.gain.linearRampToValueAtTime(.0001, t0 + 5.2);
        o.connect(g); g.connect(lp); o.start(t0); o.stop(t0 + 5.3);
      }); });
      for (var k = 0; k < 8; k++) (function (k) { var o = AC.createOscillator(), g = AC.createGain(), tt = t0 + k * .66; o.type = "sine"; o.frequency.value = ch[k % 3] * 2; env(g, tt, .01, .5, .014); o.connect(g); g.connect(lp); o.start(tt); o.stop(tt + .6); })(k);
      step++;
    }
    bar(); musicTimer = setInterval(bar, 5300);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = 0; }
    if (musicGain && AC) { var g = musicGain; g.gain.cancelScheduledValues(AC.currentTime); g.gain.setValueAtTime(g.gain.value, AC.currentTime); g.gain.linearRampToValueAtTime(0, AC.currentTime + .6); setTimeout(function () { try { g.disconnect(); } catch (e) {} }, 800); musicGain = null; }
  }

  // Voix : de vrais enregistrements, un fichier par chapitre (assets/film/voix-1.mp3 … voix-6.mp3).
  // Pas de voix de synthèse. La durée de chaque chapitre s'adapte à celle de l'enregistrement.
  var VOICE = VFILE.map(function (n) {
    var a = new Audio(); a.preload = "metadata"; a.src = "assets/film/voix-" + n + ".mp3"; a.ok = false;
    a.addEventListener("loadedmetadata", function () { a.ok = isFinite(a.duration); retime(); });
    return a;
  });
  VOICE[CH.length].addEventListener("ended", function () { if (playing && soundOn && t >= BODY) setTimeout(function () { if (playing && soundOn && t >= BODY) { var a = VOICE[CH.length + 1]; if (a.ok) { a.currentTime = 0; a.play().catch(function () {}); } } }, 450); });
  function stopVoices(reset) { VOICE.forEach(function (a) { a.pause(); if (reset) { try { a.currentTime = 0; } catch (e) {} } }); }
  function playVoice(i, fromStart) { if (!soundOn || !VOICE[i].ok) return; stopVoices(true); var a = VOICE[i]; if (fromStart) a.currentTime = 0; a.play().catch(function () {}); }
  function retime() {
    var acc = 0;
    CH.forEach(function (c, i) {
      c.d = Math.max(c.d0, VOICE[i].ok ? Math.ceil((VOICE[i].duration + .8) * 2) / 2 : 0);
      START[i] = acc; acc += c.d;
      var li = clipsEl.children[i]; if (li) li.style.setProperty("--d", c.d);
    });
    var e1 = VOICE[CH.length], e2 = VOICE[CH.length + 1];
    BODY = acc; TOTAL = BODY + Math.max(5, (e1.ok ? e1.duration + .5 : 0) + (e2.ok ? e2.duration : 0) + 1.2);
    if (!playing) render(t);
  }
  function startAudio() {
    if (!soundOn) return;
    startMusic();
    var ci = t >= BODY + .4 ? CH.length : chapterAt(t), a = VOICE[ci];
    if (a.ok && a.currentTime > 0 && !a.ended) a.play().catch(function () {}); else playVoice(ci, true);
  }
  function stopAudio() { stopMusic(); stopVoices(false); }

  var CUES = [];
  function cue(ch, local, fn) { CUES.push({ ch: ch, l: local, fn: fn }); }
  function cueTime(c) { return c.end ? BODY + .4 : START[c.ch] + c.l; }
  cue(0, .1, sfx.thud); cue(0, .95, sfx.swoosh); [1.3, 1.52, 1.74].forEach(function (x) { cue(0, x, sfx.tick); });
  cue(0, 2.55, sfx.swoosh); cue(0, 3.5, sfx.pop); cue(0, 5.55, sfx.pop2); cue(0, 6.95, sfx.pop);
  cue(1, -.3, sfx.swoosh); [.3, .55, .8, 1.05, 1.3].forEach(function (x) { cue(1, x, sfx.pop); }); cue(1, 2.0, sfx.tick); cue(1, 2.5, sfx.tick); cue(1, 3.2, sfx.tick); cue(1, 3.0, sfx.pop); cue(1, 3.8, sfx.pop); cue(1, 5.8, sfx.chime);
  cue(2, -.3, sfx.swoosh); cue(2, .5, sfx.swoosh); cue(2, 1.1, sfx.tick); for (var kk = 0; kk < 16; kk++) cue(2, 1.5 + kk * .105, sfx.key);
  cue(2, 3.75, sfx.pop); cue(2, 3.95, sfx.swoosh); [4.7, 4.92, 5.14].forEach(function (x) { cue(2, x, sfx.tick); }); cue(2, 5.7, sfx.pop); cue(2, 6.4, sfx.swoosh);
  cue(3, -.3, sfx.swoosh); cue(3, 1.0, sfx.pop); cue(3, 1.45, sfx.pop2); cue(3, 2.3, sfx.swoosh); cue(3, 3.7, sfx.pop); cue(3, 4.55, sfx.tick); cue(3, 5.4, sfx.pop2); cue(3, 5.9, sfx.tick); cue(3, 6.8, sfx.chime);
  cue(4, -.3, sfx.swoosh); cue(4, .2, sfx.swoosh); for (var jj = 0; jj < 14; jj++) cue(4, .5 + jj * .105, sfx.key);
  cue(4, 2.5, sfx.live); cue(4, 4.2, sfx.tick); cue(4, 4.9, sfx.tick);
  cue(5, -.3, sfx.swoosh); cue(5, .5, sfx.swoosh); [1.2, 1.36, 1.52, 1.68].forEach(function (x) { cue(5, x, sfx.tick); }); [2.0, 2.6, 3.2].forEach(function (x) { cue(5, x, sfx.key); }); cue(5, 4.3, sfx.swoosh); cue(5, 4.9, sfx.pop); cue(5, 6.4, sfx.chime);
  cue(6, -.3, sfx.swoosh); cue(6, .5, sfx.pop); cue(6, .8, sfx.pop); cue(6, 1.1, sfx.pop); cue(6, 3.0, sfx.pop2); for (var mm = 0; mm < 14; mm++) cue(6, 3.2 + mm * .11, sfx.key); cue(6, 5.8, sfx.chime);
  CUES.push({ end: true, fn: sfx.chime });

  // ---------- commandes ----------
  var clipBtns = CH.map(function (c, i) {
    var li = document.createElement("li"); li.style.setProperty("--d", c.d);
    li.innerHTML = '<button type="button" data-i="' + i + '"><span>' + c.n + "</span><em>" + c.s + "</em></button>";
    clipsEl.appendChild(li);
    return li.firstChild;
  });

  var seeking = false, t = 0, playing = false, last = 0, raf = 0, lastCh = -1, userPaused = false;
  function chapterAt(x) { var c = 0; for (var i = 0; i < CH.length; i++) if (x >= START[i]) c = i; return c; }
  function fmt(s) { s = Math.floor(s); return (s < 10 ? "0" : "") + s; }

  function wipeScale(x) { // disque orange qui change de plan : il grandit juste avant la coupe, puis se retire
    var best = 0;
    for (var i = 1; i <= CH.length; i++) {
      var B = i < CH.length ? START[i] : BODY, a = ramp(x, B - .4, B, E.io), b = 1 - ramp(x, B, B + .4, E.io);
      best = Math.max(best, x < B ? a : (i === CH.length ? 0 : b));
    }
    return best;
  }

  function render(now) {
    t = cl(now, 0, TOTAL);
    var ci = chapterAt(t), endNow = t >= BODY, si = endNow ? CH.length : ci;
    scenes.forEach(function (s, i) { s.el.style.display = i === si ? "block" : "none"; });
    scenes[si].draw(endNow ? t - BODY : t - START[ci]);
    var w = wipeScale(t); T(wipe, { s: w }); wipe.style.display = w > .002 ? "block" : "none";
    hud.classList.toggle("dark", hudDark[si] && !(w > .5));
    hTr.textContent = "00:" + fmt(t) + ":" + fmt((t % 1) * 25);
    hBl.textContent = endNow ? "Kinéo" : CH[ci].n + " · " + CH[ci].t;
    if (ci !== lastCh) { lastCh = ci; capT.textContent = CH[ci].t; capP.textContent = CH[ci].p; if (playing && soundOn && !seeking) playVoice(ci, true); }
    clipBtns.forEach(function (b, i) { b.style.setProperty("--p", cl((t - START[i]) / CH[i].d)); if (i === ci) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    tcEl.textContent = "00:" + fmt(t) + " / 00:" + fmt(TOTAL);
    if (t >= BODY + .4) player.setAttribute("data-end", ""); else player.removeAttribute("data-end");
  }

  function tick(ts) {
    if (!playing) return;
    var dt = (ts - last) / 1000; last = ts;
    var prev = t;
    render(t + Math.min(dt, .1));
    if (soundOn) CUES.forEach(function (c) { var g = cueTime(c); if (g > prev && g <= t) c.fn(); });
    if (soundOn && prev < BODY + .4 && t >= BODY + .4) playVoice(CH.length, true);
    if (t >= TOTAL) { pause(); return; }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (t >= TOTAL) t = 0;
    playing = true; player.setAttribute("data-playing", ""); pp.setAttribute("aria-label", "Mettre en pause");
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    startAudio();
  }
  function pause() { playing = false; player.removeAttribute("data-playing"); pp.setAttribute("aria-label", "Lire"); cancelAnimationFrame(raf); stopAudio(); }
  function seek(i) { seeking = true; stopVoices(true); render(reduce && !playing ? START[i] + CH[i].d - .01 : START[i] + .001); seeking = false; }

  pp.addEventListener("click", function () { if (playing) { userPaused = true; pause(); } else { userPaused = false; play(); } });
  clipsEl.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    seek(+b.dataset.i);
    if (!playing && !reduce) { userPaused = false; play(); }
  });
  var snd = document.getElementById("fsnd");
  if (snd) snd.addEventListener("click", function () {
    if (!soundOn) {
      if (!ac()) return;
      soundOn = true; snd.setAttribute("aria-pressed", "true"); player.setAttribute("data-sound", "");
      seek(chapterAt(t)); userPaused = false; if (playing) pause(); play();
    } else { soundOn = false; snd.setAttribute("aria-pressed", "false"); player.removeAttribute("data-sound"); stopAudio(); }
  });
  var replay = document.getElementById("freplay");
  if (replay) replay.addEventListener("click", function () { userPaused = false; render(0); play(); });

  function fit() { inner.style.transform = "scale(" + (vis.clientWidth / 1280) + ")"; }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(vis); else addEventListener("resize", fit);
  fit();

  var m = /[?&]film=([\d.]+)/.exec(location.search); // image figée : ?film=12.5
  if (m) { render(+m[1]); return; }

  render(reduce ? CH[0].d - .01 : 0);

  if ("IntersectionObserver" in window && !reduce) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= .5) { if (!playing && !userPaused && t < TOTAL) play(); }
        else if (playing && !e.isIntersecting) pause();
      });
    }, { threshold: [0, .5] }).observe(player);
  }
})();
