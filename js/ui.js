/* DOM arayüzü: menüler, HUD, duraklatma, sonuç ekranı. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Audio = window.GameAudio;

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function click() { Audio.unlock(); Audio.play('click', 0.7); }

  var scoreShown = 0, scoreTarget = 0, scoreRaf = null;
  function animateScore() {
    scoreShown += Math.ceil((scoreTarget - scoreShown) * 0.2);
    if (Math.abs(scoreTarget - scoreShown) < 5) scoreShown = scoreTarget;
    $('score').textContent = scoreShown.toLocaleString('tr-TR');
    scoreRaf = scoreShown !== scoreTarget ? requestAnimationFrame(animateScore) : null;
  }

  var hintTimer = null;

  var UI = {
    loading: function (p) {
      $('loadBar').style.width = Math.round(p * 100) + '%';
    },
    hud: function (on, level) {
      show('hud', on);
      if (level) {
        $('levelName').textContent = level.id + ' · ' + level.name;
        $('best').textContent = 'En iyi: ' + Game.progress.best(level.id - 1).toLocaleString('tr-TR');
      }
    },
    score: function (v) {
      scoreTarget = v;
      if (v === 0) { scoreShown = 0; $('score').textContent = '0'; }
      else if (!scoreRaf) scoreRaf = requestAnimationFrame(animateScore);
      $('score').classList.remove('bump'); void $('score').offsetWidth; $('score').classList.add('bump');
    },
    hint: function (txt) {
      var h = $('hint');
      clearTimeout(hintTimer);
      if (!txt) { h.classList.remove('on'); return; }
      h.textContent = txt;
      h.classList.add('on');
      hintTimer = setTimeout(function () { h.classList.remove('on'); }, 4200);
    },
    pause: function (on) {
      Game.setPaused(on);
      show('pause', on);
    },
    result: function (won, stars, score, best, idx) {
      var r = $('result');
      r.classList.toggle('lose', !won);
      $('resTitle').textContent = won ? 'BÖLÜM TAMAMLANDI!' : 'DOMUZLAR KAZANDI!';
      $('resSub').textContent = won ? (Game.levels[idx].name) : 'Tekrar dene, bu sefer olacak!';
      $('resScore').textContent = '0';
      $('resBest').textContent = 'En iyi: ' + best.toLocaleString('tr-TR');
      $('btnNext').classList.toggle('hidden', !won);
      if (won && idx === Game.levels.length - 1) $('btnNext').dataset.final = '1'; else delete $('btnNext').dataset.final;
      var st = r.querySelectorAll('.star');
      st.forEach(function (s) { s.classList.remove('on'); });
      show('hud', false);
      show('result', true);
      r.querySelector('.panel').classList.remove('pop'); void r.offsetWidth; r.querySelector('.panel').classList.add('pop');
      // Puan sayacı
      var t0 = performance.now(), dur = 1100;
      function tick(now) {
        var u = Math.min(1, (now - t0) / dur);
        $('resScore').textContent = Math.round(score * (1 - Math.pow(1 - u, 3))).toLocaleString('tr-TR');
        if (u < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      for (var i = 0; i < stars; i++) {
        (function (i) {
          setTimeout(function () { st[i].classList.add('on'); Audio.starDing(i); }, 600 + i * 420);
        })(i);
      }
    },
    buildLevels: function () {
      var box = $('levelCards');
      box.innerHTML = '';
      Game.levels.forEach(function (lv, i) {
        var card = document.createElement('button');
        card.className = 'card theme-' + lv.theme;
        var unlocked = Game.progress.unlocked(i);
        if (!unlocked) card.classList.add('locked');
        var th = Game.thumb(i, 260, 150);
        th.className = 'thumb';
        card.appendChild(th);
        var info = document.createElement('div');
        info.className = 'info';
        var s = Game.progress.stars(i), stars = '';
        for (var k = 0; k < 3; k++) stars += '<span class="mini-star' + (k < s ? ' on' : '') + '"></span>';
        info.innerHTML = '<div class="num">' + lv.id + '</div><div class="nm">' + lv.name + '</div><div class="stars">' + stars + '</div>' +
          '<div class="birds">' + lv.birds.map(function (b) { return '<canvas class="bico" width="48" height="48" data-b="' + b + '"></canvas>'; }).join('') + '</div>';
        card.appendChild(info);
        if (!unlocked) {
          var lock = document.createElement('div'); lock.className = 'lock';
          lock.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1Zm2 0h8V8a4 4 0 1 0-8 0v2Z"/></svg>';
          card.appendChild(lock);
        }
        card.addEventListener('click', function () {
          if (!unlocked) { Audio.play('pluck', 0.5, 0.6); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); return; }
          click();
          show('levels', false);
          show('menu', false);
          Game.play(i);
        });
        box.appendChild(card);
      });
      box.querySelectorAll('.bico').forEach(function (c) { Game.drawBirdIcon(c, c.dataset.b); });
    }
  };
  window.UI = UI;

  function fullscreen() {
    var d = document.documentElement;
    try {
      if (!document.fullscreenElement && d.requestFullscreen) {
        d.requestFullscreen({ navigationUI: 'hide' }).then(function () {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function syncToggles() {
    $('btnSfx').classList.toggle('off', !Audio.sfxOn);
    $('btnMusic').classList.toggle('off', !Audio.musicOn);
    $('pSfx').classList.toggle('off', !Audio.sfxOn);
    $('pMusic').classList.toggle('off', !Audio.musicOn);
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Logo kuşları
    Game.drawBirdIcon($('logoBird'), 'red', { x: 0.9, y: 0.1 });
    Game.drawBirdIcon($('loadBird'), 'red', { x: 0.9, y: 0.1 });

    Game.boot().then(function () {
      setTimeout(function () {
        show('loading', false);
        show('menu', true);
      }, 250);
    });

    $('btnPlay').addEventListener('click', function () {
      click(); fullscreen();
      UI.buildLevels();
      show('menu', false); show('levels', true);
    });
    $('btnBack').addEventListener('click', function () { click(); show('levels', false); show('menu', true); });
    $('btnSfx').addEventListener('click', function () { Audio.setSfx(!Audio.sfxOn); click(); syncToggles(); });
    $('btnMusic').addEventListener('click', function () { click(); Audio.setMusic(!Audio.musicOn); syncToggles(); });
    $('pSfx').addEventListener('click', function () { Audio.setSfx(!Audio.sfxOn); click(); syncToggles(); });
    $('pMusic').addEventListener('click', function () { click(); Audio.setMusic(!Audio.musicOn); syncToggles(); });
    $('btnFull').addEventListener('click', function () { click(); fullscreen(); });
    $('btnPause').addEventListener('click', function () { click(); UI.pause(true); });
    $('btnRestart').addEventListener('click', function () { click(); Game.restart(); UI.hud(true, Game.levels[G.levelIndex]); });
    $('pResume').addEventListener('click', function () { click(); UI.pause(false); });
    $('pRestart').addEventListener('click', function () { click(); UI.pause(false); Game.restart(); UI.hud(true, Game.levels[G.levelIndex]); });
    $('pMenu').addEventListener('click', function () {
      click(); UI.pause(false); Game.toMenu(); UI.buildLevels(); show('levels', true);
    });
    $('btnRetry').addEventListener('click', function () { click(); show('result', false); Game.restart(); UI.hud(true, Game.levels[G.levelIndex]); });
    $('btnLevels').addEventListener('click', function () { click(); show('result', false); Game.toMenu(); UI.buildLevels(); show('levels', true); });
    $('btnNext').addEventListener('click', function () {
      click(); show('result', false);
      if ($('btnNext').dataset.final) { Game.toMenu(); UI.buildLevels(); show('levels', true); }
      else { Game.next(); UI.hud(true, Game.levels[G.levelIndex]); }
    });
    syncToggles();

    // İlk dokunuşta ses kilidini aç
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () { Audio.unlock(); }, { passive: true });
    });
  });
})();
