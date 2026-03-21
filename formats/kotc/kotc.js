'use strict';

(function bootKotcMvp() {
  const params = new URLSearchParams(location.search);
  const qs = params.toString();
  const legacyUrl = '/web/public/kotc/index.html' + (qs ? ('?' + qs) : '');

  const openLegacyBtn = document.getElementById('kotc-open-legacy');
  const embedLegacyBtn = document.getElementById('kotc-open-embedded');
  const embedWrap = document.getElementById('kotc-embed-wrap');
  const embed = document.getElementById('kotc-embed');

  if (openLegacyBtn) {
    openLegacyBtn.addEventListener('click', () => {
      window.open(legacyUrl, '_blank');
    });
  }

  if (embedLegacyBtn && embedWrap && embed) {
    embedLegacyBtn.addEventListener('click', () => {
      embed.src = legacyUrl;
      embedWrap.hidden = false;
      embedLegacyBtn.disabled = true;
    });
  }
})();

