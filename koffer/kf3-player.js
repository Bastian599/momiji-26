// Player für den 3D-Koffer-Film: lädt Three.js erst beim ersten Abspielen nach.
// Die Musik ist der Taktgeber; ohne Ton läuft eine eigene Uhr weiter.
const DUR = 51;
const wrap = document.getElementById('kf3Wrap'), view = document.getElementById('kf3View');
const fallback = document.getElementById('kfStage');
function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
if (!wrap || !view) { /* Abschnitt fehlt */ }
else if (!webgl()) { wrap.hidden = true; if (fallback) fallback.hidden = false; }
else {
  const $ = id => document.getElementById(id);
  const audio = $('kf3Audio'), poster = $('kf3Poster'), big = $('kf3Big'), load = $('kf3Load');
  const btn = $('kf3Play'), restart = $('kf3Restart'), bar = $('kf3Bar'), fill = $('kf3Fill'), time = $('kf3Time'), muteBtn = $('kf3Mute');
  let film = null, on = false, t = 0, last = 0, muted = false, loading = null;
  try { muted = localStorage.getItem('kf3mute') === '1'; } catch (e) {}
  const clock = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function ui() {
    btn.textContent = on ? '❚❚' : '▶'; btn.setAttribute('aria-label', on ? 'Pause' : 'Abspielen');
    fill.style.width = (t / DUR * 100).toFixed(2) + '%'; bar.setAttribute('aria-valuenow', Math.round(t));
    time.textContent = clock(t) + ' / ' + clock(DUR);
    muteBtn.textContent = muted ? '🔇' : '♪'; muteBtn.setAttribute('aria-label', muted ? 'Ton an' : 'Ton aus');
    const end = t >= DUR - .05; big.hidden = on || (t > 0 && !end); big.querySelector('span').textContent = end ? '↺ Nochmal ansehen' : '▶ Film ab · 0:51';
  }
  function ensure() {
    if (film) return Promise.resolve(film);
    if (!loading) loading = (async () => {
      load.hidden = false;
      try {
        const mod = await import('./kf3d.js');
        film = mod.createFilm(view, { width: view.clientWidth, height: view.clientHeight, maxDpr: 1.5 });
        new ResizeObserver(() => { film.resize(view.clientWidth, view.clientHeight); if (!on) film.renderAt(t); }).observe(view);
        film.renderAt(t); poster.hidden = true;
      } catch (e) { wrap.hidden = true; if (fallback) fallback.hidden = false; throw e; }
      finally { load.hidden = true; }
      return film;
    })();
    return loading;
  }
  function frame(ts) {
    if (!on) return;
    const useAudio = !muted && !audio.paused && audio.readyState >= 2;
    let nt = useAudio ? audio.currentTime : t + (last ? Math.min(.1, (ts - last) / 1000) : 0); last = ts;
    if (nt >= DUR) { t = DUR; film.renderAt(t); on = false; audio.pause(); ui(); return; }
    t = nt; film.renderAt(t); ui(); requestAnimationFrame(frame);
  }
  async function play() {
    try { await ensure(); } catch (e) { return; }
    if (t >= DUR - .05) t = 0;
    on = true; last = 0; audio.muted = muted;
    try { audio.currentTime = t; await audio.play(); } catch (e) {}
    requestAnimationFrame(frame); ui();
  }
  function pause() { on = false; audio.pause(); ui(); }
  function seek(x) { t = Math.max(0, Math.min(DUR, x)); try { audio.currentTime = t; } catch (e) {} if (film) film.renderAt(t); ui(); }
  big.addEventListener('click', play);
  btn.addEventListener('click', () => on ? pause() : play());
  view.addEventListener('click', e => { if (e.target === big || big.contains(e.target)) return; on ? pause() : play(); });
  restart.addEventListener('click', () => { const was = on; pause(); seek(0); if (was) play(); });
  muteBtn.addEventListener('click', () => { muted = !muted; audio.muted = muted; try { localStorage.setItem('kf3mute', muted ? '1' : '0'); } catch (e) {} if (!muted && on) { audio.currentTime = t; audio.play().catch(() => {}); } ui(); });
  let drag = false; const at = e => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DUR; };
  bar.addEventListener('pointerdown', async e => { drag = true; try { bar.setPointerCapture(e.pointerId); } catch (x) {} try { await ensure(); } catch (x) { return; } seek(at(e)); });
  bar.addEventListener('pointermove', e => { if (drag && film) seek(at(e)); });
  bar.addEventListener('pointerup', () => { drag = false; });
  bar.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); ensure().then(() => seek(t + (e.key === 'ArrowRight' ? 3 : -3))).catch(() => {}); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && on) pause(); });
  ui();
}
