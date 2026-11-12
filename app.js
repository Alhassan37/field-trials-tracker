'use strict';
/* =========================================================
   متابعة التجارب الحقلية — Offline-first PWA
   التخزين المحلي: IndexedDB  |  الربط: Google Apps Script (Sheets + Drive + Docs)
   ========================================================= */

// ---------- Helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const nowISO = () => new Date().toISOString();
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayStr = () => fmtDate(new Date());
const addDays = (s, n) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return fmtDate(new Date(y, m - 1, d + Number(n || 0))); };
const daysBetween = (a, b) => { const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 86400000); };
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const niceDate = s => { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${AR_DAYS[dt.getDay()]} ${d}/${m}`; };
const relDay = s => { if (!s) return ''; const n = daysBetween(todayStr(), s); if (n === 0) return 'النهارده'; if (n === 1) return 'بكره'; if (n === -1) return 'امبارح'; return n > 0 ? `بعد ${n} يوم` : `متأخر ${-n} يوم`; };
const initials = name => (String(name || '؟').trim()[0] || '؟');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const ICON = {
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function confirmBox(msg, okText = 'تأكيد', danger = false) {
  return new Promise(res => {
    const m = $('#modal');
    $('#modalBody').innerHTML = `<div class="stack"><h2>${esc(msg)}</h2><div class="row" style="justify-content:flex-end">
      <button class="btn" data-a="0">إلغاء</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="1">${esc(okText)}</button></div></div>`;
    $$('#modalBody [data-a]').forEach(b => b.onclick = () => { m.close(); res(b.dataset.a === '1'); });
    m.showModal();
  });
}

// ---------- IndexedDB ----------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('fieldTrials', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('clients', { keyPath: 'id' });
        db.createObjectStore('visits', { keyPath: 'id' }).createIndex('clientId', 'clientId');
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('visitId', 'visitId');
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const s = t.objectStore(store);
      let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  get(store, id) { return this.tx(store, 'readonly', s => s.get(id)); },
  put(store, obj) { return this.tx(store, 'readwrite', s => s.put(obj)); },
  del(store, id) { return this.tx(store, 'readwrite', s => s.delete(id)); },
  byIndex(store, idx, val) { return this.tx(store, 'readonly', s => s.index(idx).getAll(val)); },
  clear(store) { return this.tx(store, 'readwrite', s => s.clear()); },
};

// ---------- Settings ----------
const DEFAULTS = {
  apiUrl: '', token: '', user: '', codePrefix: 'C', autoSync: true, autoPhotos: true, wifiOnly: false, syncEvery: 5, theme: 'auto',
  products: ['يونايت', 'أجري كيور'],
  templates: [
    { key: 'v1', name: 'زيارة 1 - يونايت', offset: 0, product: 'يونايت' },
    { key: 'v2', name: 'زيارة 2 - أجري كيور', offset: 7, product: 'أجري كيور' },
    { key: 'v3', name: 'زيارة 3 - متابعة نهائية', offset: 14, product: '' },
  ],
  regions: [], defaultLines: 100, lastPull: '', lastSync: '', lastPhotoUpload: '',
};
let S = { ...DEFAULTS };
async function loadSettings() { const m = await DB.get('meta', 'settings'); S = { ...DEFAULTS, ...(m ? m.value : {}) }; applyTheme(); }
async function saveSettings() { await DB.put('meta', { key: 'settings', value: S }); applyTheme(); }
function applyTheme() { if (S.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', S.theme); }

// ---------- Domain ----------
const isActive = r => r && !r.deleted;
async function loadAll() {
  const [clients, visits, photos] = await Promise.all([DB.all('clients'), DB.all('visits'), DB.all('photos')]);
  return { clients: clients.filter(isActive), visits: visits.filter(isActive), photos };
}
/** حالة كل زيارة مخططة لعميل */
function planFor(client, visits) {
  const mine = visits.filter(v => v.clientId === client.id);
  const byKey = {}; mine.forEach(v => { if (v.visitKey && v.visitKey !== 'extra') { if (!byKey[v.visitKey] || (v.updatedAt > byKey[v.visitKey].updatedAt)) byKey[v.visitKey] = v; } });
  const first = S.templates[0] && byKey[S.templates[0].key];
  const base = (first && first.status === 'done' && first.date) ? addDays(first.date, -(S.templates[0].offset || 0)) : (client.startDate || todayStr());
  const today = todayStr(); let prevDone = true;
  const steps = S.templates.map((t, i) => {
    const v = byKey[t.key];
    let planned = (v && v.status !== 'done' && v.plannedDate) ? v.plannedDate : addDays(base, t.offset);
    // لو الزيارة اللي قبلها اتعملت متأخر، الموعد يتحسب من تاريخها الفعلي
    if (i > 0) { const pv = byKey[S.templates[i - 1].key]; if (pv && pv.status === 'done' && pv.date && !(v && v.plannedDate && v.status !== 'done')) { planned = addDays(pv.date, t.offset - S.templates[i - 1].offset); } }
    const done = !!(v && v.status === 'done');
    let state = done ? 'done' : (!prevDone ? 'locked' : planned < today ? 'late' : planned === today ? 'due' : 'next');
    prevDone = prevDone && done;
    return { t, i, v, planned, done, state };
  });
  const extras = mine.filter(v => v.visitKey === 'extra').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const next = steps.find(s => !s.done);
  return { steps, extras, next, doneCount: steps.filter(s => s.done).length, total: steps.length };
}
async function pendingCounts() {
  const [c, v, p] = await Promise.all([DB.all('clients'), DB.all('visits'), DB.all('photos')]);
  return { clients: c.filter(x => !x.synced).length, visits: v.filter(x => !x.synced).length, photos: p.filter(x => !x.uploaded).length };
}
function nextCode(clients) {
  const pre = (S.codePrefix || 'C').trim();
  let max = 0; clients.forEach(c => { const m = String(c.code || '').match(new RegExp('^' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-?(\\d+)$')); if (m) max = Math.max(max, +m[1]); });
  return `${pre}-${String(max + 1).padStart(3, '0')}`;
}
const mapUrl = (lat, lng) => (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';
const telUrl = p => p ? `tel:${String(p).replace(/\s/g, '')}` : '';
const waUrl = p => { if (!p) return ''; let n = String(p).replace(/\D/g, ''); if (n.startsWith('0')) n = '20' + n.slice(1); return `https://wa.me/${n}`; };

// ---------- Geolocation & photos ----------
function getLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('الجهاز لا يدعم تحديد الموقع'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy), locAt: nowISO() }),
      e => rej(new Error(e.code === 1 ? 'لازم تسمح للتطبيق بالوصول للموقع' : 'تعذر تحديد الموقع، جرّب في مكان مفتوح')),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 30000 });
  });
}
async function compressImage(file, max = 1600, q = 0.8) {
  try {
    let src, w, h;
    if (window.createImageBitmap) { src = await createImageBitmap(file); w = src.width; h = src.height; }
    else { src = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = URL.createObjectURL(file); }); w = src.naturalWidth; h = src.naturalHeight; }
    const s = Math.min(1, max / Math.max(w, h)); const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', q));
  } catch (e) { return file; }
}
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });

// ---------- API (Google Apps Script) ----------
async function api(action, payload = {}) {
  if (!S.apiUrl) throw new Error('لسه ماربطتش التطبيق بجوجل — من الإعدادات');
  const r = await fetch(S.apiUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S.token, payload }) });
  const text = await r.text(); let j;
  try { j = JSON.parse(text); } catch (e) {
    if (/accounts\.google|ServiceLogin|Sign in/i.test(r.url + text.slice(0, 2000))) throw new Error('جوجل طالب تسجيل دخول: في Apps Script خلي Who has access = Anyone واعمل New version');
    throw new Error('رد غير متوقع من السيرفر — راجع رابط الربط (لازم آخره /exec)');
  }
  if (!j.ok) throw new Error(j.error || 'خطأ من السيرفر');
  return j.data;
}
const strip = o => { const c = { ...o }; delete c.synced; delete c.blob; return c; };

let syncing = false;
async function syncData({ silent = false, log = () => { } } = {}) {
  if (syncing) return false;
  if (!navigator.onLine) { if (!silent) toast('مفيش إنترنت — البيانات محفوظة على الجهاز'); return false; }
  if (!S.apiUrl) { if (!silent) toast('اربط التطبيق بجوجل من الإعدادات الأول'); return false; }
  syncing = true; updateNet();
  try {
    const clients = (await DB.all('clients')).filter(c => !c.synced);
    for (const c of clients) {
      log(`رفع العميل ${c.code} ${c.name || ''}`);
      const res = await api('upsertClient', { client: strip(c), templates: S.templates });
      const cur = await DB.get('clients', c.id);
      if (cur) { Object.assign(cur, res || {}); if (cur.updatedAt === c.updatedAt) cur.synced = 1; await DB.put('clients', cur); }
    }
    const visits = (await DB.all('visits')).filter(v => !v.synced);
    for (const v of visits) {
      log(`رفع ${v.visitName || 'زيارة'} — ${v.clientCode || ''}`);
      const res = await api('upsertVisit', { visit: strip(v) });
      const cur = await DB.get('visits', v.id);
      if (cur) { Object.assign(cur, res || {}); if (cur.updatedAt === v.updatedAt) cur.synced = 1; await DB.put('visits', cur); }
    }
    if (S.configDirty && adminPass !== null) { log('إرسال الإعدادات لكل الأجهزة…'); try { await pushSharedConfig(); } catch (e) { log('الإعدادات: ' + e.message); } }
    log('سحب التحديثات من الشيت…');
    const data = await api('pull', { since: S.lastPull || '' });
    let n = 0;
    for (const sc of data.clients || []) { const l = await DB.get('clients', sc.id); if (!l || (l.synced && (sc.updatedAt || '') >= (l.updatedAt || ''))) { await DB.put('clients', { ...normalize(sc), synced: 1 }); n++; } else if (l) { l.folderUrl = sc.folderUrl || l.folderUrl; l.docUrl = sc.docUrl || l.docUrl; await DB.put('clients', l); } }
    for (const sv of data.visits || []) { const l = await DB.get('visits', sv.id); if (!l || (l.synced && (sv.updatedAt || '') >= (l.updatedAt || ''))) { await DB.put('visits', { ...normalize(sv), synced: 1 }); n++; } }
    if (data.config && !S.configDirty && await applySharedConfig(data.config)) log('اتحدثت الإعدادات من الأدمن ✓');
    S.lastPull = data.serverTime; S.lastSync = nowISO(); await saveSettings();
    log(`تمت المزامنة ✓ (${clients.length} عميل، ${visits.length} زيارة مرفوعة، ${n} تحديث)`);
    if (!silent) toast('تمت المزامنة ✓');
    return true;
  } catch (e) { log('خطأ: ' + e.message); if (!silent) toast('خطأ في المزامنة: ' + e.message, 4500); return false; }
  finally { syncing = false; updateNet(); }
}
function normalize(o) {
  const r = { ...o };
  ['extra'].forEach(k => { if (typeof r[k] === 'string') { try { r[k] = r[k] ? JSON.parse(r[k]) : []; } catch (e) { r[k] = []; } } });
  ['lat', 'lng', 'accuracy', 'acreage', 'order', 'photosCount'].forEach(k => { if (r[k] !== '' && r[k] != null && !isNaN(r[k])) r[k] = Number(r[k]); });
  r.deleted = r.deleted === true || r.deleted === 'TRUE' || r.deleted === '1' || r.deleted === 1 ? 1 : 0;
  return r;
}
let uploading = false;
const onWifiOrUnknown = () => { const c = navigator.connection; return !c || !c.type || c.type === 'wifi' || c.type === 'ethernet'; };
async function uploadPhotos({ log = () => { }, onProgress = () => { }, silent = false } = {}) {
  if (uploading) return;
  if (!navigator.onLine) { if (!silent) toast('رفع الصور محتاج إنترنت'); return; }
  if (!silent || !syncing) { const ok = await syncData({ silent: true, log }); if (!ok) { if (!silent) toast('لازم المزامنة تنجح الأول'); return; } }
  uploading = true; try {
  const photos = (await DB.all('photos')).filter(p => !p.uploaded);
  const touched = new Set(); let done = 0, skipped = 0;
  for (const p of photos) {
    const v = await DB.get('visits', p.visitId);
    if (!v || v.deleted) { await DB.del('photos', p.id); continue; }
    if (!v.synced) { skipped++; continue; }
    try {
      log(`رفع صورة ${done + 1}/${photos.length} — ${v.clientCode} / ${v.visitName}`);
      const res = await api('uploadPhoto', { photo: { id: p.id, visitId: p.visitId, clientId: p.clientId, mime: 'image/jpeg', data: await blobToB64(p.blob), takenAt: p.takenAt, lat: p.lat || '', lng: p.lng || '' } });
      p.uploaded = 1; p.driveUrl = res.url; p.uploadedAt = nowISO(); await DB.put('photos', p);
      touched.add(p.clientId); done++; onProgress(done, photos.length);
    } catch (e) { log('خطأ في صورة: ' + e.message); skipped++; }
  }
  if (touched.size) { log('تحديث ملفات العملاء (Docs)…'); try { await api('rebuildDocs', { clientIds: [...touched] }); } catch (e) { log('خطأ في تحديث الملفات: ' + e.message); } }
  if (done) { S.lastPhotoUpload = nowISO(); await saveSettings(); }
  log(`اترفع ${done} صورة${skipped ? ` — ${skipped} لم تُرفع` : ''} ✓`);
  if (!silent || done) toast(`اترفع ${done} صورة ✓`);
  } finally { uploading = false; updateNet(); }
}

// ---------- Network pill ----------
async function updateNet() {
  const pill = $('#netPill'); const on = navigator.onLine;
  pill.classList.toggle('online', on); pill.classList.toggle('offline', !on);
  $('#netText').textContent = syncing ? 'جاري المزامنة…' : on ? 'متصل' : 'أوفلاين';
  try { const c = await pendingCounts(); const n = c.clients + c.visits; const b = $('#pendingBadge'); b.hidden = !(n + c.photos); b.textContent = n + c.photos; b.title = `${n} سجل + ${c.photos} صورة`; } catch (e) { }
}
/** مزامنة تلقائية: البيانات + الصور في الخلفية */
async function autoSync() {
  if (!S.autoSync || !S.apiUrl || !navigator.onLine || syncing || uploading) return;
  const ok = await syncData({ silent: true });
  if (ok && S.autoPhotos && (!S.wifiOnly || onWifiOrUnknown())) {
    const pend = (await DB.all('photos')).some(p => !p.uploaded);
    if (pend) await uploadPhotos({ silent: true });
  }
  if (ok && /^#\/(home|clients|sync)?$/.test(location.hash || '#/home') && !document.querySelector('form')) route();
}
let autoTimer = null;
function startAutoSync() { clearInterval(autoTimer); if (S.autoSync) autoTimer = setInterval(autoSync, Math.max(1, Number(S.syncEvery) || 5) * 60000); }
window.addEventListener('online', () => { updateNet(); autoSync(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });
window.addEventListener('offline', updateNet);

// ---------- Router ----------
const routes = [
  [/^#\/home$/, viewHome], [/^#\/clients$/, viewClients], [/^#\/client-new$/, () => viewClientForm(null)],
  [/^#\/client\/([^/]+)\/edit$/, m => viewClientForm(m[1])], [/^#\/client\/([^/]+)$/, m => viewClient(m[1])],
  [/^#\/visit\/new\/([^/]+)\/([^/]+)$/, m => viewVisitForm({ clientId: m[1], key: m[2] })], [/^#\/visit\/([^/]+)$/, m => viewVisitForm({ id: m[1] })],
  [/^#\/sync$/, viewSync], [/^#\/settings$/, viewSettings],
];
let filterRegion = '';
async function route() {
  const h = location.hash || '#/home';
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { setTab(h); window.scrollTo(0, 0); await fn(m); return; } }
  location.hash = '#/home';
}
function setTab(h) {
  const tab = h.startsWith('#/client') && !h.startsWith('#/client-new') ? 'clients' : h.startsWith('#/visit') ? 'home' : h.startsWith('#/client-new') ? 'new' : h.slice(2);
  $$('.bottomnav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
}
const view = html => { $('#view').innerHTML = html; };

// ---------- Views: Home (follow-up) ----------
async function viewHome() {
  const { clients, visits, photos } = await loadAll();
  const regions = [...new Set(clients.map(c => c.region).filter(Boolean))];
  const list = clients.filter(c => !filterRegion || c.region === filterRegion);
  const today = todayStr(), week = addDays(today, 7);
  const due = { late: [], due: [], next: [] };
  let doneVisits = 0, totalVisits = 0, completed = 0;
  list.forEach(c => {
    const p = planFor(c, visits); doneVisits += p.doneCount; totalVisits += p.total; if (!p.next) completed++;
    if (p.next) { if (p.next.state === 'late') due.late.push([c, p]); else if (p.next.state === 'due') due.due.push([c, p]); else if (p.next.planned <= week) due.next.push([c, p]); }
  });
  Object.values(due).forEach(a => a.sort((x, y) => x[1].next.planned.localeCompare(y[1].next.planned)));
  const pendingPh = photos.filter(p => !p.uploaded).length;
  const todayDone = visits.filter(v => v.status === 'done' && v.date === today && (!filterRegion || v.region === filterRegion)).length;
  const card = ([c, p], cls) => `
    <div class="item ${cls}">
      <div class="avatar">${esc(initials(c.name))}</div>
      <div class="body">
        <div class="row between"><div class="title">${esc(c.name || 'بدون اسم')}</div><span class="tag">${esc(c.code)}</span></div>
        <div class="meta">${esc([c.region, c.area, c.village].filter(Boolean).join(' • ') || '—')}</div>
        <div class="row" style="margin-top:4px"><span class="tag ${cls === 'overdue' ? 'red' : cls === 'today' ? 'amber' : 'blue'}">${esc(p.next.t.name)}</span>
          <span class="small muted">${niceDate(p.next.planned)} · ${relDay(p.next.planned)}</span></div>
        <div class="actions">
          <a class="btn sm primary" href="#/visit/new/${c.id}/${p.next.t.key}">${ICON.play} تنفيذ الزيارة</a>
          ${c.phone ? `<a class="btn sm" href="${telUrl(c.phone)}">${ICON.phone} اتصال</a><a class="btn sm" target="_blank" rel="noopener" href="${waUrl(c.phone)}">${ICON.wa} واتساب</a>` : ''}
          ${c.lat ? `<a class="btn sm" target="_blank" rel="noopener" href="${mapUrl(c.lat, c.lng)}">${ICON.map} الموقع</a>` : ''}
          <a class="btn sm ghost" href="#/client/${c.id}">الملف</a>
        </div>
      </div>
    </div>`;
  const section = (title, arr, cls, emptyMsg) => `
    <div class="section-title"><h2>${title} <span class="count">${arr.length}</span></h2></div>
    ${arr.length ? arr.map(x => card(x, cls)).join('') : `<div class="empty small">${emptyMsg}</div>`}`;
  // region progress
  const regionRows = regions.map(r => { const cs = clients.filter(c => c.region === r); let d = 0, t = 0; cs.forEach(c => { const p = planFor(c, visits); d += p.doneCount; t += p.total; }); return { r, n: cs.length, d, t }; });
  view(`
  <div class="stack">
    <div class="row between"><div><h1>متابعة اليوم</h1><div class="muted small">${niceDate(today)} — ${esc(S.user || 'الفريق')}</div></div>
      <a class="btn sm" href="#/sync">${ICON.up} رفع آخر اليوم${pendingPh ? ` <span class="badge">${pendingPh}</span>` : ''}</a></div>
    ${regions.length ? `<div class="chips"><button class="chip ${!filterRegion ? 'on' : ''}" data-r="">الكل</button>${regions.map(r => `<button class="chip ${filterRegion === r ? 'on' : ''}" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
    <div class="stats">
      <div class="stat red"><div class="v">${due.late.length}</div><div class="l">متأخرة</div></div>
      <div class="stat amber"><div class="v">${due.due.length}</div><div class="l">مستحقة النهارده</div></div>
      <div class="stat green"><div class="v">${todayDone}</div><div class="l">اتنفذت النهارده</div></div>
      <div class="stat"><div class="v">${list.length}</div><div class="l">عميل (${completed} خلص الرحلة)</div></div>
    </div>
    <div class="card flat"><div class="row between small"><b>تقدم الزيارات</b><span class="muted">${doneVisits} / ${totalVisits}</span></div>
      <div class="progress" style="margin-top:6px"><i style="width:${totalVisits ? Math.round(doneVisits / totalVisits * 100) : 0}%"></i></div></div>
    ${clients.length === 0 ? `<div class="empty"><h2>ابدأ بإضافة أول عميل</h2><p>سجّل العميل وموقعه، والتطبيق هيحسب مواعيد الزيارات والمتابعة تلقائياً.</p><a class="btn primary" href="#/client-new">${ICON.plus} عميل جديد</a></div>` : `
    ${section('متأخرة', due.late, 'overdue', 'مفيش زيارات متأخرة 👌')}
    ${section('مستحقة النهارده', due.due, 'today', 'مفيش زيارات مستحقة النهارده')}
    ${section('خلال 7 أيام', due.next, 'upcoming', 'مفيش زيارات قادمة خلال أسبوع')}
    ${regionRows.length > 1 ? `<div class="section-title"><h2>التقدم حسب المنطقة</h2></div><div class="card stack">${regionRows.map(x => `
      <div><div class="row between small"><b>${esc(x.r)}</b><span class="muted">${x.n} عميل · ${x.d}/${x.t} زيارة</span></div>
      <div class="progress"><i style="width:${x.t ? Math.round(x.d / x.t * 100) : 0}%"></i></div></div>`).join('')}</div>` : ''}`}
  </div>`);
  $$('.chip[data-r]').forEach(b => b.onclick = () => { filterRegion = b.dataset.r; viewHome(); });
}

// ---------- Views: Clients ----------
let clientQuery = '', clientStatus = 'all';
async function viewClients() {
  const { clients, visits } = await loadAll();
  const regions = [...new Set(clients.map(c => c.region).filter(Boolean))];
  view(`
  <div class="stack">
    <div class="row between"><h1>العملاء <span class="count">${clients.length}</span></h1>
      <a class="btn sm primary" href="#/client-new">${ICON.plus} عميل جديد</a></div>
    <div class="search">${ICON.search}<input id="q" type="search" placeholder="بحث بالاسم، الكود، الموبايل، القرية…" value="${esc(clientQuery)}"></div>
    <div class="chips" id="regionChips"><button class="chip ${!filterRegion ? 'on' : ''}" data-r="">كل المناطق</button>${regions.map(r => `<button class="chip ${filterRegion === r ? 'on' : ''}" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <div class="chips" id="statusChips">${[['all', 'الكل'], ['active', 'جاري'], ['late', 'متأخر'], ['done', 'خلص']].map(([k, l]) => `<button class="chip ${clientStatus === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
    <div class="stack" id="list"></div>
  </div>`);
  const render = () => {
    const q = clientQuery.trim().toLowerCase();
    const rows = clients.map(c => [c, planFor(c, visits)]).filter(([c, p]) => {
      if (filterRegion && c.region !== filterRegion) return false;
      if (clientStatus === 'done' && p.next) return false;
      if (clientStatus === 'active' && !p.next) return false;
      if (clientStatus === 'late' && !(p.next && p.next.state === 'late')) return false;
      if (!q) return true;
      return [c.name, c.code, c.phone, c.region, c.area, c.village, c.variety].some(x => String(x || '').toLowerCase().includes(q));
    }).sort((a, b) => String(a[0].code).localeCompare(String(b[0].code), 'ar', { numeric: true }));
    $('#list').innerHTML = rows.length ? rows.map(([c, p]) => `
      <a class="item" href="#/client/${c.id}" style="color:inherit">
        <div class="avatar">${esc(initials(c.name))}</div>
        <div class="body">
          <div class="row between"><div class="title">${esc(c.name || 'بدون اسم')}</div><span class="tag">${esc(c.code)}</span></div>
          <div class="meta">${esc([c.region, c.area, c.village].filter(Boolean).join(' • ') || '—')}</div>
          <div class="row" style="margin-top:4px">
            <span class="tag ${p.next ? (p.next.state === 'late' ? 'red' : p.next.state === 'due' ? 'amber' : 'blue') : 'green'}">${p.next ? esc(p.next.t.name) + ' · ' + niceDate(p.next.planned) : 'خلص الرحلة ✓'}</span>
            <span class="small muted">${p.doneCount}/${p.total}</span>${!c.synced ? '<span class="tag amber">غير مرفوع</span>' : ''}
          </div>
        </div>
      </a>`).join('') : '<div class="empty">مفيش نتائج</div>';
  };
  render();
  $('#q').oninput = debounce(e => { clientQuery = e.target.value; render(); }, 150);
  $$('#regionChips .chip').forEach(b => b.onclick = () => { filterRegion = b.dataset.r; $$('#regionChips .chip').forEach(x => x.classList.toggle('on', x === b)); render(); });
  $$('#statusChips .chip').forEach(b => b.onclick = () => { clientStatus = b.dataset.s; $$('#statusChips .chip').forEach(x => x.classList.toggle('on', x === b)); render(); });
}

// ---------- Views: Client details ----------
async function viewClient(id) {
  const c = await DB.get('clients', id);
  if (!isActive(c)) { view('<div class="empty">العميل غير موجود</div>'); return; }
  const { visits, photos } = await loadAll();
  const p = planFor(c, visits);
  const phCount = vid => photos.filter(x => x.visitId === vid).length;
  const stateTag = s => s.done ? `<span class="tag green">تمت ${niceDate(s.v.date)}</span>` : s.state === 'late' ? `<span class="tag red">متأخرة · ${relDay(s.planned)}</span>` : s.state === 'due' ? '<span class="tag amber">النهارده</span>' : s.state === 'locked' ? '<span class="tag">بعد الزيارة السابقة</span>' : `<span class="tag blue">${relDay(s.planned)}</span>`;
  const extra = (c.extra || []).filter(x => x.k);
  view(`
  <div class="stack">
    <div class="card">
      <div class="row between"><div class="row"><div class="avatar" style="width:48px;height:48px;border-radius:14px;display:grid;place-items:center;font-weight:800;background:var(--brand-soft);color:var(--brand);font-size:20px">${esc(initials(c.name))}</div>
        <div><h1>${esc(c.name || 'بدون اسم')}</h1><div class="muted small">${esc(c.code)} · ${esc([c.region, c.area, c.village].filter(Boolean).join(' • '))}</div></div></div>
        <a class="btn sm" href="#/client/${c.id}/edit">${ICON.edit} تعديل</a></div>
      <div class="actions">
        ${c.phone ? `<a class="btn sm" href="${telUrl(c.phone)}">${ICON.phone} ${esc(c.phone)}</a><a class="btn sm" target="_blank" rel="noopener" href="${waUrl(c.phone)}">${ICON.wa} واتساب</a>` : ''}
        ${c.lat ? `<a class="btn sm" target="_blank" rel="noopener" href="${mapUrl(c.lat, c.lng)}">${ICON.map} الموقع</a>` : ''}
        ${c.folderUrl ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(c.folderUrl)}">${ICON.folder} فولدر الدرايف</a>` : ''}
        ${c.docUrl ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(c.docUrl)}">${ICON.doc} ملف العميل</a>` : ''}
      </div>
      ${!c.folderUrl ? '<div class="small muted" style="margin-top:6px">فولدر الدرايف وملف العميل هيتعملوا أول ما تعمل مزامنة.</div>' : ''}
    </div>

    <div class="section-title"><h2>رحلة العميل <span class="count">${p.doneCount}/${p.total}</span></h2></div>
    <div class="card"><div class="timeline">
      ${p.steps.map(s => `
        <div class="step ${s.done ? 'done' : s.state === 'late' ? 'late' : s.state === 'due' ? 'due' : ''}">
          <div class="n">${s.done ? '✓' : s.i + 1}</div>
          <div class="c">
            <div class="row between"><b>${esc(s.t.name)}</b>${stateTag(s)}</div>
            <div class="small muted">${s.done ? `${esc(s.v.product || '')}${s.v.linesTreated ? ` · ${esc(s.v.linesTreated)} خط` : ''} · ${phCount(s.v.id)} صورة` : `الموعد: ${niceDate(s.planned)}${s.t.product ? ' · ' + esc(s.t.product) : ''}`}</div>
            <div class="actions">${s.v ? `<a class="btn sm" href="#/visit/${s.v.id}">${s.done ? 'عرض / تعديل' : 'استكمال'}</a>` : `<a class="btn sm ${s.state === 'locked' ? '' : 'primary'}" href="#/visit/new/${c.id}/${s.t.key}">${ICON.play} تنفيذ</a>`}</div>
          </div>
        </div>`).join('')}
    </div></div>

    <div class="section-title"><h2>زيارات إضافية <span class="count">${p.extras.length}</span></h2><a class="btn sm" href="#/visit/new/${c.id}/extra">${ICON.plus} زيارة</a></div>
    ${p.extras.length ? p.extras.map(v => `<a class="item" style="color:inherit" href="#/visit/${v.id}"><div class="body"><div class="row between"><b>${esc(v.visitName)}</b><span class="tag">${niceDate(v.date)}</span></div><div class="meta">${esc(v.notes || '')}</div></div></a>`).join('') : '<div class="empty small">مفيش زيارات إضافية</div>'}

    <div class="section-title"><h2>بيانات العميل</h2></div>
    <div class="card"><dl class="dl">
      ${[['المساحة (فدان)', c.acreage], ['الصنف', c.variety], ['تاريخ الزراعة', c.plantingDate], ['نظام الري', c.irrigation], ['بداية التجربة', c.startDate], ['الإحداثيات', c.lat ? `${c.lat}, ${c.lng} (±${c.accuracy || '?'}م)` : ''], ['ملاحظات', c.notes], ...extra.map(x => [x.k, x.v]), ['سجّل بواسطة', c.createdBy]].filter(x => x[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') || '<dt>—</dt><dd></dd>'}
    </dl></div>
    <button class="btn danger" id="delClient">حذف العميل</button>
  </div>`);
  $('#delClient').onclick = async () => {
    if (!await requireAdmin('حذف العميل محتاج كلمة سر الأدمن')) return;
    if (!await confirmBox(`حذف ${c.name || c.code} وكل زياراته؟`, 'حذف', true)) return;
    const t = nowISO(); c.deleted = 1; c.updatedAt = t; c.synced = 0; await DB.put('clients', c);
    for (const v of visits.filter(v => v.clientId === c.id)) { v.deleted = 1; v.updatedAt = t; v.synced = 0; await DB.put('visits', v); }
    toast('اتحذف'); location.hash = '#/clients'; afterChange();
  };
}

// ---------- Shared form bits ----------
function datalists(clients) {
  const uniq = k => [...new Set(clients.map(c => c[k]).filter(Boolean))];
  const regs = [...new Set([...(S.regions || []), ...uniq('region')])];
  const dl = (id, arr) => `<datalist id="${id}">${arr.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  return dl('dl-region', regs) + dl('dl-area', uniq('area')) + dl('dl-village', uniq('village')) + dl('dl-variety', uniq('variety')) + dl('dl-irr', ['تنقيط', 'غمر', 'رش']) + dl('dl-product', S.products || []);
}
function extraEditor(list) {
  const rows = (list && list.length ? list : []).map(x => kvRow(x.k, x.v)).join('');
  return `<fieldset><legend>حقول إضافية (حرة)</legend><div class="stack" id="kvList">${rows}</div>
    <button type="button" class="btn sm" id="addKv" style="margin-top:8px">${ICON.plus} إضافة حقل</button>
    <div class="small muted" style="margin-top:6px">سجّل أي بيانات زيادة باسم الحقل وقيمته — بتتحفظ في الشيت والملف.</div></fieldset>`;
}
const kvRow = (k = '', v = '') => `<div class="kv"><input placeholder="اسم الحقل" class="kvk" value="${esc(k)}"><input placeholder="القيمة" class="kvv" value="${esc(v)}"><button type="button" class="btn sm ghost kvx" aria-label="حذف">✕</button></div>`;
function bindExtra() {
  const box = $('#kvList');
  $('#addKv').onclick = () => { box.insertAdjacentHTML('beforeend', kvRow()); box.lastElementChild.querySelector('input').focus(); };
  box.addEventListener('click', e => { if (e.target.classList.contains('kvx')) e.target.closest('.kv').remove(); });
}
const readExtra = () => $$('#kvList .kv').map(r => ({ k: r.querySelector('.kvk').value.trim(), v: r.querySelector('.kvv').value.trim() })).filter(x => x.k || x.v);
function locBox(loc) {
  return `<div class="loc" id="locBox"><div class="t" id="locText">${loc && loc.lat ? `${loc.lat}, ${loc.lng} <span class="muted">±${loc.accuracy}م</span>` : '<span class="muted">لم يتم تسجيل الموقع</span>'}</div>
    <button type="button" class="btn sm" id="locBtn">${ICON.pin} ${loc && loc.lat ? 'تحديث' : 'تسجيل الموقع'}</button></div>`;
}
function bindLoc(state) {
  const run = async (quiet) => {
    const b = $('#locBtn'); if (!b) return; b.disabled = true; $('#locText').innerHTML = '<span class="muted">جاري تحديد الموقع… (يشتغل أوفلاين بالـ GPS)</span>';
    try { Object.assign(state, await getLocation()); $('#locText').innerHTML = `${state.lat}, ${state.lng} <span class="muted">±${state.accuracy}م</span>`; b.innerHTML = ICON.pin + ' تحديث'; }
    catch (e) { $('#locText').innerHTML = `<span class="muted">${esc(e.message)}</span>`; if (!quiet) toast(e.message); }
    finally { b.disabled = false; }
  };
  $('#locBtn').onclick = () => run(false);
  return run;
}
const fv = (form, n) => (form.elements[n] ? String(form.elements[n].value).trim() : '');

// ---------- Views: Client form ----------
async function viewClientForm(id) {
  const all = (await DB.all('clients')).filter(isActive);
  const c = id ? await DB.get('clients', id) : null;
  if (id && !c) { view('<div class="empty">العميل غير موجود</div>'); return; }
  const d = c || { code: nextCode(all), startDate: todayStr(), extra: [] };
  const loc = { lat: d.lat, lng: d.lng, accuracy: d.accuracy, locAt: d.locAt };
  view(`
  <form class="stack" id="f" autocomplete="off">
    <div class="row between"><h1>${c ? 'تعديل العميل' : 'عميل جديد'}</h1><a class="btn sm ghost" href="${c ? '#/client/' + c.id : '#/clients'}">إلغاء</a></div>
    ${datalists(all)}
    <fieldset class="stack"><legend>البيانات الأساسية</legend>
      <div class="grid2">
        <div class="field"><label>اسم العميل *</label><input name="name" required value="${esc(d.name)}"></div>
        <div class="field"><label>كود العميل</label><input name="code" value="${esc(d.code)}"></div>
        <div class="field"><label>الموبايل</label><input name="phone" type="tel" inputmode="tel" value="${esc(d.phone)}"></div>
        <div class="field"><label>تاريخ بدء التجربة (الزيارة الأولى)</label><input name="startDate" type="date" value="${esc(d.startDate)}"></div>
      </div>
    </fieldset>
    <fieldset class="stack"><legend>المكان</legend>
      <div class="grid2">
        <div class="field"><label>المنطقة / المحافظة</label><input name="region" list="dl-region" value="${esc(d.region)}" placeholder="اكتب أو اختار"></div>
        <div class="field"><label>المركز</label><input name="area" list="dl-area" value="${esc(d.area)}"></div>
        <div class="field"><label>القرية</label><input name="village" list="dl-village" value="${esc(d.village)}"></div>
        <div class="field"><label>وصف الوصول</label><input name="directions" value="${esc(d.directions)}" placeholder="علامة مميزة، اسم الترعة…"></div>
      </div>
      ${locBox(loc)}
    </fieldset>
    <fieldset class="stack"><legend>الأرض والمحصول</legend>
      <div class="grid2">
        <div class="field"><label>المساحة (فدان)</label><input name="acreage" inputmode="decimal" value="${esc(d.acreage)}"></div>
        <div class="field"><label>الصنف</label><input name="variety" list="dl-variety" value="${esc(d.variety)}"></div>
        <div class="field"><label>تاريخ الزراعة</label><input name="plantingDate" type="date" value="${esc(d.plantingDate)}"></div>
        <div class="field"><label>نظام الري</label><input name="irrigation" list="dl-irr" value="${esc(d.irrigation)}"></div>
      </div>
      <div class="field"><label>ملاحظات</label><textarea name="notes">${esc(d.notes)}</textarea></div>
    </fieldset>
    ${extraEditor(d.extra)}
    <button class="btn primary block" type="submit">حفظ العميل</button>
  </form>`);
  bindExtra(); const runLoc = bindLoc(loc); if (!c && !loc.lat) runLoc(true);
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target; const t = nowISO();
    const rec = { ...(c || { id: uid(), createdAt: t, createdBy: S.user || '' }),
      name: fv(f, 'name'), code: fv(f, 'code') || nextCode(all), phone: fv(f, 'phone'), startDate: fv(f, 'startDate') || todayStr(),
      region: fv(f, 'region'), area: fv(f, 'area'), village: fv(f, 'village'), directions: fv(f, 'directions'),
      acreage: fv(f, 'acreage'), variety: fv(f, 'variety'), plantingDate: fv(f, 'plantingDate'), irrigation: fv(f, 'irrigation'),
      notes: fv(f, 'notes'), extra: readExtra(), lat: loc.lat || '', lng: loc.lng || '', accuracy: loc.accuracy || '', locAt: loc.locAt || '',
      updatedAt: t, synced: 0, deleted: 0 };
    if (all.some(x => x.code === rec.code && x.id !== rec.id)) { toast('الكود ده مستخدم لعميل تاني'); return; }
    await DB.put('clients', rec);
    // تحديث بيانات العميل المنسوخة في زياراته
    if (c) for (const v of await DB.byIndex('visits', 'clientId', rec.id)) { if (v.clientCode !== rec.code || v.clientName !== rec.name || v.region !== rec.region) { Object.assign(v, { clientCode: rec.code, clientName: rec.name, region: rec.region, updatedAt: t, synced: 0 }); await DB.put('visits', v); } }
    toast('اتحفظ ✓'); location.hash = '#/client/' + rec.id; afterChange();
  };
}

// ---------- Views: Visit form ----------
async function viewVisitForm({ id, clientId, key }) {
  let v = id ? await DB.get('visits', id) : null;
  if (id && !isActive(v)) { view('<div class="empty">الزيارة غير موجودة</div>'); return; }
  const c = await DB.get('clients', v ? v.clientId : clientId);
  if (!isActive(c)) { view('<div class="empty">العميل غير موجود</div>'); return; }
  const { visits } = await loadAll();
  const plan = planFor(c, visits);
  if (!v && key !== 'extra') { const existing = plan.steps.find(s => s.t.key === key); if (existing && existing.v) { location.replace('#/visit/' + existing.v.id); return; } }
  const tpl = S.templates.find(t => t.key === (v ? v.visitKey : key));
  const step = plan.steps.find(s => s.t.key === (v ? v.visitKey : key));
  const isNew = !v;
  if (!v) v = { id: uid(), clientId: c.id, visitKey: key, visitName: tpl ? tpl.name : 'زيارة إضافية', order: tpl ? S.templates.indexOf(tpl) + 1 : 99, plannedDate: step ? step.planned : todayStr(),
    date: todayStr(), status: 'done', product: tpl ? tpl.product : '', linesTreated: tpl && tpl.product ? (S.defaultLines || 100) : '', extra: [], createdAt: nowISO(), createdBy: S.user || '' };
  const loc = { lat: v.lat, lng: v.lng, accuracy: v.accuracy, locAt: v.locAt };
  const stored = isNew ? [] : await DB.byIndex('photos', 'visitId', v.id);
  const photos = stored.map(p => ({ ...p, url: URL.createObjectURL(p.blob) }));
  const removed = [];
  const seg = (name, opts, val) => `<div class="seg">${opts.map(([k, l]) => `<label><input type="radio" name="${name}" value="${esc(k)}" ${String(val ?? '') === String(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
  const scale = (name, val) => seg(name, [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], val);
  view(`
  <form class="stack" id="f" autocomplete="off">
    <div class="row between"><div><h1>${esc(v.visitName)}</h1><div class="muted small">${esc(c.name)} · ${esc(c.code)} · ${esc(c.village || c.region || '')}</div></div>
      <a class="btn sm ghost" href="#/client/${c.id}">إلغاء</a></div>
    ${datalists([])}
    <fieldset class="stack"><legend>الزيارة</legend>
      ${key === 'extra' || v.visitKey === 'extra' ? `<div class="field"><label>اسم الزيارة</label><input name="visitName" value="${esc(v.visitName)}"></div>` : ''}
      <div class="field"><label>الحالة</label>${seg('status', [['done', 'تمت'], ['postponed', 'مؤجلة'], ['missed', 'لم تتم']], v.status)}</div>
      <div class="grid2">
        <div class="field"><label>تاريخ الزيارة</label><input name="date" type="date" value="${esc(v.date)}"></div>
        <div class="field" id="plannedWrap"><label>الموعد الجديد (لو مؤجلة)</label><input name="plannedDate" type="date" value="${esc(v.plannedDate)}"></div>
      </div>
      ${locBox(loc)}
    </fieldset>
    <fieldset class="stack"><legend>التطبيق</legend>
      <div class="grid2">
        <div class="field"><label>المنتج المستخدم</label><input name="product" list="dl-product" value="${esc(v.product)}" placeholder="بدون تطبيق (متابعة)"></div>
        <div class="field"><label>عدد الخطوط المعاملة</label><input name="linesTreated" inputmode="numeric" value="${esc(v.linesTreated)}"></div>
        <div class="field"><label>المعدل / الجرعة</label><input name="rate" value="${esc(v.rate)}" placeholder="مثال: 250 سم/100 لتر"></div>
        <div class="field"><label>طريقة التطبيق</label><input name="method" list="dl-method" value="${esc(v.method)}"><datalist id="dl-method"><option value="رش"><option value="مع مياه الري (تسميد)"><option value="غمر جذور"></datalist></div>
      </div>
    </fieldset>
    <fieldset class="stack"><legend>القراءات (المعامل)</legend>
      <div class="field"><label>قوة النمو (1 ضعيف – 5 ممتاز)</label>${scale('vigor', v.vigor)}</div>
      <div class="field"><label>لون الأوراق (1 – 5)</label>${scale('leafColor', v.leafColor)}</div>
      <div class="grid2">
        <div class="field"><label>متوسط الأزهار/نبات</label><input name="flowers" inputmode="decimal" value="${esc(v.flowers)}"></div>
        <div class="field"><label>متوسط الثمار/نبات</label><input name="fruits" inputmode="decimal" value="${esc(v.fruits)}"></div>
        <div class="field"><label>نسبة الإصابة %</label><input name="infection" inputmode="decimal" value="${esc(v.infection)}"></div>
        <div class="field"><label>مقارنة بالكنترول</label><input name="vsControl" list="dl-vs" value="${esc(v.vsControl)}"><datalist id="dl-vs"><option value="أفضل بوضوح"><option value="أفضل قليلاً"><option value="مثله"><option value="أقل"></datalist></div>
      </div>
    </fieldset>
    <fieldset class="stack"><legend>رأي العميل</legend>
      <div class="field"><label>تقييم العميل (1 – 5)</label>${scale('farmerRating', v.farmerRating)}</div>
      <div class="field"><label>نية الشراء</label>${seg('purchaseIntent', [['نعم', 'نعم'], ['ربما', 'ربما'], ['لا', 'لا']], v.purchaseIntent)}</div>
      <div class="field"><label>الكمية المتوقعة / ملاحظات تجارية</label><input name="expectedQty" value="${esc(v.expectedQty)}"></div>
    </fieldset>
    <fieldset class="stack"><legend>الصور <span class="count" id="phCount">${photos.length}</span></legend>
      <div class="photos" id="phGrid"></div>
      <input type="file" id="phInput" accept="image/*" capture="environment" multiple hidden>
      <input type="file" id="phInput2" accept="image/*" multiple hidden>
      <div class="row"><button type="button" class="btn sm" id="phCam">${ICON.cam} كاميرا</button><button type="button" class="btn sm" id="phGal">من المعرض</button></div>
      <div class="small muted">الصور بتتحفظ على الجهاز وبتترفع لفولدر الزيارة على الدرايف من صفحة المزامنة آخر اليوم.</div>
    </fieldset>
    <div class="field"><label>ملاحظات الزيارة</label><textarea name="notes">${esc(v.notes)}</textarea></div>
    ${extraEditor(v.extra)}
    <button class="btn primary block" type="submit">حفظ الزيارة</button>
    ${!isNew ? '<button class="btn danger" type="button" id="delVisit">حذف الزيارة</button>' : ''}
  </form>`);
  bindExtra(); const runLoc = bindLoc(loc); if (isNew) runLoc(true);
  const togglePlanned = () => { $('#plannedWrap').style.display = ($('#f').elements.status.value === 'postponed') ? '' : 'none'; };
  $$('input[name=status]').forEach(r => r.onchange = togglePlanned); togglePlanned();
  // allow unselecting radio scales by tapping again
  $$('.seg input').forEach(r => { r.addEventListener('click', () => { if (r.dataset.was === '1') { r.checked = false; r.dataset.was = '0'; } else { $$(`input[name="${r.name}"]`).forEach(x => x.dataset.was = '0'); r.dataset.was = '1'; } }); if (r.checked) r.dataset.was = '1'; });
  const renderPh = () => {
    $('#phGrid').innerHTML = photos.map((p, i) => `<div class="ph"><img src="${p.url}" alt=""><button type="button" class="x" data-i="${i}" aria-label="حذف">✕</button><span class="st">${p.uploaded ? 'مرفوعة ✓' : 'على الجهاز'}</span></div>`).join('') +
      `<div class="addph" id="phAdd">${ICON.cam}<br>إضافة</div>`;
    $('#phCount').textContent = photos.length;
    $$('#phGrid .x').forEach(b => b.onclick = () => { const [p] = photos.splice(+b.dataset.i, 1); if (p.stored) removed.push(p); renderPh(); });
    $('#phAdd').onclick = () => $('#phInput').click();
  };
  photos.forEach(p => p.stored = true); renderPh();
  const onFiles = async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) { const blob = await compressImage(f); photos.push({ id: uid(), visitId: v.id, clientId: c.id, blob, url: URL.createObjectURL(blob), takenAt: nowISO(), lat: loc.lat || '', lng: loc.lng || '', uploaded: 0 }); }
    renderPh();
  };
  $('#phInput').onchange = onFiles; $('#phInput2').onchange = onFiles;
  $('#phCam').onclick = () => $('#phInput').click(); $('#phGal').onclick = () => $('#phInput2').click();
  if ($('#delVisit')) $('#delVisit').onclick = async () => {
    if (!await requireAdmin('حذف الزيارة محتاج كلمة سر الأدمن')) return;
    if (!await confirmBox('حذف الزيارة دي؟', 'حذف', true)) return;
    v.deleted = 1; v.updatedAt = nowISO(); v.synced = 0; await DB.put('visits', v);
    for (const p of stored) if (!p.uploaded) await DB.del('photos', p.id);
    toast('اتحذفت'); location.hash = '#/client/' + c.id; afterChange();
  };
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target; const radio = n => (f.querySelector(`input[name="${n}"]:checked`) || {}).value || '';
    const rec = { ...v, clientCode: c.code, clientName: c.name, region: c.region,
      visitName: f.elements.visitName ? (fv(f, 'visitName') || 'زيارة إضافية') : v.visitName,
      status: radio('status') || 'done', date: fv(f, 'date') || todayStr(), plannedDate: fv(f, 'plannedDate') || v.plannedDate,
      product: fv(f, 'product'), linesTreated: fv(f, 'linesTreated'), rate: fv(f, 'rate'), method: fv(f, 'method'),
      vigor: radio('vigor'), leafColor: radio('leafColor'), flowers: fv(f, 'flowers'), fruits: fv(f, 'fruits'), infection: fv(f, 'infection'), vsControl: fv(f, 'vsControl'),
      farmerRating: radio('farmerRating'), purchaseIntent: radio('purchaseIntent'), expectedQty: fv(f, 'expectedQty'),
      notes: fv(f, 'notes'), extra: readExtra(), lat: loc.lat || '', lng: loc.lng || '', accuracy: loc.accuracy || '', locAt: loc.locAt || '',
      photosCount: photos.length, updatedAt: nowISO(), synced: 0, deleted: 0 };
    await DB.put('visits', rec);
    for (const p of photos) if (!p.stored) { const { url, stored: _s, ...rest } = p; await DB.put('photos', rest); }
    for (const p of removed) if (!p.uploaded) await DB.del('photos', p.id);
    // لو أول زيارة لعميل ملوش موقع، خد موقع الزيارة
    if (!c.lat && loc.lat) { Object.assign(c, { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, locAt: loc.locAt, updatedAt: nowISO(), synced: 0 }); await DB.put('clients', c); }
    photos.forEach(p => URL.revokeObjectURL(p.url));
    toast('اتحفظت الزيارة ✓'); location.hash = '#/client/' + c.id; afterChange();
  };
}

// ---------- Views: Sync ----------
async function viewSync() {
  const pc = await pendingCounts(); const { clients, visits, photos } = await loadAll();
  const f = s => s ? new Date(s).toLocaleString('ar-EG') : 'لسه';
  view(`
  <div class="stack">
    <h1>المزامنة ورفع الصور</h1>
    <div class="stats">
      <div class="stat amber"><div class="v">${pc.clients}</div><div class="l">عميل لم يُرفع</div></div>
      <div class="stat amber"><div class="v">${pc.visits}</div><div class="l">زيارة لم تُرفع</div></div>
      <div class="stat red"><div class="v">${pc.photos}</div><div class="l">صورة على الجهاز</div></div>
      <div class="stat green"><div class="v">${photos.filter(p => p.uploaded).length}</div><div class="l">صورة مرفوعة</div></div>
    </div>
    ${!S.apiUrl ? `<div class="card" style="border-color:var(--warn)"><b>التطبيق شغال أوفلاين بالكامل.</b> علشان البيانات تتحفظ على Google Sheets والدرايف، حط رابط الربط في <a href="#/settings">الإعدادات</a>.</div>` : ''}
    <div class="card stack">
      <div class="row between"><h2>1) مزامنة البيانات</h2><span class="small muted">آخر مزامنة: ${f(S.lastSync)}</span></div>
      <div class="small muted">بترفع العملاء والزيارات للشيت، وبتعمل فولدر لكل عميل على الدرايف وملف Docs، وبتسحب أي تحديثات من باقي الفريق.</div>
      <button class="btn primary" id="bSync">${ICON.sync} مزامنة الآن</button>
    </div>
    <div class="card stack">
      <div class="row between"><h2>2) رفع صور اليوم للدرايف</h2><span class="small muted">آخر رفع: ${f(S.lastPhotoUpload)}</span></div>
      <div class="small muted">كل صورة بتترفع في فولدر العميل ← فولدر الزيارة، وملف العميل بيتحدث بالصور. يفضّل على واي فاي.</div>
      <button class="btn primary" id="bPh" ${pc.photos ? '' : 'disabled'}>${ICON.up} رفع ${pc.photos} صورة</button>
      <div class="progress" id="phProg" hidden><i style="width:0"></i></div>
    </div>
    <div class="card stack">
      <h2>3) تصدير ونسخ احتياطي (أوفلاين)</h2>
      <div class="small muted">${clients.length} عميل · ${visits.length} زيارة على الجهاز</div>
      <div class="row">
        <button class="btn" id="bXlsx">${ICON.dl} Excel</button>
        <button class="btn" id="bCsv">${ICON.dl} CSV</button>
        <button class="btn" id="bJson">${ICON.dl} نسخة احتياطية كاملة</button>
        <label class="btn" style="margin:0;color:var(--text)">${ICON.up} استيراد نسخة/عملاء<input type="file" id="imp" accept=".json,.csv" hidden></label>
      </div>
      <div class="small muted">استيراد CSV للعملاء: الأعمدة (code,name,phone,region,area,village,startDate) بأي ترتيب.</div>
    </div>
    <div class="log" id="log">جاهز.</div>
  </div>`);
  const logEl = $('#log'); const log = m => { logEl.textContent += '\n' + m; logEl.scrollTop = logEl.scrollHeight; };
  $('#bSync').onclick = async e => { e.target.disabled = true; await syncData({ log }); e.target.disabled = false; viewSyncRefresh(); };
  $('#bPh').onclick = async e => { e.target.disabled = true; const pr = $('#phProg'); pr.hidden = false; await uploadPhotos({ log, onProgress: (d, t) => { pr.firstElementChild.style.width = Math.round(d / t * 100) + '%'; } }); viewSyncRefresh(); };
  $('#bXlsx').onclick = () => exportXlsx(); $('#bCsv').onclick = () => exportCsv(); $('#bJson').onclick = () => exportJson();
  $('#imp').onchange = e => importFile(e.target.files[0]).then(viewSync);
}
const viewSyncRefresh = debounce(() => { if (location.hash === '#/sync') viewSync(); }, 1500);

// ---------- Export / Import ----------
const C_COLS = [['code', 'كود العميل'], ['name', 'اسم العميل'], ['phone', 'الموبايل'], ['region', 'المنطقة'], ['area', 'المركز'], ['village', 'القرية'], ['directions', 'وصف الوصول'], ['acreage', 'المساحة (فدان)'], ['variety', 'الصنف'], ['plantingDate', 'تاريخ الزراعة'], ['irrigation', 'نظام الري'], ['startDate', 'بداية التجربة'], ['lat', 'خط العرض'], ['lng', 'خط الطول'], ['accuracy', 'دقة الموقع'], ['notes', 'ملاحظات'], ['extraText', 'حقول إضافية'], ['progress', 'التقدم'], ['nextVisit', 'الزيارة القادمة'], ['nextDate', 'موعدها'], ['folderUrl', 'فولدر الدرايف'], ['docUrl', 'ملف العميل'], ['createdBy', 'سجّل بواسطة'], ['updatedAt', 'آخر تعديل']];
const V_COLS = [['clientCode', 'كود العميل'], ['clientName', 'اسم العميل'], ['region', 'المنطقة'], ['visitName', 'الزيارة'], ['status', 'الحالة'], ['plannedDate', 'الموعد المخطط'], ['date', 'تاريخ التنفيذ'], ['product', 'المنتج'], ['linesTreated', 'عدد الخطوط'], ['rate', 'المعدل'], ['method', 'طريقة التطبيق'], ['vigor', 'قوة النمو'], ['leafColor', 'لون الأوراق'], ['flowers', 'أزهار/نبات'], ['fruits', 'ثمار/نبات'], ['infection', 'إصابة %'], ['vsControl', 'مقارنة بالكنترول'], ['farmerRating', 'تقييم العميل'], ['purchaseIntent', 'نية الشراء'], ['expectedQty', 'الكمية المتوقعة'], ['notes', 'ملاحظات'], ['extraText', 'حقول إضافية'], ['photosCount', 'عدد الصور'], ['lat', 'خط العرض'], ['lng', 'خط الطول'], ['folderUrl', 'فولدر الزيارة'], ['createdBy', 'سجّل بواسطة']];
const STATUS_AR = { done: 'تمت', postponed: 'مؤجلة', missed: 'لم تتم' };
const extraText = arr => (arr || []).filter(x => x.k || x.v).map(x => `${x.k}: ${x.v}`).join(' | ');
async function exportRows() {
  const { clients, visits } = await loadAll();
  const cr = clients.map(c => { const p = planFor(c, visits); return { ...c, extraText: extraText(c.extra), progress: `${p.doneCount}/${p.total}`, nextVisit: p.next ? p.next.t.name : 'خلص', nextDate: p.next ? p.next.planned : '' }; })
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'ar', { numeric: true }));
  const vr = visits.map(v => ({ ...v, status: STATUS_AR[v.status] || v.status, extraText: extraText(v.extra) }))
    .sort((a, b) => String(a.clientCode).localeCompare(String(b.clientCode), 'ar', { numeric: true }) || (a.order || 0) - (b.order || 0));
  const toAoa = (rows, cols) => [cols.map(c => c[1]), ...rows.map(r => cols.map(c => r[c[0]] ?? ''))];
  return { clients: toAoa(cr, C_COLS), visits: toAoa(vr, V_COLS) };
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
const stamp = () => todayStr();
async function exportXlsx() {
  if (!window.XLSX) { toast('مكتبة Excel مش متحملة — هيتم التصدير CSV'); return exportCsv(); }
  const d = await exportRows(); const wb = XLSX.utils.book_new();
  const add = (aoa, name) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map(() => ({ wch: 16 })); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, name); };
  add(d.clients, 'العملاء'); add(d.visits, 'الزيارات'); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, `التجارب-${stamp()}.xlsx`);
}
async function exportCsv() {
  const d = await exportRows(); const csv = aoa => '﻿' + aoa.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`العملاء-${stamp()}.csv`, new Blob([csv(d.clients)], { type: 'text/csv;charset=utf-8' }));
  setTimeout(() => download(`الزيارات-${stamp()}.csv`, new Blob([csv(d.visits)], { type: 'text/csv;charset=utf-8' })), 600);
}
async function exportJson() {
  const [clients, visits] = await Promise.all([DB.all('clients'), DB.all('visits')]);
  download(`نسخة-احتياطية-${stamp()}.json`, new Blob([JSON.stringify({ app: 'field-trials', version: 1, exportedAt: nowISO(), settings: { ...S, token: '' }, clients, visits }, null, 1)], { type: 'application/json' }));
}
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false; text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
async function importFile(file) {
  if (!file) return; const text = await file.text();
  try {
    if (file.name.toLowerCase().endsWith('.json')) {
      const d = JSON.parse(text); let n = 0;
      for (const c of d.clients || []) { const l = await DB.get('clients', c.id); if (!l || (c.updatedAt || '') > (l.updatedAt || '')) { await DB.put('clients', { ...c, synced: 0 }); n++; } }
      for (const v of d.visits || []) { const l = await DB.get('visits', v.id); if (!l || (v.updatedAt || '') > (l.updatedAt || '')) { await DB.put('visits', { ...v, synced: 0 }); n++; } }
      toast(`اتستورد ${n} سجل ✓`);
    } else {
      const rows = parseCsv(text); const head = rows.shift().map(h => h.trim().toLowerCase());
      const alias = { 'كود العميل': 'code', 'الكود': 'code', 'اسم العميل': 'name', 'الاسم': 'name', 'الموبايل': 'phone', 'المنطقة': 'region', 'المركز': 'area', 'القرية': 'village', 'بداية التجربة': 'startdate', 'تاريخ بدء التجربة': 'startdate' };
      const idx = k => head.findIndex(h => h === k || alias[h] === k);
      const all = (await DB.all('clients')).filter(isActive); let n = 0; const t = nowISO();
      for (const r of rows) {
        const g = k => { const i = idx(k); return i >= 0 ? (r[i] || '').trim() : ''; };
        if (!g('name') && !g('code')) continue;
        const code = g('code') || nextCode(all); if (all.some(x => x.code === code)) continue;
        const rec = { id: uid(), code, name: g('name'), phone: g('phone'), region: g('region'), area: g('area'), village: g('village'), startDate: g('startdate') || todayStr(), extra: [], createdAt: t, updatedAt: t, createdBy: S.user || '', synced: 0, deleted: 0 };
        all.push(rec); await DB.put('clients', rec); n++;
      }
      toast(`اتضاف ${n} عميل ✓`);
    }
    afterChange();
  } catch (e) { toast('ملف غير صالح: ' + e.message, 4000); }
}

// ---------- Views: Settings ----------
// ---------- Admin ----------
const CFG = window.APP_CONFIG || {};
const SHARED_KEYS = ['templates', 'products', 'regions', 'codePrefix', 'defaultLines', 'autoSync', 'autoPhotos', 'wifiOnly', 'syncEvery'];
let adminPass = null; // كلمة سر الأدمن بعد الفتح (في الذاكرة بس لحد ما التطبيق يتقفل)
async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function checkAdmin(pw) { return !!CFG.adminPasswordHash && (await sha256(pw)) === CFG.adminPasswordHash; }
/** يطلب كلمة سر الأدمن لو مش مفتوحة — يرجّع true لو مسموح */
function requireAdmin(reason = 'العملية دي للأدمن بس') {
  if (adminPass !== null || !CFG.adminPasswordHash) return Promise.resolve(true);
  return new Promise(res => {
    const m = $('#modal');
    $('#modalBody').innerHTML = `<form class="stack" id="admF"><h2>🔒 ${esc(reason)}</h2>
      <div class="field"><label>كلمة سر الأدمن</label><input type="password" id="admP" autocomplete="current-password" required></div>
      <div class="small" id="admE" style="color:var(--accent)"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="admC">إلغاء</button><button class="btn primary">فتح</button></div></form>`;
    $('#admC').onclick = () => { m.close(); res(false); };
    $('#admF').onsubmit = async e => { e.preventDefault(); const pw = $('#admP').value; if (await checkAdmin(pw)) { adminPass = pw; m.close(); res(true); } else { $('#admE').textContent = 'كلمة السر غلط'; $('#admP').select(); } };
    m.showModal(); setTimeout(() => $('#admP').focus(), 50);
  });
}
/** تطبيق الإعدادات المشتركة اللي جاية من السيرفر (الأدمن بيحددها لكل الأجهزة) */
async function applySharedConfig(cfg) {
  if (!cfg || !cfg.updatedAt || cfg.updatedAt <= (S.sharedAt || '')) return false;
  SHARED_KEYS.forEach(k => { if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') S[k] = cfg[k]; });
  S.sharedAt = cfg.updatedAt; await saveSettings(); startAutoSync(); return true;
}
async function pushSharedConfig() {
  const cfg = {}; SHARED_KEYS.forEach(k => cfg[k] = S[k]);
  const r = await api('setConfig', { config: cfg, adminPassword: adminPass });
  S.sharedAt = r.updatedAt; S.configDirty = 0; await saveSettings();
}
function askUserName(force = false) {
  if (S.user && !force) return Promise.resolve();
  return new Promise(res => {
    const m = $('#modal');
    $('#modalBody').innerHTML = `<form class="stack" id="nmF"><h2>👋 أهلاً! اكتب اسمك</h2><div class="small muted">الاسم ده بيتسجل مع كل عميل وزيارة بتدخلها.</div>
      <div class="field"><input id="nmI" required value="${esc(S.user)}" placeholder="مثال: م. أحمد – فريق 1"></div><button class="btn primary">${force ? 'حفظ' : 'ابدأ'}</button></form>`;
    m.addEventListener('cancel', e => { if (!S.user) e.preventDefault(); }, { once: true });
    $('#nmF').onsubmit = async e => { e.preventDefault(); S.user = $('#nmI').value.trim(); await saveSettings(); $('#brandSub').textContent = S.user; m.close(); res(); };
    m.showModal(); setTimeout(() => $('#nmI').focus(), 50);
  });
}

// ---------- Views: Settings (للأدمن) ----------
async function viewSettings() {
  if (adminPass === null && CFG.adminPasswordHash) {
    view(`<div class="stack"><h1>الإعدادات</h1><div class="empty"><h2>🔒 الصفحة دي للأدمن بس</h2><p>الإعدادات بتتحدد مرة واحدة من الأدمن وبتوصل لكل الأجهزة لوحدها.</p>
      <button class="btn primary" id="unl">فتح بكلمة سر الأدمن</button></div>
      <div class="card stack"><div class="row between"><div><b>اسم المستخدم على الجهاز ده</b><div class="small muted">${esc(S.user || '—')}</div></div><button class="btn sm" id="chName">تغيير</button></div>
      <div class="row between"><div><b>الربط بجوجل</b><div class="small muted">${S.apiUrl ? 'مربوط تلقائياً ✓' : 'غير مربوط — الأدمن يضيف الرابط في config.js'}</div></div><button class="btn sm" id="bTest0">اختبار</button></div></div></div>`);
    $('#unl').onclick = async () => { if (await requireAdmin('فتح الإعدادات')) viewSettings(); };
    $('#chName').onclick = () => askUserName(true);
    $('#bTest0').onclick = async () => { try { const r = await api('ping'); toast(`الاتصال شغال ✓ — ${r.sheetName || ''}`); } catch (e) { toast('فشل: ' + e.message, 6000); } };
    return;
  }
  const tplText = S.templates.map(t => `${t.name} | ${t.offset} | ${t.product || ''}`).join('\n');
  const chk = (n, on, label) => `<label class="row small" style="margin:0;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" name="${n}" style="width:auto;min-height:0" ${on ? 'checked' : ''}> ${label}</label>`;
  const fromCfg = !!CFG.apiUrl;
  view(`
  <form class="stack" id="f" autocomplete="off">
    <div class="row between"><h1>الإعدادات <span class="tag green">أدمن</span></h1>${CFG.adminPasswordHash ? '<button type="button" class="btn sm" id="lock">🔒 قفل</button>' : ''}</div>
    ${!CFG.adminPasswordHash ? '<div class="card" style="border-color:var(--warn)"><b>⚠️ الصفحة دي مفتوحة لأي حد لحد دلوقتي.</b><div class="small">اكتب كلمة سر للأدمن في آخر الصفحة واضغط توليد، وانسخ السطر اللي هيطلع في ملف config.js على GitHub.</div></div>' : ''}
    <fieldset class="stack"><legend>الربط بجوجل</legend>
      ${fromCfg ? `<div class="small">✓ الربط متحدد في ملف <b>config.js</b> وبيوصل لكل الأجهزة لوحده.</div><div class="small muted" dir="ltr" style="word-break:break-all">${esc(CFG.apiUrl)}</div>` : `
      <div class="small muted">علشان كل الأجهزة تتربط لوحدها، حط الرابط والرمز في ملف config.js على GitHub. الخانات دي بتأثر على الجهاز ده بس.</div>
      <div class="field"><label>رابط Web App</label><input name="apiUrl" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.apiUrl)}"></div>
      <div class="field"><label>رمز الربط (TOKEN)</label><input name="token" dir="ltr" type="password" value="${esc(S.token)}"></div>`}
      <div class="row"><button type="button" class="btn sm" id="bTest">اختبار الاتصال</button></div>
    </fieldset>
    <fieldset class="stack"><legend>إعدادات لكل الأجهزة</legend>
      <div class="small muted">أي تغيير هنا بيتحفظ على جوجل وبيوصل لكل أجهزة الفريق في أول مزامنة.</div>
      ${chk('autoSync', S.autoSync, 'مزامنة تلقائية دايماً (كل فترة + أول ما النت يرجع + بعد كل حفظ)')}
      ${chk('autoPhotos', S.autoPhotos, 'رفع الصور تلقائياً في الخلفية')}
      ${chk('wifiOnly', S.wifiOnly, 'رفع الصور على الواي فاي بس (توفير باقة النت)')}
      <div class="grid2">
        <div class="field"><label>المزامنة كل (دقيقة)</label><input name="syncEvery" inputmode="numeric" value="${esc(S.syncEvery)}"></div>
        <div class="field"><label>بادئة كود العميل</label><input name="codePrefix" value="${esc(S.codePrefix)}" placeholder="مثال: GA"></div>
      </div>
      <div class="field"><label>زيارات الرحلة — سطر لكل زيارة: الاسم | بعد كام يوم من البداية | المنتج</label><textarea name="templates" rows="4">${esc(tplText)}</textarea></div>
      <div class="grid2">
        <div class="field"><label>المنتجات (سطر لكل منتج)</label><textarea name="products" rows="3">${esc((S.products || []).join('\n'))}</textarea></div>
        <div class="field"><label>المناطق المقترحة (سطر لكل منطقة)</label><textarea name="regions" rows="3" placeholder="هتظهر كاقتراحات، وتقدر تكتب أي منطقة">${esc((S.regions || []).join('\n'))}</textarea></div>
      </div>
      <div class="field"><label>عدد الخطوط الافتراضي في التجربة</label><input name="defaultLines" inputmode="numeric" value="${esc(S.defaultLines)}"></div>
      <div class="small muted">ترتيب السطور = ترتيب الزيارات. تغيير اسم زيارة بيأثر على الفولدرات الجديدة بس.</div>
    </fieldset>
    <fieldset class="stack"><legend>الجهاز ده</legend>
      <div class="field"><label>اسم المستخدم</label><input name="user" value="${esc(S.user)}"></div>
      <div class="row">${['auto', 'light', 'dark'].map(t => `<label class="row" style="margin:0"><input type="radio" name="theme" value="${t}" style="width:auto;min-height:0" ${S.theme === t ? 'checked' : ''}> ${{ auto: 'تلقائي', light: 'فاتح', dark: 'غامق' }[t]}</label>`).join('')}</div>
    </fieldset>
    <button class="btn primary block" type="submit">حفظ وإرسال لكل الأجهزة</button>
    <fieldset class="stack"><legend>كلمة سر الأدمن</legend>
      <div class="small muted">لتغييرها: اكتب الجديدة، وانسخ السطر اللي هيظهر وحطه مكان <b>adminPasswordHash</b> في config.js على GitHub، وحط نفس الكلمة في <b>ADMIN_PASSWORD</b> في Apps Script.</div>
      <div class="row"><input type="password" id="newAdm" placeholder="كلمة السر الجديدة" style="flex:1"><button type="button" class="btn sm" id="genH">توليد</button></div>
      <div class="log" id="hashOut" hidden dir="ltr"></div>
    </fieldset>
    <fieldset class="stack"><legend>مساحة الجهاز</legend>
      <button type="button" class="btn danger" id="bClean">مسح الصور المرفوعة من الجهاز</button>
    </fieldset>
    <div class="small muted" style="text-align:center">الإصدار 1.2</div>
  </form>`);
  if ($('#lock')) $('#lock').onclick = () => { adminPass = null; viewSettings(); toast('اتقفلت 🔒'); };
  $('#bTest').onclick = async () => {
    const f = $('#f'); const old = { apiUrl: S.apiUrl, token: S.token };
    if (!fromCfg) { S.apiUrl = fv(f, 'apiUrl'); S.token = fv(f, 'token'); }
    try { const r = await api('ping'); await saveSettings(); toast(`الاتصال شغال ✓ — ${r.sheetName || ''}`, 3500); startAutoSync(); autoSync(); }
    catch (e) { Object.assign(S, old); toast('فشل: ' + e.message, 6000); }
  };
  $('#genH').onclick = async () => { const v = $('#newAdm').value; if (v.length < 8) { toast('خليها 8 حروف على الأقل'); return; } const o = $('#hashOut'); o.hidden = false; o.textContent = `adminPasswordHash: '${await sha256(v)}',`; if (!CFG.adminPasswordHash) adminPass = v; };
  $('#bClean').onclick = async () => {
    const up = (await DB.all('photos')).filter(p => p.uploaded); if (!up.length) { toast('مفيش صور مرفوعة على الجهاز'); return; }
    if (!await confirmBox(`مسح ${up.length} صورة مرفوعة من الجهاز؟ (هتفضل على الدرايف)`, 'مسح', true)) return;
    for (const p of up) await DB.del('photos', p.id); toast('اتمسحت ✓');
  };
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const lines = fv(f, 'templates').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { toast('لازم زيارة واحدة على الأقل'); return; }
    S.templates = lines.map((l, i) => { const [name, off, prod] = l.split('|').map(x => (x || '').trim()); return { key: 'v' + (i + 1), name: name || `زيارة ${i + 1}`, offset: Number(off) || 0, product: prod || '' }; });
    if (!fromCfg) Object.assign(S, { apiUrl: fv(f, 'apiUrl'), token: fv(f, 'token') });
    Object.assign(S, { user: fv(f, 'user'), codePrefix: fv(f, 'codePrefix') || 'C', autoSync: f.elements.autoSync.checked, autoPhotos: f.elements.autoPhotos.checked, wifiOnly: f.elements.wifiOnly.checked, syncEvery: Number(fv(f, 'syncEvery')) || 5,
      products: fv(f, 'products').split('\n').map(x => x.trim()).filter(Boolean), regions: fv(f, 'regions').split('\n').map(x => x.trim()).filter(Boolean),
      defaultLines: Number(fv(f, 'defaultLines')) || '', theme: (f.querySelector('input[name=theme]:checked') || {}).value || 'auto', configDirty: 1 });
    await saveSettings(); startAutoSync(); $('#brandSub').textContent = S.user || 'Field Trials';
    if (navigator.onLine && S.apiUrl) {
      try { await pushSharedConfig(); toast('اتحفظت واتبعتت لكل الأجهزة ✓'); } catch (err) { toast('اتحفظت على الجهاز — هتتبعت لما النت يرجع (' + err.message + ')', 5000); }
    } else toast('اتحفظت على الجهاز — هتتبعت لكل الأجهزة أول ما النت يرجع');
  };
}

// ---------- Boot ----------
function afterChange() { updateNet(); setTimeout(autoSync, 400); }
(async function boot() {
  try {
    await DB.open(); await loadSettings();
    // الربط من config.js دايماً له الأولوية — أي جهاز جديد بيتربط لوحده
    if (CFG.apiUrl) S.apiUrl = CFG.apiUrl;
    if (CFG.token) S.token = CFG.token;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    $('#brandSub').textContent = S.user || 'Field Trials';
    window.addEventListener('hashchange', route); await route(); updateNet();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
    await askUserName();
    startAutoSync(); autoSync();
  } catch (e) { view(`<div class="empty">خطأ في تشغيل التطبيق: ${esc(e.message)}</div>`); }
})();
