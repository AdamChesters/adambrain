export function createLoadingUI() {
  const overlay = document.getElementById('modelLoading');
  const meter = document.getElementById('loadingMeter');
  const value = document.getElementById('loadingPercent');
  const arc = document.getElementById('loadingArc');
  const message = document.getElementById('loadingMessage');
  const retry = document.getElementById('loadingRetry');
  let active = true;
  // Load trace shown under the meter: transport, volume stages, pending layers and the first frame.
  const trace = document.createElement('pre');
  trace.style.cssText = 'margin:12px 0 0;max-width:92vw;max-height:40vh;overflow:auto;font:11px/1.35 ui-monospace,monospace;text-align:left;white-space:pre-wrap;opacity:.85';
  overlay.append(trace);
  const draw = () => {
    if (!active) return;
    const h = window.__hybrid, s = h?.structures, gl = h?.renderer?.getContext?.();
    let gpu = '';
    try { const d = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; } catch {}
    const lines = [
      't=' + Math.round(performance.now()) + ' stage=' + (h?.stage || 'start') + (h?.error ? ' error=' + h.error : ''),
      'gpu=' + gpu + ' lost=' + (gl?.isContextLost?.() ?? '?'),
      'layers pending=' + (s ? [...s.pending.keys()].join(',') || '-' : '?') + ' waiting=' + (s ? s.slots.filter(x => x.wanted && x.data.loaded === false).map(x => x.id).join(',') || '-' : '?') + ' failed=' + (s ? [...s.failures.entries()].map(e => e.join(':')).join(',') || '-' : '?'),
      'first frame=' + (window.__firstFrame || 'not submitted') + ' skip=' + JSON.stringify(h?.occStats ? {ms: h.occStats.buildMS, exact: h.occStats.exactSlots.length} : (h?.occError || 'pending')),
      ...(window.sourceTrace || []).slice(-14).map(e => e.t + ' ' + e.f + ' ' + e.stage)
    ];
    trace.textContent = lines.join('\n');
    setTimeout(draw, 500);
  };
  draw();
  let failed = false;
  let percent = 0;
  const progress = next => {
    if (!active || failed) return;
    percent = Math.max(percent, Math.min(95, Math.floor(next)));
    value.textContent = percent + '%';
    meter.setAttribute('aria-valuenow', percent);
    arc.style.strokeDasharray = percent ? '100' : '20 80';
    arc.style.strokeDashoffset = percent ? 100 - percent : 0;
    message.textContent = percent >= 95 ? 'Preparing view…' : 'Loading model…';
  };
  const fail = reason => {
    if (!active || failed) return;
    console.error('Model load failed:', reason);
    failed = true;
    overlay.classList.add('failed');
    meter.hidden = true;
    message.textContent = 'The model could not load.' + (reason ? ' (' + String(reason).slice(0, 160) + ')' : '');
    retry.hidden = false;
  };
  retry.addEventListener('click', () => location.reload());
  addEventListener('error', e => fail('script: ' + (e.message || e.error || 'unknown')));
  addEventListener('unhandledrejection', e => { if (!window.studioReady) fail('async: ' + (e.reason?.message || e.reason)); });
  return {
    get active() { return active; },
    progress,
    fail,
    done() {
      if (!active || failed) return;
      active = false;
      value.textContent = '100%';
      meter.setAttribute('aria-valuenow', '100');
      arc.style.strokeDashoffset = 0;
      overlay.classList.add('complete');
      setTimeout(() => { overlay.hidden = true; }, 180);
    }
  };
}
