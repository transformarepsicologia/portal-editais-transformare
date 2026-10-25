// Service worker do Radar Transformare (PWA).
// Regra: sempre tenta a internet primeiro; o cache só entra quando a pessoa está sem conexão.
// Só mexe em arquivos do próprio site. Banco (Supabase), pagamentos e bibliotecas externas passam direto.
const VERSAO = 'radar-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') || caches.match('index.html') : undefined))
      )
  );
});
