// Adapter iklan video/overlay. Slot iklan statis ditangani lapisan kosmetik (content/cosmetic.js).
// Jenis tugas: video (bisukan + majukan ke akhir), click (tombol lewati/tutup).
(() => {
  const all = (root, sel) => Array.from(root.querySelectorAll(sel));
  const CLOSE = '[aria-label="Close ad" i], [aria-label="Tutup iklan" i]';
  // Pemutar umum (Google IMA, JW Player, Video.js) menandai state iklan lewat class.
  const AD_PLAYERS = '.ima-ad-container, .jw-flag-ads, .vjs-ad-playing, .video-ads';
  const SKIP = '.videoAdUiSkipButton, .jw-skip, .vjs-skip-button, .ima-skip-button';

  const youtube = doc => {
    const t = [], p = doc.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting');
    if (p) {
      const skip = p.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button');
      const v = p.querySelector('video');
      if (skip) t.push({ type: 'click', el: skip });
      if (v) t.push({ type: 'video', el: v });
    }
    all(doc, '.ytp-ad-overlay-close-button').forEach(el => t.push({ type: 'click', el }));
    return t;
  };

  const generic = doc => {
    const t = [];
    all(doc, AD_PLAYERS).forEach(box => {
      const v = box.tagName === 'VIDEO' ? box : box.querySelector('video') || box.closest('div')?.querySelector('video');
      if (v) t.push({ type: 'video', el: v });
    });
    if (t.length) all(doc, SKIP).forEach(el => t.push({ type: 'click', el }));
    all(doc, CLOSE).forEach(el => t.push({ type: 'click', el }));
    return t;
  };

  globalThis.AdPodAdapters = {
    collect: (doc, host, cfg) => !cfg.video ? [] : /(^|\.)youtube\.com$/.test(host) ? youtube(doc) : generic(doc)
  };
})();
