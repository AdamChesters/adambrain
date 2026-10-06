export function createLoadingUI() {
  const overlay = document.getElementById('modelLoading');
  const meter = document.getElementById('loadingMeter');
  const value = document.getElementById('loadingPercent');
  const arc = document.getElementById('loadingArc');
  const message = document.getElementById('loadingMessage');
  const retry = document.getElementById('loadingRetry');
  let active = true;
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
  const fail = () => {
    if (!active || failed) return;
    failed = true;
    overlay.classList.add('failed');
    meter.hidden = true;
    message.textContent = 'The model could not load.';
    retry.hidden = false;
  };
  retry.addEventListener('click', () => location.reload());
  addEventListener('error', fail);
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
