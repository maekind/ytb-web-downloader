(function () {
  if (localStorage.getItem('ytb-consent')) return;

  const banner = document.createElement('div');
  banner.id = 'consent-banner';
  banner.className = 'consent-banner';
  banner.innerHTML = `
    <div class="consent-inner">
      <div class="consent-body">
        <svg class="consent-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
          <path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>
        </svg>
        <p class="consent-text">
          Almacenamos en tu navegador el identificador de tu cola de descargas para poder recuperarla siempre que vuelvas. No usamos cookies de seguimiento ni publicidad.
          <a href="/politica-privacidad" class="consent-link">Más información</a>
        </p>
      </div>
      <button id="consent-close" class="consent-close" aria-label="Cerrar aviso">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('consent-close').addEventListener('click', function () {
    localStorage.setItem('ytb-consent', 'accepted');
    banner.classList.add('consent-banner--hiding');
    banner.addEventListener('animationend', function () { banner.remove(); }, { once: true });
  });
})();
