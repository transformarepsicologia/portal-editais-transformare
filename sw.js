// Service worker do Radar Transformare (PWA).
// Regra: sempre tenta a internet primeiro; o cache só entra quando a pessoa está sem conexão.
// Só mexe em arquivos do próprio site. Banco (Supabase), pagamentos e bibliotecas externas passam direto.
const VERSAO = 'radar-v2';

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

// ---- Notificações push ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Radar Transformare', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Radar Transformare', {
    body: d.body || '', icon: 'assets/pwa-192.png', badge: 'assets/pwa-192.png',
    tag: d.tag || 'radar', renotify: true, data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const aberta = lista.find((c) => c.url.startsWith(self.location.origin));
      if (aberta) { return aberta.focus().then(() => aberta.navigate ? aberta.navigate(alvo) : self.clients.openWindow(alvo)); }
      return self.clients.openWindow(alvo);
    })
  );
});
