(() => {
  const { api } = AdPod;
  const $ = id => document.getElementById(id);
  const ua = navigator.userAgent;
  const b = /Firefox\//.test(ua) ? 'firefox' : /Edg\//.test(ua) ? 'edge'
    : (/Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)) ? 'safari' : 'chrome';
  const STEPS = {
    chrome: ['Klik ikon puzzle di toolbar, lalu sematkan (pin) AdPod Skipper.', 'Buka halaman yang berisi iklan atau video, lalu perhatikan angka pada ikon.'],
    edge: ['Klik ikon Ekstensi di toolbar, lalu pilih ikon mata di samping AdPod Skipper agar tampil.', 'Buka halaman yang berisi iklan atau video, lalu perhatikan angka pada ikon.'],
    firefox: ['Klik ikon Ekstensi di toolbar, pilih roda gigi di samping AdPod Skipper, lalu Kelola ekstensi.', 'Buka tab Izin dan aktifkan akses ke semua situs web, atau tekan tombol di atas.', 'Sematkan ikon ke toolbar lewat menu Ekstensi.'],
    safari: ['Di Mac: buka Safari, Pengaturan, Ekstensi, lalu centang AdPod Skipper.', 'Klik Edit Situs Web dan ubah pilihan menjadi Izinkan untuk semua situs web.', 'Di iPhone atau iPad: buka Pengaturan, Apps, Safari, Ekstensi, lalu aktifkan AdPod Skipper dan izinkan semua situs.']
  };
  $('btitle').textContent = 'Petunjuk untuk ' + { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', safari: 'Safari' }[b];
  $('steps').replaceChildren(...STEPS[b].map(t => Object.assign(document.createElement('li'), { textContent: t })));

  async function check() {
    let ok = false;
    try { ok = await api.permissions.contains({ origins: ['<all_urls>'] }); } catch {}
    $('status').textContent = ok ? 'Izin sudah diberikan' : 'Izin belum diberikan';
    $('status').className = 'status ' + (ok ? 'ok' : 'no');
    $('grant').hidden = ok || b === 'safari';
  }
  $('grant').onclick = async () => { try { await api.permissions.request({ origins: ['<all_urls>'] }); } catch {} check(); };
  $('opts').onclick = e => { e.preventDefault(); api.runtime.openOptionsPage(); };
  check();
})();
