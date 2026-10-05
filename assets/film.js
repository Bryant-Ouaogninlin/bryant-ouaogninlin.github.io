// Film « Comment ça marche » : du motion design en HTML/CSS, piloté par une seule horloge (render(t)).
// Chaque scène est une fonction du temps : on peut lire, mettre en pause, sauter d'un chapitre à l'autre,
// ou figer sur une image avec ?film=12.5 (pratique pour vérifier le rendu).
(function () {
  var player = document.getElementById("player");
  if (!player) return;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var vis = player.querySelector(".f-vis"), inner = player.querySelector(".f-in");
  var cap = player.querySelector(".f-cap"), capN = document.getElementById("fcn"), capT = document.getElementById("fct"), capP = document.getElementById("fcp");
  var tcEl = document.getElementById("ftc"), clipsEl = document.getElementById("fclips"), pp = document.getElementById("fpp");

  var CH = [
    { d: 8, d0: 8, n: "01", s: "Écrire", t: "Vous nous écrivez", p: "Un message sur WhatsApp, un e-mail ou un mot sur TikTok. Dites-nous simplement ce que vous voulez." },
    { d: 7, d0: 7, n: "02", s: "Cadrer", t: "On cadre votre besoin", p: "Pour qui, pour quand, dans quel style : quelques questions suffisent pour partir du bon pied." },
    { d: 8, d0: 8, n: "03", s: "Maquette", t: "On vous montre une maquette", p: "Vous voyez le projet avant qu'il soit fini, pas après." },
    { d: 8, d0: 8, n: "04", s: "Ajuster", t: "On ajuste ensemble", p: "Vos retours, nos corrections, autant de tours que nécessaire." },
    { d: 7, d0: 7, n: "05", s: "En ligne", t: "Mise en ligne", p: "Votre site est publié, et nous vous expliquons comment le prendre en main." },
  ];
  var START = [], BODY = 0;
  CH.forEach(function (c) { START.push(BODY); BODY += c.d; });
  var TOTAL = BODY + 5; // 5 s de carte finale

  // ---------- petits outils ----------
  var cl = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var E = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    io: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back: function (t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    lin: function (t) { return t; },
  };
  function ramp(t, a, b, e) { return (e || E.out)(cl((t - a) / (b - a))); }
  function S(el, o) {
    if (!el) return;
    if (o.o !== undefined) el.style.opacity = o.o;
    var tr = [];
    if (o.x !== undefined || o.y !== undefined) tr.push("translate(" + (o.x || 0) + "px," + (o.y || 0) + "px)");
    if (o.s !== undefined) tr.push("scale(" + o.s + ")");
    if (o.sx !== undefined) tr.push("scale(" + o.sx + "," + (o.sy === undefined ? 1 : o.sy) + ")");
    if (o.r !== undefined) tr.push("rotate(" + o.r + "deg)");
    if (tr.length) el.style.transform = tr.join(" ");
  }
  function path(pts, t) { // interpolation entre des points [temps, x, y]
    if (t <= pts[0][0]) return { x: pts[0][1], y: pts[0][2] };
    for (var i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i], k = E.io(cl((t - a[0]) / (b[0] - a[0])));
        return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k };
      }
    }
    var l = pts[pts.length - 1];
    return { x: l[1], y: l[2] };
  }
  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return [].slice.call(root.querySelectorAll(sel)); }

  var SITE = '<div class="fbr-bar"><i></i><i></i><i></i><em class="url mono"></em></div>' +
    '<div class="fbr-body"><div class="s-nav"><b></b><span></span><span></span><span></span></div>' +
    '<div class="s-hero"><div class="s-txt"><u class="s-t1"></u><u class="s-t2"></u><u class="s-p"></u><u class="s-p2"></u><b class="s-btn"></b></div>' +
    '<div class="s-img"><s></s></div></div>' +
    '<div class="s-cards"><div class="s-c"></div><div class="s-c"></div><div class="s-c"></div></div></div>';
  var CURSOR = '<svg class="fk" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2l16 9-7 2-3 7z" fill="var(--rec)" stroke="#0e1114" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="#0e1114" stroke-width="2.4" stroke-linecap="square"/></svg>';

  // ---------- scènes ----------
  var scenes = [];
  function scene(html, build) {
    var el = document.createElement("div");
    el.className = "sc";
    el.innerHTML = '<div class="grid"></div>' + html;
    inner.appendChild(el);
    var s = { el: el, draw: build(el) };
    scenes.push(s);
  }

  // 1 · la conversation
  scene(
    '<ul class="chips"><li>WhatsApp</li><li>E-mail</li><li>TikTok</li></ul>' +
    '<div class="phone"><div class="ph-top"><i></i><b>Kinéo</b><span>Message</span></div>' +
    '<p class="bub me" style="top:72px">Bonjour, je voudrais un site pour mon activité.</p>' +
    '<p class="bub dots" style="top:150px"><i></i><i></i><i></i></p>' +
    '<p class="bub us" style="top:150px">Bonjour ! Parlez-moi de votre projet.</p>' +
    '<p class="bub me" style="top:214px">Quelque chose de simple, pour bientôt.</p></div>',
    function (r) {
      var chips = qa(r, ".chips li"), m = qa(r, ".bub.me"), dots = q(r, ".bub.dots"), us = q(r, ".bub.us"), dd = qa(r, ".bub.dots i");
      return function (t) {
        chips.forEach(function (c, i) { var k = ramp(t, .2 + i * .22, .8 + i * .22); S(c, { o: k, x: (1 - k) * -16 }); });
        var a = ramp(t, .9, 1.4, E.back); S(m[0], { o: cl(a * 2), s: .85 + .15 * a });
        var dk = ramp(t, 2.4, 2.7) * (1 - ramp(t, 3.55, 3.7));
        S(dots, { o: dk }); dd.forEach(function (d, i) { S(d, { y: Math.sin(t * 9 + i * 1.1) * 2.4 }); });
        var b = ramp(t, 3.7, 4.2, E.back); S(us, { o: cl(b * 2), s: .85 + .15 * b });
        var c = ramp(t, 5.2, 5.7, E.back); S(m[1], { o: cl(c * 2), s: .85 + .15 * c });
      };
    }
  );

  // 2 · la fiche projet
  scene(
    '<div class="fcard"><span class="mono ct">Fiche projet</span><ul class="rows">' +
    '<li><i class="ck"><s>' + CHECK + '</s></i><b>Pour qui</b><span class="bar" style="--w:58%"></span></li>' +
    '<li><i class="ck"><s>' + CHECK + '</s></i><b>Pour quand</b><span class="bar" style="--w:42%"></span></li>' +
    '<li><i class="ck"><s>' + CHECK + '</s></i><b>Quel style</b><span class="bar" style="--w:66%"></span></li></ul>' +
    '<div class="prog"><span class="mono">Besoin cadré</span><u><s></s></u></div></div><div class="stamp mono">Cadré</div>',
    function (r) {
      var rows = qa(r, ".rows li"), card = q(r, ".fcard"), fill = q(r, ".prog s"), stamp = q(r, ".stamp");
      return function (t) {
        S(card, { o: ramp(t, 0, .5), y: (1 - ramp(t, 0, .6)) * 14 });
        var done = 0;
        rows.forEach(function (li, i) {
          var t0 = .6 + i * 1.5, k = ramp(t, t0, t0 + .4);
          S(li, { o: k, x: (1 - k) * 10 });
          S(q(li, ".bar"), { sx: ramp(t, t0 + .3, t0 + 1.1) });
          var ck = ramp(t, t0 + 1.0, t0 + 1.4, E.back); S(q(li, ".ck s"), { o: cl(ck * 3), s: .4 + .6 * ck });
          done += ramp(t, t0 + 1.0, t0 + 1.4) / 3;
        });
        S(fill, { sx: done });
        var st = ramp(t, 5.3, 5.8, E.back); S(stamp, { o: cl(st * 3), s: 1.7 - .7 * st, r: -5 + 5 * st });
      };
    }
  );

  // 3 · la maquette se construit
  scene(
    '<div class="fbr" style="left:90px;top:50px">' + SITE + '</div><div class="mk mono">Maquette · V1</div>' + CURSOR,
    function (r) {
      var br = q(r, ".fbr"), url = q(r, ".url"), cur = q(r, ".fk"), mk = q(r, ".mk");
      url.textContent = "maquette";
      var items = [
        [q(r, ".s-nav"), .5], [q(r, ".s-t1"), 1.1], [q(r, ".s-t2"), 1.4], [q(r, ".s-p"), 1.8], [q(r, ".s-p2"), 2.0],
        [q(r, ".s-btn"), 2.4], [q(r, ".s-img"), 2.9], [qa(r, ".s-c")[0], 3.7], [qa(r, ".s-c")[1], 4.0], [qa(r, ".s-c")[2], 4.3],
      ];
      var way = [[0, 560, 330], [.5, 150, 100], [1.1, 160, 138], [1.7, 150, 176], [2.4, 150, 206], [2.9, 430, 176], [3.7, 150, 300], [4.3, 380, 300], [5.2, 540, 250], [7, 560, 290]];
      return function (t) {
        S(br, { o: ramp(t, 0, .4), y: (1 - ramp(t, 0, .5)) * 12 });
        items.forEach(function (it) {
          var k = ramp(t, it[1], it[1] + .45);
          var el = it[0];
          if (el.classList.contains("s-t1") || el.classList.contains("s-t2")) S(el, { o: k, sx: .2 + .8 * k });
          else S(el, { o: k, y: (1 - k) * 10 });
        });
        var p = path(way, t); S(cur, { x: p.x, y: p.y, o: ramp(t, 0, .3) });
        S(mk, { o: ramp(t, .3, .8) });
      };
    }
  );

  // 4 · on ajuste
  scene(
    '<div class="fbr" style="left:90px;top:50px">' + SITE + '</div><div class="mk mono">Maquette · V2</div>' +
    '<div class="sel" style="left:102px;top:126px;width:246px;height:46px"><i></i><i></i><i></i><i></i></div>' +
    '<div class="cm" style="left:236px;top:92px">Un peu plus grand ?</div>' +
    '<div class="rev mono"><span>Tour 1</span><span>Tour 2</span><span class="ok">Validé</span></div>' + CURSOR,
    function (r) {
      var br = q(r, ".fbr"), url = q(r, ".url"), cur = q(r, ".fk"), sel = q(r, ".sel"), cm = q(r, ".cm"), rev = qa(r, ".rev span");
      var t1 = q(r, ".s-t1"), t2 = q(r, ".s-t2"), img = q(r, ".s-img");
      url.textContent = "maquette";
      var way = [[0, 540, 300], [.8, 150, 150], [2.6, 150, 150], [3.6, 330, 150], [4.1, 520, 236], [5.5, 538, 236], [8, 538, 236]];
      return function (t) {
        S(br, { o: ramp(t, 0, .35) });
        var grow = ramp(t, 2.7, 3.6, E.io);
        S(t1, { sx: 1 + .08 * grow, sy: 1 + .3 * grow }); S(t2, { sx: 1 + .08 * grow, sy: 1 + .3 * grow });
        var im = ramp(t, 4.5, 5.5, E.io); S(img, { sx: 1 + .06 * im });
        var sk = ramp(t, .9, 1.3) * (1 - ramp(t, 3.8, 4.1));
        S(sel, { o: sk, sx: 1 + .08 * grow, sy: 1 + .3 * grow });
        var cb = ramp(t, 1.6, 2.1, E.back) * (1 - ramp(t, 3.7, 4.0)); S(cm, { o: cl(cb * 2), s: .8 + .2 * cb });
        S(rev[0], { o: ramp(t, .3, .7) * (1 - ramp(t, 3.6, 3.9)) });
        S(rev[1], { o: ramp(t, 3.8, 4.1) * (1 - ramp(t, 5.4, 5.7)) });
        var ok = ramp(t, 5.7, 6.1, E.back); S(rev[2], { o: cl(ok * 2), s: .8 + .2 * ok });
        var p = path(way, t); S(cur, { x: p.x, y: p.y });
      };
    }
  );

  // 5 · mise en ligne
  scene(
    '<div class="fbr" style="left:50px;top:70px;transform:scale(.84)">' + SITE + '</div>' +
    '<div class="mini"><div class="m-nav"><b></b><span></span></div><div class="m-t"></div><div class="m-p"></div><div class="m-b"></div><div class="m-i"></div></div>' +
    '<div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="badge mono">En ligne</div>' +
    '<div class="done mono" style="left:50px">Publié</div><div class="done mono" style="left:190px">Prise en main</div>',
    function (r) {
      var br = q(r, ".fbr"), mini = q(r, ".mini"), badge = q(r, ".badge"), rings = qa(r, ".ring"), done = qa(r, ".done"), url = q(r, ".url");
      var addr = "votre-site.com";
      return function (t) {
        var n = Math.floor(ramp(t, .5, 2.0, E.lin) * addr.length);
        url.textContent = addr.slice(0, n) + (n < addr.length && Math.floor(t * 3) % 2 ? "|" : "");
        var live = ramp(t, 2.5, 2.9);
        S(br, { o: .45 + .55 * live }); S(mini, { o: ramp(t, 0, .4) * (.45 + .55 * live), y: (1 - ramp(t, 0, .5)) * 12 });
        var b = ramp(t, 2.5, 2.9, E.back); S(badge, { o: cl(b * 3), s: .6 + .4 * b });
        rings.forEach(function (g, i) {
          var p = ((t - 2.8) / 1.8 + i / 3) % 1; if (t < 2.8 || p < 0) { S(g, { o: 0 }); return; }
          S(g, { o: (1 - p) * .55, s: 1 + p * 3.2 });
        });
        done.forEach(function (d, i) { var k = ramp(t, 4.0 + i * .7, 4.5 + i * .7); S(d, { o: k, y: (1 - k) * 10 }); });
      };
    }
  );

  // ---------- son : bruitages et musique générés dans le navigateur, voix de présentation ----------
  var NARR = [
    "Tout commence par un simple message. Dites-nous ce que vous voulez : un site, une vidéo, ou de l'aide en ligne.",
    "Ensuite, nous cadrons votre besoin : pour qui, pour quand, dans quel style. Quelques questions suffisent.",
    "Puis nous vous montrons une maquette. Vous voyez le projet avant qu'il soit terminé, pas après.",
    "Vous donnez vos retours, nous corrigeons. Autant de tours que nécessaire, jusqu'à ce que ce soit juste.",
    "Enfin, votre site est mis en ligne, et nous vous expliquons comment le prendre en main.",
    "Un projet ? Parlons-en.",
  ];
  var AC = null, master = null, soundOn = false, musicTimer = 0, musicGain = null, noiseB = null;
  function ac() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      AC = new C(); master = AC.createGain(); master.gain.value = .9; master.connect(AC.destination);
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(.0001, t0 + a + d);
  }
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
    swoosh: function () { whoosh(.5, 350, 3200, .1); },
    chime: function () { [659.25, 987.77, 1318.5].forEach(function (f, i) { blip(f, f * 1.003, 1.1, .09 / (i + 1), "sine", i * .09); }); },
    live: function () { whoosh(1, 200, 4500, .16); sfx.chime(); },
  };
  var CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [130.81, 164.81, 196], [196, 246.94, 293.66]];
  function startMusic() {
    if (!AC || musicTimer) return;
    musicGain = AC.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
    musicGain.gain.linearRampToValueAtTime(1, AC.currentTime + 1.5);
    var lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100; lp.connect(musicGain);
    var step = 0;
    function bar() {
      var ch = CHORDS[step % CHORDS.length], t0 = AC.currentTime;
      ch.forEach(function (f) {
        [0, 4].forEach(function (det) {
          var o = AC.createOscillator(), g = AC.createGain(); o.type = "triangle"; o.frequency.value = f; o.detune.value = det;
          g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(.022, t0 + 1.4); g.gain.linearRampToValueAtTime(.0001, t0 + 5.2);
          o.connect(g); g.connect(lp); o.start(t0); o.stop(t0 + 5.3);
        });
      });
      for (var k = 0; k < 8; k++) { // petite arpège très douce
        (function (k) {
          var o = AC.createOscillator(), g = AC.createGain(), tt = t0 + k * .66;
          o.type = "sine"; o.frequency.value = ch[k % 3] * 2; env(g, tt, .01, .5, .014); o.connect(g); g.connect(lp); o.start(tt); o.stop(tt + .6);
        })(k);
      }
      step++;
    }
    bar(); musicTimer = setInterval(bar, 5300);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = 0; }
    if (musicGain && AC) { var g = musicGain; g.gain.cancelScheduledValues(AC.currentTime); g.gain.setValueAtTime(g.gain.value, AC.currentTime); g.gain.linearRampToValueAtTime(0, AC.currentTime + .6); setTimeout(function () { try { g.disconnect(); } catch (e) {} }, 800); musicGain = null; }
  }
  // Voix : de vrais enregistrements, un fichier par chapitre (assets/film/voix-1.mp3 … voix-6.mp3).
  // Pas de voix de synthèse : sans fichier, le film reste silencieux côté voix. La durée de chaque chapitre
  // s'adapte à celle de l'enregistrement.
  var VOICE = NARR.map(function (_, i) {
    var a = new Audio(); a.preload = "metadata"; a.src = "assets/film/voix-" + (i + 1) + ".mp3"; a.ok = false;
    a.addEventListener("loadedmetadata", function () { a.ok = isFinite(a.duration); retime(); });
    return a;
  });
  function stopVoices(reset) { VOICE.forEach(function (a) { a.pause(); if (reset) { try { a.currentTime = 0; } catch (e) {} } }); }
  function playVoice(i, fromStart) {
    if (!soundOn || !VOICE[i].ok) return;
    stopVoices(true);
    var a = VOICE[i]; if (fromStart) a.currentTime = 0;
    a.play().catch(function () {});
  }
  function retime() { // durée d'un chapitre = max(durée prévue, voix + 0,8 s)
    var acc = 0;
    CH.forEach(function (c, i) {
      c.d = Math.max(c.d0, VOICE[i].ok ? Math.ceil((VOICE[i].duration + .8) * 2) / 2 : 0);
      START[i] = acc; acc += c.d;
      var li = clipsEl.children[i]; if (li) li.style.setProperty("--d", c.d);
    });
    BODY = acc; TOTAL = BODY + (VOICE[5].ok ? Math.max(5, VOICE[5].duration + 1.2) : 5);
    if (!playing) render(t);
  }
  function startAudio() {
    if (!soundOn) return;
    startMusic();
    var ci = t >= BODY + .4 ? 5 : chapterAt(t);
    var a = VOICE[ci]; if (a.ok && a.currentTime > 0 && !a.ended) a.play().catch(function () {}); else playVoice(ci, true);
  }
  function stopAudio() { stopMusic(); stopVoices(false); }

  // repères sonores : [temps global, bruitage]
  var CUES = [];
  function cue(ch, local, fn) { CUES.push({ ch: ch, l: local, fn: fn }); }
  function cueTime(c) { return c.end ? BODY + .4 : (c.ch < 0 ? c.l : START[c.ch] + c.l); }
  CUES.push({ ch: -1, l: .05, fn: sfx.swoosh });
  [.2, .42, .64].forEach(function (x) { cue(0, x, sfx.tick); });
  cue(0, 1.1, sfx.pop); cue(0, 3.85, sfx.pop2); cue(0, 5.3, sfx.pop);
  cue(1, 0, sfx.swoosh); [1.6, 3.1, 4.6].forEach(function (x) { cue(1, x, sfx.pop); }); cue(1, 5.4, sfx.chime);
  cue(2, 0, sfx.swoosh); [.5, 1.1, 1.4, 1.8, 2.0, 2.4, 2.9, 3.7, 4.0, 4.3].forEach(function (x) { cue(2, x + .15, sfx.tick); });
  cue(3, 0, sfx.swoosh); cue(3, .9, sfx.tick); cue(3, 1.8, sfx.pop); cue(3, 2.7, sfx.swoosh); cue(3, 3.8, sfx.tick); cue(3, 5.8, sfx.chime);
  cue(4, 0, sfx.swoosh); for (var kk = 0; kk < 14; kk++) cue(4, .5 + kk * .105, sfx.key);
  cue(4, 2.5, sfx.live); cue(4, 4.2, sfx.tick); cue(4, 4.9, sfx.tick);
  CUES.push({ end: true, fn: sfx.chime });

  // ---------- commandes ----------
  var clipBtns = CH.map(function (c, i) {
    var li = document.createElement("li");
    li.style.setProperty("--d", c.d);
    li.innerHTML = '<button type="button" data-i="' + i + '"><span>' + c.n + '</span><em>' + c.s + "</em></button>";
    clipsEl.appendChild(li);
    return li.firstChild;
  });

  var seeking = false, t = 0, playing = false, last = 0, raf = 0, lastCh = -1, auto = true, userPaused = false;
  function chapterAt(x) { var c = 0; for (var i = 0; i < CH.length; i++) if (x >= START[i]) c = i; return c; }
  function fmt(s) { s = Math.floor(s); return (s < 10 ? "0" : "") + s; }

  function render(now) {
    t = cl(now, 0, TOTAL);
    var ci = 0;
    for (var i = 0; i < CH.length; i++) if (t >= START[i]) ci = i;
    var local = Math.min(t - START[ci], CH[ci].d);
    scenes.forEach(function (s, i) {
      if (i !== ci) { s.el.style.display = "none"; return; }
      s.el.style.display = "block";
      var d = CH[i].d, fade = ramp(local, 0, .4) * (i === CH.length - 1 ? 1 : 1 - ramp(local, d - .3, d));
      s.el.style.opacity = fade;
      s.draw(local);
    });
    if (ci !== lastCh) {
      lastCh = ci;
      capN.textContent = CH[ci].n + " / 05"; capT.textContent = CH[ci].t; capP.textContent = CH[ci].p;
      cap.classList.remove("swap"); void cap.offsetWidth; if (!reduce || playing) cap.classList.add("swap");
      if (playing && soundOn && !seeking) playVoice(ci, true);
    }
    clipBtns.forEach(function (b, i) {
      b.style.setProperty("--p", cl((t - START[i]) / CH[i].d));
      if (i === ci) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    tcEl.textContent = "00:" + fmt(t) + " / 00:" + fmt(TOTAL);
    if (t >= BODY + .4) player.setAttribute("data-end", ""); else player.removeAttribute("data-end");
  }

  function tick(ts) {
    if (!playing) return;
    var dt = (ts - last) / 1000; last = ts;
    var prev = t;
    render(t + Math.min(dt, .1));
    if (soundOn) CUES.forEach(function (c) { var g = cueTime(c); if (g > prev && g <= t) c.fn(); });
    if (soundOn && prev < BODY + .4 && t >= BODY + .4) playVoice(5, true);
    if (t >= TOTAL) { pause(); return; }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (t >= TOTAL) t = 0;
    playing = true; player.setAttribute("data-playing", ""); pp.setAttribute("aria-label", "Mettre en pause");
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    startAudio();
  }
  function pause() {
    playing = false; player.removeAttribute("data-playing"); pp.setAttribute("aria-label", "Lire");
    cancelAnimationFrame(raf); stopAudio();
  }
  function seek(i) {
    seeking = true; stopVoices(true);
    render(reduce && !playing ? START[i] + CH[i].d - .01 : START[i] + .001);
    seeking = false;
  }

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
    } else {
      soundOn = false; snd.setAttribute("aria-pressed", "false"); player.removeAttribute("data-sound"); stopAudio();
    }
  });
  var replay = document.getElementById("freplay");
  if (replay) replay.addEventListener("click", function () { userPaused = false; render(0); play(); });

  function fit() { inner.style.transform = "scale(" + (vis.clientWidth / 640) + ")"; }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(vis); else addEventListener("resize", fit);
  fit();

  // image figée pour vérifier le rendu : ?film=12.5
  var m = /[?&]film=([\d.]+)/.exec(location.search);
  if (m) { render(+m[1]); return; }

  render(reduce ? CH[0].d - .01 : 0);

  // lecture automatique quand le film est bien visible, pause quand il sort de l'écran
  if ("IntersectionObserver" in window && !reduce) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= .5) { if (!playing && !userPaused && t < TOTAL) play(); }
        else if (playing && !e.isIntersecting) pause();
      });
    }, { threshold: [0, .5] }).observe(player);
  }
})();
