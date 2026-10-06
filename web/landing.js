(() => {
  const video = document.getElementById('cover-video');
  const gif = document.getElementById('cover-gif');
  let inView = true;
  let useGif = false;
  let attempt = 0;
  video.defaultMuted = true;
  video.muted = true;
  const syncGif = () => {
    // Stop GIF animation while the preview is offscreen or the tab is hidden.
    const src = !inView || document.hidden ? video.poster : gif.dataset.src;
    if (gif.getAttribute('src') !== src) gif.src = src;
  };
  const fallback = () => {
    if (useGif) return;
    useGif = true;
    ++attempt;
    video.pause();
    syncGif();
  };
  const sync = () => {
    const currentAttempt = ++attempt;
    if (useGif) {
      syncGif();
    } else if (!inView || document.hidden) {
      video.pause();
    } else {
      video.play().catch(error => {
        // Visibility pauses can cancel a pending play.
        if (currentAttempt !== attempt || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') fallback();
      });
    }
  };
  gif.addEventListener('load', () => {
    if (useGif) { video.hidden = true; gif.hidden = false; }
  });
  gif.addEventListener('error', () => {
    gif.hidden = true;
    video.hidden = false;
  });
  video.addEventListener('loadeddata', sync);
  video.addEventListener('canplay', sync);
  video.addEventListener('error', fallback);
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); }, { threshold: 0.1 }).observe(video.parentElement);
  sync();
})();
