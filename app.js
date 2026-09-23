/* Marcapáginas: registro de lectura (PWA, sin dependencias)
   Los datos viven en este dispositivo (localStorage). Respalda desde Resumen. */
(() => {
'use strict';

/* ================= Constantes ================= */
const KEY = 'marcapaginas:v2';
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MON_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const TYPES = ['Libro','Manga','Cómic','Artículo','Otro'];
const SPINES = ['#2E4A5A','#7B3F4A','#3F6248','#8A5A1F','#55467A','#2F6B6B','#4D5B2B','#1F3F8A','#6B3A6B','#5A3E2B'];
const STATUSES = ['reading','read','want'];
const CFG = window.MP_CONFIG || {};
const SYNC_ON = !!(CFG.supabaseUrl && CFG.supabaseKey);
const AUTH_KEY = 'marcapaginas:auth';
const I = {
  plus:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  back:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  close:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>',
  heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.6 3.6 4.5 6.9 4.5c2 0 3.5 1 5.1 3 1.6-2 3.1-3 5.1-3 3.3 0 5.4 3.1 4.2 6.6-1.8 4.8-9.3 9.4-9.3 9.4z" stroke-linejoin="round"/></svg>',
  trash:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" fill="none"/></svg>'
};

/* ================= Estado ================= */
const S = {
  tab: 'reading',        // reading | read | want | stats
  detail: null,          // id del libro abierto
  search: null,          // null = fuera de búsqueda; string = texto buscado
  favOnly: false,
  statsYear: null,       // número o 'all'
  items: [],
  goals: {},             // { "2026": 24 }
  goalsT: {},            // cuándo se cambió cada meta (para sincronizar)
  deleted: {},           // { idLibro: cuándo se borró } (para sincronizar borrados)
  meta: { since: 0, lastSync: 0, lastBackup: 0 },
  sync: { state: 'idle', msg: '' },
  draft: { kind: 'quote', page: '', text: '', pg: null }
};
let D = null;            // estado del diálogo abierto
let deferredInstall = null;
const $ = (id) => document.getElementById(id);
const view = $('view');
const dlg = $('dlg');

/* ================= Utilidades ================= */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const find = (id) => S.items.find((x) => x.id === id);
const byStatus = (st) => S.items.filter((x) => x.status === st);
const curYear = () => new Date().getFullYear();
const fmtInt = (n) => Number(n).toLocaleString('es-MX');
const fmtDec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* Fechas (formato interno AAAA-MM-DD, hora local) */
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayStr = () => dateStr(new Date());
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}
function fmtDate(s) {
  const d = parseDate(s);
  return d ? d.getDate() + ' de ' + MONTHS[d.getMonth()] + ' de ' + d.getFullYear() : '';
}
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const spanDays = (a, b) => daysBetween(a, b) + 1;      // cuenta ambos días
function itemDays(it) {
  if (it.startDate && it.endDate && parseDate(it.startDate) && parseDate(it.endDate) && it.endDate >= it.startDate) return spanDays(it.startDate, it.endDate);
  return null;
}

/* Progreso */
function pctOf(n, t) {
  if (!t || t <= 0) return 0;
  if (n >= t) return 100;
  return Math.min(99, Math.max(0, Math.round(n / t * 100)));
}
const pct = (it) => pctOf(it.current || 0, it.total);

/* Aspecto */
function spineColor(it) { return SPINES[(typeof it.ci === 'number' ? it.ci : hash(it.title + (it.author || ''))) % SPINES.length]; }
function nextColor() {
  if (!S.items.length) return hash(uid()) % SPINES.length;
  const last = S.items.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))[0];
  const base = typeof last.ci === 'number' ? last.ci : hash(last.title + (last.author || ''));
  return (base + 3) % SPINES.length;
}
function metaLine(it) {
  const p = [it.type || 'Libro'];
  if (it.format) p.push(it.format === 'digital' ? 'digital' : 'físico');
  if (it.total) p.push(it.total + ' páginas');
  if (it.publisher) p.push(it.publisher);
  return p.join(', ');
}
function readWhen(it) {
  if (it.endDate) return 'Terminado el ' + fmtDate(it.endDate);
  return it.month ? 'Leído en ' + MONTHS[it.month - 1] + ' de ' + it.year : 'Leído en ' + it.year;
}
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600);
}
const setErr = (id, msg) => { const e = $(id); if (e) e.textContent = msg; return false; };

/* ================= Persistencia ================= */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    S.items = Array.isArray(d.items) ? d.items : [];
    S.goals = isObj(d.goals) ? d.goals : {};
    S.goalsT = isObj(d.goalsT) ? d.goalsT : {};
    S.deleted = isObj(d.deleted) ? d.deleted : {};
    S.meta = Object.assign(S.meta, isObj(d.meta) ? d.meta : {});
    Object.keys(S.goals).forEach((y) => { if (!S.goalsT[y]) S.goalsT[y] = 1; });
  } catch (e) { S.items = []; S.goals = {}; }
}
let askedPersist = false;
function save(opts) {
  if (!S.meta.since) S.meta.since = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify({ version: 3, items: S.items, goals: S.goals, goalsT: S.goalsT, deleted: S.deleted, meta: S.meta })); }
  catch (e) { toast('No se pudo guardar en este dispositivo. Exporta una copia desde Resumen.'); }
  if (!askedPersist && navigator.storage && navigator.storage.persist) {
    askedPersist = true; navigator.storage.persist().catch(() => {});
  }
  if (!(opts && opts.noSync)) scheduleSync();
}
function putItem(it) {
  it.updatedAt = Date.now();
  const i = S.items.findIndex((x) => x.id === it.id);
  if (i < 0) S.items.push(it); else S.items[i] = it;
  save(); render();
}
function removeItem(id) {
  S.items = S.items.filter((x) => x.id !== id);
  S.deleted[id] = Date.now();
  if (S.detail === id) S.detail = null;
  save(); render();
}


/* ================= Sincronización con Supabase =================
   Estrategia: la app trabaja siempre con los datos locales. Si hay sesión,
   descarga la copia de la nube, la combina (gana lo más reciente de cada libro)
   y sube el resultado. Solo usa fetch: no hay librerías externas. */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
let auth = null;
let syncing = false, syncAgain = false, syncTimer = null, lastSyncTry = 0;

function loadAuth() {
  try { const a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); return a && a.access_token && a.refresh_token && a.user_id ? a : null; }
  catch (e) { return null; }
}
function storeAuth(a) {
  auth = a;
  try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* sin almacenamiento */ }
}
const baseUrl = () => String(CFG.supabaseUrl).replace(/\/+$/, '');
async function api(path, o = {}) {
  const headers = Object.assign({ apikey: CFG.supabaseKey, 'Content-Type': 'application/json' }, o.headers || {});
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  const res = await fetch(baseUrl() + path, { method: o.method || 'GET', headers, body: o.body ? JSON.stringify(o.body) : undefined });
  let data = null;
  const txt = await res.text();
  if (txt) { try { data = JSON.parse(txt); } catch (e) { data = txt; } }
  return { ok: res.ok, status: res.status, data };
}
function sessionFrom(d) {
  return {
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000,
    email: (d.user && d.user.email) || (auth && auth.email) || '',
    user_id: (d.user && d.user.id) || (auth && auth.user_id)
  };
}
async function signIn(email, password) {
  const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!r.ok) {
    const m = (r.data && (r.data.error_description || r.data.msg || r.data.message)) || '';
    const c = (r.data && (r.data.error_code || r.data.error)) || '';
    throw new Error(/invalid[ _]login|invalid_credentials/i.test(m + ' ' + c) ? 'Correo o contraseña incorrectos.' : (m || 'No se pudo iniciar sesión (' + r.status + ').'));
  }
  storeAuth(sessionFrom(r.data));
}
const sessionError = () => Object.assign(new Error('session'), { code: 'session' });
async function refreshSession() {
  if (!auth) throw sessionError();
  const r = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } });
  if (r.ok) { storeAuth(sessionFrom(r.data)); return; }
  if (r.status === 400 || r.status === 401 || r.status === 403) { storeAuth(null); throw sessionError(); }
  throw new Error('refresh ' + r.status);
}
async function rest(method, path, body, prefer, retried) {
  if (!auth) throw sessionError();
  if (auth.expires_at - 60000 < Date.now()) await refreshSession();
  const r = await api('/rest/v1/' + path, { method, body, token: auth.access_token, headers: prefer ? { Prefer: prefer } : {} });
  if (r.status === 401 && !retried) { await refreshSession(); return rest(method, path, body, prefer, true); }
  return r;
}
const snapshot = () => ({ v: 3, items: S.items, goals: S.goals, goalsT: S.goalsT, deleted: S.deleted });
function cleanGoals(g) {
  const o = {};
  if (isObj(g)) Object.keys(g).forEach((y) => { if (/^\d{4}$/.test(y) && num1(g[y])) o[y] = num1(g[y]); });
  return o;
}
/* Forma canónica para comparar dos copias sin que importe el orden */
function canon(d) {
  const items = (Array.isArray(d.items) ? d.items : []).map(sanitize).filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : 1));
  return stable({ items, goals: cleanGoals(d.goals), goalsT: isObj(d.goalsT) ? d.goalsT : {}, deleted: isObj(d.deleted) ? d.deleted : {} });
}
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
/* Combina la copia de la nube con la local. Gana lo más reciente de cada libro; los borrados se respetan. */
function mergeData(remote) {
  const map = new Map();
  S.items.forEach((i) => map.set(i.id, i));
  (Array.isArray(remote.items) ? remote.items : []).map(sanitize).filter(Boolean).forEach((r) => {
    const l = map.get(r.id);
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) map.set(r.id, r);
  });
  const del = Object.assign({}, S.deleted);
  const rdel = isObj(remote.deleted) ? remote.deleted : {};
  Object.keys(rdel).forEach((id) => { const t = +rdel[id] || 0; if (!(del[id] >= t)) del[id] = t; });
  Object.keys(del).forEach((id) => {
    const it = map.get(id);
    if (it && del[id] >= (it.updatedAt || 0)) map.delete(id);
  });
  Object.keys(del).forEach((id) => { if (map.has(id) || Date.now() - del[id] > 1.55e10) delete del[id]; });
  const goals = Object.assign({}, S.goals), goalsT = Object.assign({}, S.goalsT);
  const rg = isObj(remote.goals) ? remote.goals : {}, rgt = isObj(remote.goalsT) ? remote.goalsT : {};
  new Set([...Object.keys(goalsT), ...Object.keys(rgt), ...Object.keys(rg)]).forEach((y) => {
    if (!/^\d{4}$/.test(y)) return;
    const lt = +goalsT[y] || 0, rt = +rgt[y] || (rg[y] ? 1 : 0);
    if (rt > lt) { goalsT[y] = rt; if (num1(rg[y])) goals[y] = num1(rg[y]); else delete goals[y]; }
  });
  S.items = [...map.values()]; S.deleted = del; S.goals = goals; S.goalsT = goalsT;
}
async function remoteGet() {
  const r = await rest('GET', 'library?select=data,rev&user_id=eq.' + auth.user_id);
  if (!r.ok) throw new Error('get ' + r.status);
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}
async function remotePut(row) {
  const payload = snapshot();
  const r = row
    ? await rest('PATCH', 'library?user_id=eq.' + auth.user_id + '&rev=eq.' + row.rev, { data: payload, rev: row.rev + 1, updated_at: new Date().toISOString() }, 'return=representation')
    : await rest('POST', 'library', { user_id: auth.user_id, data: payload, rev: 1 }, 'return=representation');
  if (r.status === 409) return false;                                   // alguien más guardó primero
  if (!r.ok) throw new Error('put ' + r.status);
  if (row && Array.isArray(r.data) && !r.data.length) return false;      // la revisión cambió
  return true;
}
function scheduleSync(ms) {
  if (!SYNC_ON || !auth) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(false), ms || 1500);
}
function setSync(state, msg) {
  S.sync = { state, msg: msg || '' };
  if (S.tab === 'stats' && !S.detail && S.search === null) render();
}
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return 'hace ' + plural(m, 'minuto', 'minutos');
  const h = Math.floor(m / 60);
  if (h < 24) return 'hace ' + plural(h, 'hora', 'horas');
  const d = Math.floor(h / 24);
  return 'hace ' + plural(d, 'día', 'días');
}
function syncText() {
  const st = S.sync.state;
  if (st === 'syncing') return 'Sincronizando…';
  if (st === 'offline') return 'Sin conexión. Se sincronizará cuando vuelvas a tener internet.';
  if (st === 'error') return 'No se pudo sincronizar. ' + (S.sync.msg || 'Inténtalo de nuevo en un momento.');
  return S.meta.lastSync ? 'Todo sincronizado. Última vez ' + ago(S.meta.lastSync) + '.' : 'Aún no se ha sincronizado.';
}
function friendlyError(e) {
  const m = String(e && e.message || '');
  if (/^get 404|^put 404/.test(m)) return 'No encuentro la tabla «library» en Supabase. Ejecuta el SQL de configuración.';
  if (/^(get|put) (401|403)/.test(m)) return 'Supabase rechazó el permiso. Revisa las políticas del SQL de configuración.';
  if (m === 'conflict') return 'Hubo cambios al mismo tiempo desde otro lugar. Vuelve a intentarlo.';
  return 'Inténtalo de nuevo en un momento (' + m + ').';
}
async function syncNow(manual) {
  if (!SYNC_ON) return;
  if (!auth) { if (manual) toast('Inicia sesión para sincronizar.'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; lastSyncTry = Date.now();
  setSync('syncing');
  let state = 'ok', msg = '';
  try {
    for (let i = 0; i < 4; i++) {
      const row = await remoteGet();
      const rdata = row && isObj(row.data) ? row.data : {};
      if (row) {
        const before = canon(snapshot());
        mergeData(rdata);
        if (canon(snapshot()) !== before) { save({ noSync: true }); render(); }
        if (canon(rdata) === canon(snapshot())) break;                   // la nube ya está al día
      }
      if (await remotePut(row)) break;
      if (i === 3) throw new Error('conflict');
    }
    S.meta.lastSync = Date.now(); save({ noSync: true });
  } catch (e) {
    console.error(e);
    if (e && e.code === 'session') { state = 'idle'; toast('Tu sesión venció. Inicia sesión otra vez para seguir sincronizando.'); }
    else if (e instanceof TypeError) state = 'offline';
    else { state = 'error'; msg = friendlyError(e); }
  }
  syncing = false;
  setSync(state, msg);
  if (manual && state === 'ok') toast('Todo sincronizado.');
  else if (manual && state === 'offline') toast('Sin conexión.');
  if (syncAgain) { syncAgain = false; scheduleSync(300); }
}
function syncBlock() {
  if (!SYNC_ON) return '<section class="block"><h2>Sincronización</h2><p class="note" style="margin:0">La sincronización en la nube no está configurada. Falta llenar el archivo config.js.</p></section>';
  if (!auth) return '<section class="block"><h2>Sincronización</h2><p class="note" style="margin:0 0 14px">Inicia sesión para guardar tu biblioteca en la nube. Si el navegador borra los datos, la recuperas al volver a entrar.</p><button class="btn" data-action="login">Iniciar sesión</button></section>';
  return '<section class="block"><h2>Sincronización</h2><p style="margin:0 0 4px">Sesión de <b>' + esc(auth.email) + '</b></p><p class="note" style="margin:0 0 14px">' + esc(syncText()) + '</p><div class="data-actions"><button class="btn ghost small" data-action="sync-now"' + (S.sync.state === 'syncing' ? ' disabled' : '') + '>Sincronizar ahora</button><button class="btn ghost small" data-action="logout">Cerrar sesión</button></div></section>';
}
function openLoginDialog() {
  D = { kind: 'login' };
  dlgShell('Iniciar sesión',
    '<p>Usa el correo y la contraseña de la cuenta que creaste en Supabase para tu biblioteca.</p>' +
    '<label class="f">Correo<input id="f-email" type="email" inputmode="email" autocomplete="username" autocapitalize="none"></label>' +
    '<label class="f">Contraseña<input id="f-pass" type="password" autocomplete="current-password"></label>',
    '<button class="btn ghost" data-action="close-dlg">Cancelar</button><button class="btn" id="login-btn" data-action="do-login">Entrar</button>');
  openDlg();
}
async function doLogin() {
  const email = $('f-email').value.trim(), pass = $('f-pass').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('f-err', 'Escribe un correo válido.');
  if (!pass) return setErr('f-err', 'Escribe tu contraseña.');
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Entrando…'; setErr('f-err', '');
  try {
    await signIn(email, pass);
    closeDlg(); toast('Sesión iniciada.'); render(); syncNow(true);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Entrar';
    setErr('f-err', e instanceof TypeError ? 'No hay conexión con el servidor. Revisa tu internet.' : e.message);
  }
}

/* ================= Piezas de interfaz ================= */
function track(p) {
  return '<span class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="Avance"><span class="fill" style="width:' + p + '%"></span><span class="mark" style="left:' + p + '%;transform:translateX(-' + p + '%)"></span></span>';
}
function head(title, sub, btnLabel, action) {
  return '<div class="sect-head"><div><h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><button class="btn" data-action="' + action + '">' + I.plus + '<span>' + btnLabel + '</span></button></div>';
}
function emptyBlock(text, btnLabel, action) {
  return '<div class="empty"><p>' + text + '</p><button class="btn" data-action="' + action + '">' + I.plus + '<span>' + btnLabel + '</span></button></div>';
}

/* ================= Vistas: listas ================= */
function viewReading() {
  const list = byStatus('reading').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  let h = head('Leyendo', list.length ? list.length + ' en curso' : '', 'Agregar lectura', 'add');
  if (!list.length) {
    h += emptyBlock('No tienes ninguna lectura en curso. Registra lo que estás leyendo y guarda tu avance página por página.', 'Agregar lectura', 'add');
    if (SYNC_ON && !auth) h += '<div class="empty" style="margin-top:0;border-top:0;padding-top:0"><p style="font-size:16px">¿Ya usabas Marcapáginas? Inicia sesión para recuperar tu biblioteca.</p><button class="btn ghost" data-action="login">Iniciar sesión</button></div>';
    return h;
  }
  return h + '<ul class="list">' + list.map((it) => {
    const p = pct(it);
    return '<li><button class="row" data-action="open" data-id="' + it.id + '">' +
      '<span class="mini" style="background:' + spineColor(it) + '"></span>' +
      '<span class="row-main"><span class="row-title">' + esc(it.title) + '</span>' +
      (it.author ? '<span class="row-sub">' + esc(it.author) + '</span>' : '') +
      '<span class="row-meta">' + esc(metaLine(it)) + '</span>' + track(p) +
      '<span class="row-prog"><span>Página ' + (it.current || 0) + ' de ' + it.total + '</span><strong>' + p + '%</strong></span>' +
      '</span></button></li>';
  }).join('') + '</ul>';
}

function readSort(a, b) {
  if (b.year !== a.year) return b.year - a.year;
  const am = a.month || 0, bm = b.month || 0;
  if (bm !== am) return bm - am;
  if ((a.endDate || '') !== (b.endDate || '')) return (b.endDate || '') > (a.endDate || '') ? 1 : -1;
  return (b.finishedAt || b.updatedAt || 0) - (a.finishedAt || a.updatedAt || 0);
}
function spineHTML(it) {
  const p = it.total || 250;
  const w = Math.max(28, Math.min(48, Math.round(26 + p / 22)));
  const h = Math.max(124, Math.min(184, Math.round(112 + (hash(it.title) % 5) * 7 + p / 11)));
  return '<button class="spine" tabindex="-1" data-action="open" data-id="' + it.id + '" style="width:' + w + 'px;height:' + h + 'px;background:' + spineColor(it) + '">' +
    (it.favorite ? '<span class="spine-fav">' + I.heart + '</span>' : '') +
    '<span class="spine-t">' + esc(it.title) + '</span></button>';
}
function viewRead() {
  const all = byStatus('read').sort(readSort);
  const list = S.favOnly ? all.filter((x) => x.favorite) : all;
  let h = head('Leídos', all.length ? plural(all.length, 'lectura', 'lecturas') : '', 'Agregar libro leído', 'add');
  if (!all.length) return h + emptyBlock('Aquí quedará todo lo que termines. También puedes registrar lo que leíste en años anteriores, solo con el año.', 'Agregar libro leído', 'add');
  if (all.some((x) => x.favorite)) h += '<div class="filters"><button class="chip" data-action="fav-only" aria-pressed="' + S.favOnly + '">Solo favoritos</button></div>';
  const years = [];
  list.forEach((it) => { if (!years.includes(it.year)) years.push(it.year); });
  return h + years.map((y) => {
    const g = list.filter((x) => x.year === y);
    return '<section class="year"><div class="year-head"><h2>' + y + '</h2><span>' + plural(g.length, 'lectura', 'lecturas') + '</span></div>' +
      '<div class="shelf" aria-hidden="true">' + g.slice().reverse().map(spineHTML).join('') + '</div>' +
      '<ul class="list">' + g.map((it) =>
        '<li><button class="row" data-action="open" data-id="' + it.id + '">' +
        '<span class="when" title="' + (it.month ? cap(MONTHS[it.month - 1]) : 'Sin mes') + '">' + (it.month ? MON_SHORT[it.month - 1] : '—') + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(it.title) + '</span>' + (it.author ? '<span class="row-sub">' + esc(it.author) + '</span>' : '') + '</span>' +
        '<span class="row-end">' + (it.rating ? '<span class="rate-chip">' + I.star + it.rating + '</span>' : '') + (it.favorite ? '<span class="fav-mark" aria-label="Favorito">' + I.heart + '</span>' : '') + '</span>' +
        '</button></li>').join('') + '</ul></section>';
  }).join('');
}
function viewWant() {
  const list = byStatus('want').sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  let h = head('Quiero leer', list.length ? plural(list.length, 'pendiente', 'pendientes') : '', 'Agregar a la lista', 'add');
  if (!list.length) return h + emptyBlock('Apunta lo que quieres leer más adelante: solo el título, el autor y el tipo.', 'Agregar a la lista', 'add');
  return h + '<ul class="list">' + list.map((it) =>
    '<li class="row"><span class="mini" style="background:' + spineColor(it) + '"></span>' +
    '<span class="row-main"><span class="row-title">' + esc(it.title) + '</span>' + (it.author ? '<span class="row-sub">' + esc(it.author) + '</span>' : '') + '<span class="row-meta">' + esc(it.type || 'Libro') + '</span></span>' +
    '<span class="row-actions"><button class="btn small" data-action="start" data-id="' + it.id + '">Empezar</button>' +
    '<button class="icon-btn" data-action="edit" data-id="' + it.id + '" aria-label="Editar ' + esc(it.title) + '">' + I.pencil + '</button>' +
    '<button class="icon-btn" data-action="delete" data-id="' + it.id + '" aria-label="Eliminar ' + esc(it.title) + '">' + I.trash + '</button></span></li>').join('') + '</ul>';
}

/* ================= Vista: detalle ================= */
function paceHTML(it) {
  const sd = parseDate(it.startDate);
  if (!sd) return '<p class="pace">Agrega la fecha de inicio en «Editar datos del libro» para calcular tu ritmo.</p>';
  const start = 'Empezaste el ' + fmtDate(it.startDate) + '. ';
  if (!(it.current > 0)) return '<p class="pace">' + start + 'Guarda tu avance para calcular tu ritmo.</p>';
  const days = Math.max(1, spanDays(it.startDate, todayStr()));
  const ppd = it.current / days;
  const need = Math.ceil((it.total - it.current) / ppd);
  const end = new Date(); end.setDate(end.getDate() + need);
  return '<p class="pace">' + start + 'Llevas ' + plural(days, 'día', 'días') + ' a ' + fmtDec(ppd, ppd >= 10 ? 0 : 1) + ' páginas por día. A este ritmo lo terminas alrededor del ' + fmtDate(dateStr(end)) + '.</p>';
}
function progressPanel(it) {
  const p = pct(it);
  const v = S.draft.pg != null ? S.draft.pg : String(it.current || 0);
  return '<section class="panel" aria-label="Avance de lectura">' +
    '<div class="pct"><span class="pct-n">' + p + '</span><span class="pct-s">%</span></div>' + track(p) +
    '<div class="pg-form"><label for="pg">Página actual</label><div class="pg-row">' +
    '<input id="pg" type="number" inputmode="numeric" min="0" max="' + it.total + '" value="' + esc(v) + '" data-draft="pg">' +
    '<button class="btn" data-action="save-page" data-id="' + it.id + '">Guardar avance</button></div></div>' +
    '<p class="hint" id="pg-preview" aria-live="polite"></p><p class="err" id="pg-err" role="alert"></p>' +
    paceHTML(it) +
    '<button class="btn ghost" data-action="finish" data-id="' + it.id + '">Terminé este libro</button></section>';
}
function readPanel(it) {
  const stars = [1, 2, 3, 4, 5].map((n) =>
    '<button type="button" data-action="rate" data-id="' + it.id + '" data-n="' + n + '" aria-label="Calificar con ' + n + (n === 1 ? ' estrella' : ' estrellas') + '" aria-pressed="' + ((it.rating || 0) >= n) + '">' + I.star + '</button>').join('');
  const days = itemDays(it);
  let when = '<p class="when-read">' + readWhen(it) + '</p>';
  if (it.startDate && it.endDate) {
    when += '<p class="pace">Empezado el ' + fmtDate(it.startDate) + (days ? '. Lo leíste en ' + plural(days, 'día', 'días') + (it.total ? ', a ' + fmtDec(it.total / days, it.total / days >= 10 ? 0 : 1) + ' páginas por día' : '') + '.' : '.') + '</p>';
  }
  return '<section class="panel" aria-label="Lectura terminada">' + when +
    '<div class="read-top"><div class="stars" role="group" aria-label="Calificación">' + stars + '</div>' +
    '<button class="fav-toggle" data-action="toggle-fav" data-id="' + it.id + '" aria-pressed="' + !!it.favorite + '">' + I.heart + '<span>Favorito</span></button></div>' +
    (it.opinion ? '<p class="opinion">' + esc(it.opinion) + '</p>' : '<p class="opinion empty">Todavía no escribes tu opinión de este libro.</p>') +
    '<button class="link" data-action="edit-finish" data-id="' + it.id + '">Editar fecha y opinión</button></section>';
}
function entriesSection(it) {
  const k = S.draft.kind;
  const es = (it.entries || []).slice().sort((a, b) => {
    const ap = a.page == null ? 1e9 : a.page, bp = b.page == null ? 1e9 : b.page;
    return ap - bp || (a.createdAt || 0) - (b.createdAt || 0);
  });
  let h = '<section class="entries"><h2>Citas y notas</h2><div class="entry-form">' +
    '<div class="seg" role="group" aria-label="Tipo de registro">' +
    '<button type="button" data-action="entry-type" data-v="quote" aria-pressed="' + (k === 'quote') + '">Cita</button>' +
    '<button type="button" data-action="entry-type" data-v="note" aria-pressed="' + (k === 'note') + '">Nota</button></div>' +
    '<label class="f">Página (opcional)<input id="ep" type="number" inputmode="numeric" min="0" value="' + esc(S.draft.page) + '" data-draft="page"></label>' +
    '<label class="f"><span class="sr-only">Texto</span><textarea id="et" rows="3" data-draft="text" placeholder="' + (k === 'quote' ? 'Escribe la cita tal como aparece en el libro' : 'Escribe lo que pensaste en esta página') + '">' + esc(S.draft.text) + '</textarea></label>' +
    '<p class="err" id="e-err" role="alert"></p>' +
    '<button class="btn" id="e-btn" data-action="add-entry" data-id="' + it.id + '">' + (k === 'quote' ? 'Guardar cita' : 'Guardar nota') + '</button></div>';
  if (es.length) {
    h += '<ul class="list entry-list">' + es.map((e) =>
      '<li class="entry ' + e.kind + '"><p class="entry-text">' + (e.kind === 'quote' ? '“' + esc(e.text) + '”' : esc(e.text)) + '</p>' +
      '<div class="entry-foot"><span>' + (e.kind === 'quote' ? 'Cita' : 'Nota') + (e.page != null ? ', página ' + e.page : '') + '</span>' +
      '<button class="icon-btn" data-action="del-entry" data-id="' + it.id + '" data-eid="' + e.id + '" aria-label="Eliminar ' + (e.kind === 'quote' ? 'cita' : 'nota') + '">' + I.trash + '</button></div></li>').join('') + '</ul>';
  } else {
    h += '<p class="empty-small">Aún no hay nada guardado. Anota una frase que te guste o un pensamiento sobre una página.</p>';
  }
  return h + '</section>';
}
function viewDetail(it) {
  const read = it.status === 'read';
  const backLabel = S.search !== null ? 'Búsqueda' : read ? 'Leídos' : 'Leyendo';
  return '<button class="back" data-action="back">' + I.back + '<span>' + backLabel + '</span></button>' +
    '<header class="d-head"><h1 class="d-title">' + esc(it.title) + '</h1>' +
    (it.author ? '<p class="d-author">' + esc(it.author) + '</p>' : '') +
    '<p class="d-meta">' + esc(metaLine(it)) + '</p></header>' +
    (read ? readPanel(it) : progressPanel(it)) + entriesSection(it) +
    '<div class="d-actions"><button class="link" data-action="edit" data-id="' + it.id + '">Editar datos del libro</button><button class="link danger" data-action="delete" data-id="' + it.id + '">Eliminar</button></div>';
}

/* ================= Vista: resumen ================= */
function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.map((r) => '<div class="hbar"><span class="hb-l">' + esc(r[0]) + '</span><span class="hb-t"><span class="hb-f" style="width:' + Math.round(r[1] / max * 100) + '%"></span></span><span class="hb-n">' + r[1] + '</span></div>').join('');
}
function columns(labels, values) {
  const max = Math.max(1, ...values);
  const aria = labels.map((l, i) => l + ' ' + values[i]).join(', ');
  return '<div class="mchart" role="img" aria-label="' + esc(aria) + '">' + values.map((v) =>
    '<div class="mcol' + (v === 0 ? ' zero' : '') + '"><span class="mn">' + (v || '') + '</span><span class="mbar" style="height:' + Math.round(v / max * 118) + 'px"></span></div>').join('') + '</div>' +
    '<div class="mlabels" aria-hidden="true">' + labels.map((l) => '<span>' + esc(l) + '</span>').join('') + '</div>';
}
function goalBlock(y, count) {
  const goal = S.goals[y];
  let h = '<section class="block goal"><h2>Meta de lectura ' + y + '</h2>';
  if (!goal) {
    return h + '<p class="msg" style="margin-top:0">Todavía no defines cuántos libros quieres leer en ' + y + '.</p><button class="btn" data-action="goal" data-year="' + y + '">Definir meta</button></section>';
  }
  h += '<p class="goal-line">' + count + ' de ' + goal + ' libros <small>' + pctOf(count, goal) + '%</small></p>' + track(pctOf(count, goal));
  let msg;
  if (count >= goal) {
    msg = count === goal ? '¡Meta cumplida!' : '¡Meta cumplida y ' + plural(count - goal, 'libro', 'libros') + ' de más!';
  } else if (y === curYear()) {
    const now = new Date(), a = new Date(y, 0, 1), b = new Date(y + 1, 0, 1);
    const expected = goal * (now - a) / (b - a);
    const diff = count - expected;
    const left = goal - count;
    const daysLeft = Math.max(1, Math.ceil((b - now) / 86400000));
    const every = Math.max(1, Math.floor(daysLeft / left));
    msg = (diff >= 1 ? 'Vas adelantado: llevas ' + plural(Math.floor(diff), 'libro', 'libros') + ' más de lo esperado. ' : diff <= -1 ? 'Vas ' + plural(Math.floor(-diff), 'libro', 'libros') + ' por debajo del ritmo. ' : 'Vas al ritmo de tu meta. ') +
      'Te faltan ' + plural(left, 'libro', 'libros') + ': con uno cada ' + plural(every, 'día', 'días') + ' llegas.';
  } else {
    msg = 'Ese año terminaste ' + count + ' de ' + goal + ' libros.';
  }
  return h + '<p class="msg">' + msg + '</p><button class="btn ghost small" data-action="goal" data-year="' + y + '">Cambiar meta</button></section>';
}
function installBlock() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (deferredInstall) return '<button class="btn" data-action="install">Instalar app</button>';
  if (ios) return '<p class="install-note">Para instalarla en iPhone o iPad: abre esta página en Safari, toca Compartir y elige «Agregar a inicio».</p>';
  return '<p class="install-note">Para instalarla, abre el menú de tu navegador y elige «Instalar app» o «Agregar a la pantalla de inicio».</p>';
}
function viewStats() {
  const all = byStatus('read');
  const years = [...new Set([curYear(), ...all.map((i) => i.year)])].sort((a, b) => b - a);
  if (S.statsYear == null || (S.statsYear !== 'all' && !years.includes(S.statsYear))) S.statsYear = curYear();
  const y = S.statsYear;
  const list = y === 'all' ? all : all.filter((i) => i.year === y);
  const n = list.length;
  const opts = years.map((yy) => '<option value="' + yy + '"' + (y === yy ? ' selected' : '') + '>' + yy + '</option>').join('') + '<option value="all"' + (y === 'all' ? ' selected' : '') + '>Todos los años</option>';
  let h = '<div class="stats-head"><h1>Resumen</h1><div><label class="sr-only" for="stats-year">Año</label><select id="stats-year">' + opts + '</select></div></div>';

  if (SYNC_ON && !auth) h += syncBlock();
  if (y !== 'all') h += goalBlock(y, n);

  if (!n) {
    h += '<p class="hint-block">' + (all.length ? 'No hay lecturas terminadas en ' + y + '.' : 'Cuando termines tu primer libro verás aquí tus números.') + '</p>';
  } else {
    const pages = list.reduce((s, i) => s + (i.total || 0), 0);
    const noPages = list.filter((i) => !i.total).length;
    const rated = list.filter((i) => i.rating);
    const avg = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : null;
    const timed = list.map(itemDays).filter((d) => d != null);
    const avgDays = timed.length ? timed.reduce((s, d) => s + d, 0) / timed.length : null;
    h += '<section class="block"><h2>En números</h2><div class="numbers">' +
      '<div class="num"><b>' + n + '</b><span>' + (n === 1 ? 'lectura terminada' : 'lecturas terminadas') + '</span></div>' +
      '<div class="num"><b>' + fmtInt(pages) + '</b><span>páginas leídas</span></div>' +
      '<div class="num"><b>' + (avg == null ? '—' : fmtDec(avg)) + '</b><span>calificación promedio</span></div>' +
      '<div class="num"><b>' + (avgDays == null ? '—' : fmtDec(avgDays, 0)) + '</b><span>días por lectura</span></div></div>' +
      (noPages ? '<p class="note">' + plural(noPages, 'lectura no tiene', 'lecturas no tienen') + ' páginas registradas y no se suma' + (noPages === 1 ? '' : 'n') + '.</p>' : '') +
      (timed.length && timed.length < n ? '<p class="note">Los días por lectura se calculan con ' + (timed.length === 1 ? 'la que tiene' : 'las ' + timed.length + ' que tienen') + ' fecha de inicio y de término.</p>' : '') + '</section>';

    if (y === 'all') {
      const ys = [...new Set(all.map((i) => i.year))].sort((a, b) => a - b);
      h += '<section class="block"><h2>Por año</h2>' + hbars(ys.map((yy) => [String(yy), all.filter((i) => i.year === yy).length])) + '</section>';
    } else {
      const vals = MON_SHORT.map((_, m) => list.filter((i) => i.month === m + 1).length);
      const noMonth = list.filter((i) => !i.month).length;
      h += '<section class="block"><h2>Por mes</h2>' + columns(MON_SHORT.map(cap), vals) +
        (noMonth ? '<p class="note">' + plural(noMonth, 'lectura', 'lecturas') + ' sin mes registrado no aparece' + (noMonth === 1 ? '' : 'n') + ' en la gráfica.</p>' : '') + '</section>';
    }

    const types = TYPES.map((t) => [t, list.filter((i) => (i.type || 'Libro') === t).length]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
    h += '<section class="block"><h2>Por tipo</h2>' + hbars(types) + '</section>';

    const fis = list.filter((i) => i.format === 'fisico').length, dig = list.filter((i) => i.format === 'digital').length;
    if (fis + dig) {
      h += '<section class="block"><h2>Formato</h2><div class="split" role="img" aria-label="Físico ' + fis + ', digital ' + dig + '"><span class="s1" style="width:' + fis / (fis + dig) * 100 + '%"></span><span class="s2" style="width:' + dig / (fis + dig) * 100 + '%"></span></div>' +
        '<div class="legend"><span><i style="background:var(--ink)"></i>Físico ' + fis + '</span><span><i style="background:var(--accent)"></i>Digital ' + dig + '</span></div></section>';
    }
    if (rated.length) {
      h += '<section class="block"><h2>Calificaciones</h2>' + hbars([5, 4, 3, 2, 1].map((s) => [s + (s === 1 ? ' estrella' : ' estrellas'), rated.filter((i) => i.rating === s).length])) + '</section>';
    }
    const favs = list.filter((i) => i.favorite).sort(readSort);
    if (favs.length) {
      h += '<section class="block"><h2>Favoritos</h2><ul class="fav-list">' + favs.map((i) => '<li><button class="link" data-action="open" data-id="' + i.id + '">' + I.heart + '<span>' + esc(i.title) + (i.author ? ', ' + esc(i.author) : '') + '</span></button></li>').join('') + '</ul></section>';
    }
  }

  if (!SYNC_ON || auth) h += syncBlock();
  const ref = S.meta.lastBackup || S.meta.since;
  const stale = !auth && S.items.length && ref && Date.now() - ref > 30 * 864e5;
  h += '<section class="block"><h2>Tus datos</h2><p class="note" style="margin:0 0 14px">Tu biblioteca se guarda en este dispositivo. Exporta una copia de vez en cuando para no perderla si cambias de teléfono o borras los datos del navegador.</p>' +
    (stale ? '<p class="note" style="margin:-6px 0 14px;color:var(--accent)">Hace ' + plural(Math.floor((Date.now() - ref) / 864e5), 'día', 'días') + ' que no exportas una copia.</p>' : '') +
    '<div class="data-actions"><button class="btn ghost small" data-action="export-json">Exportar copia</button><button class="btn ghost small" data-action="import">Importar copia</button><button class="btn ghost small" data-action="export-csv">Exportar leídos (CSV)</button></div>' +
    '<div style="margin-top:16px">' + installBlock() + '</div></section>';
  return h;
}

/* ================= Vista: búsqueda ================= */
const norm = (s) => Array.from(String(s || '')).map((c) => { const b = c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return (b.length === 1 ? b : c).toLowerCase(); }).join('');
function hl(text, terms) {
  const t = String(text || ''), n = norm(t), r = [];
  terms.forEach((term) => { let i = 0; while ((i = n.indexOf(term, i)) >= 0) { r.push([i, i + term.length]); i += term.length; } });
  if (!r.length) return esc(t);
  r.sort((a, b) => a[0] - b[0]);
  const m = [r[0].slice()];
  for (let k = 1; k < r.length; k++) { const l = m[m.length - 1]; if (r[k][0] <= l[1]) l[1] = Math.max(l[1], r[k][1]); else m.push(r[k].slice()); }
  let out = '', pos = 0;
  m.forEach((x) => { out += esc(t.slice(pos, x[0])) + '<mark>' + esc(t.slice(x[0], x[1])) + '</mark>'; pos = x[1]; });
  return out + esc(t.slice(pos));
}
function snippet(text, terms) {
  const n = norm(text); let at = -1;
  terms.forEach((t) => { const i = n.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
  if (at < 0) return null;
  const a = Math.max(0, at - 45), b = Math.min(text.length, at + 110);
  return (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
}
function searchResults(q) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  return S.items.map((it) => {
    const main = norm([it.title, it.author, it.publisher, it.type, it.opinion].join(' '));
    const ents = (it.entries || []);
    const all = main + ' ' + norm(ents.map((e) => e.text).join(' '));
    if (!terms.every((t) => all.includes(t))) return null;
    const nt = norm(it.title), na = norm(it.author);
    let score = 0;
    terms.forEach((t) => { if (nt.includes(t)) score += 3; if (na.includes(t)) score += 2; });
    const snips = ents.filter((e) => terms.some((t) => norm(e.text).includes(t))).slice(0, 2).map((e) => ({ kind: e.kind, page: e.page, text: snippet(e.text, terms) })).filter((s) => s.text);
    return { it, score, snips, terms };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}
function resultsHTML() {
  const q = S.search || '';
  const res = searchResults(q);
  if (res === null) return '<p class="hint-block">Busca por título, autor, editorial, tu opinión, citas o notas.</p>';
  if (!res.length) return '<p class="hint-block">No encontré nada para «' + esc(q.trim()) + '».</p>';
  return '<p class="sub" style="margin:10px 0 0">' + plural(res.length, 'resultado', 'resultados') + '</p><ul class="list">' + res.map((r) => {
    const it = r.it;
    const tag = it.status === 'reading' ? 'Leyendo, ' + pct(it) + '%' : it.status === 'read' ? (it.month ? 'Leído en ' + MONTHS[it.month - 1] + ' de ' + it.year : 'Leído en ' + it.year) : 'Quiero leer';
    return '<li><button class="row" data-action="' + (it.status === 'want' ? 'goto-want' : 'open') + '" data-id="' + it.id + '">' +
      '<span class="mini" style="background:' + spineColor(it) + '"></span><span class="row-main">' +
      '<span class="row-title">' + hl(it.title, r.terms) + '</span>' + (it.author ? '<span class="row-sub">' + hl(it.author, r.terms) + '</span>' : '') +
      '<span class="status-tag">' + tag + '</span>' +
      r.snips.map((s) => '<span class="snip">' + (s.kind === 'quote' ? 'Cita' : 'Nota') + (s.page != null ? ', p. ' + s.page : '') + ': ' + hl(s.text, r.terms) + '</span>').join('') +
      '</span></button></li>';
  }).join('') + '</ul>';
}
function viewSearch() {
  return '<div class="sect-head"><div><h1>Buscar</h1></div></div>' +
    '<div class="search-box"><label class="sr-only" for="q">Buscar en tu biblioteca</label><input id="q" type="search" autocomplete="off" placeholder="Título, autor, cita, nota…" value="' + esc(S.search) + '"></div>' +
    '<div id="results">' + resultsHTML() + '</div>';
}

/* ================= Render ================= */
function renderTabs(active) {
  ['reading', 'read', 'want', 'stats'].forEach((t) => {
    const b = document.querySelector('.tab[data-tab="' + t + '"]');
    if (active === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    const c = $('c-' + t);
    if (c) { const n = byStatus(t).length; c.textContent = n ? String(n) : ''; }
  });
}
function render() {
  let it = S.detail ? find(S.detail) : null;
  if (S.detail && (!it || it.status === 'want')) { S.detail = null; it = null; }
  if (it && S.search === null) S.tab = it.status;
  renderTabs(S.search !== null ? null : S.tab);
  const ae = document.activeElement;
  const keep = ae && ae.id && view.contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  if (it) view.innerHTML = viewDetail(it);
  else if (S.search !== null) view.innerHTML = viewSearch();
  else view.innerHTML = ({ reading: viewReading, read: viewRead, want: viewWant, stats: viewStats })[S.tab]();
  if (it && it.status === 'reading') pgPreview();
  if (keep) {
    const n = $(keep.id);
    if (n) { n.focus(); try { n.setSelectionRange(keep.s, keep.e); } catch (e) { /* type=number */ } }
  }
}
function pgPreview() {
  const out = $('pg-preview'), inp = $('pg'), it = S.detail ? find(S.detail) : null;
  if (!out || !inp || !it) return;
  const v = inp.value.trim();
  if (!/^\d+$/.test(v)) { out.textContent = 'Escribe la página en la que vas.'; return; }
  const n = parseInt(v, 10);
  if (n > it.total) { out.textContent = 'Este libro tiene ' + it.total + ' páginas.'; return; }
  out.textContent = 'Página ' + n + ' de ' + it.total + ' equivale a ' + pctOf(n, it.total) + '%.';
}

/* ================= Diálogos ================= */
const openDlg = () => { if (!dlg.open) dlg.showModal(); };
const closeDlg = () => { if (dlg.open) dlg.close(); };
dlg.addEventListener('close', () => { D = null; });
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDlg(); });

function segHTML(name, opts, val, label) {
  return '<div class="seg" role="group" aria-label="' + label + '">' + opts.map((o) =>
    '<button type="button" data-action="seg" data-seg="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (val === o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
}
function dlgShell(title, body, foot) {
  dlg.innerHTML = '<div class="dlg-head"><h2>' + title + '</h2><button class="icon-btn" data-action="close-dlg" aria-label="Cerrar">' + I.close + '</button></div><div class="dlg-body">' + body + '<p class="err" id="f-err" role="alert"></p></div><div class="dlg-foot">' + foot + '</div>';
}
function readFieldsHTML() {
  const y = curYear();
  const stars = [1, 2, 3, 4, 5].map((n) =>
    '<button type="button" class="dstar" data-action="dlg-rate" data-n="' + n + '" aria-label="Calificar con ' + n + (n === 1 ? ' estrella' : ' estrellas') + '" aria-pressed="' + (D.rating >= n) + '">' + I.star + '</button>').join('');
  let h = '<div class="f"><span class="lbl">¿Cuándo lo terminaste?</span>' + segHTML('dmode', [['day', 'Fecha exacta'], ['month', 'Mes y año'], ['year', 'Solo año']], D.dmode, '¿Cuándo lo terminaste?') + '</div>';
  if (D.dmode === 'day') {
    h += '<div class="f-row"><label class="f">Empecé el (opcional)<input id="f-start" type="date" max="' + todayStr() + '" value="' + esc(D.startDate) + '"></label>' +
      '<label class="f">Terminé el<input id="f-end" type="date" max="' + todayStr() + '" value="' + esc(D.endDate) + '"></label></div>';
  } else if (D.dmode === 'month') {
    h += '<div class="f-row"><label class="f">Año<input id="f-year" type="number" inputmode="numeric" min="1900" max="' + y + '" value="' + esc(D.year) + '"></label>' +
      '<label class="f">Mes<select id="f-month">' + MONTHS.map((m, i) => '<option value="' + (i + 1) + '"' + (String(D.month) === String(i + 1) ? ' selected' : '') + '>' + cap(m) + '</option>').join('') + '</select></label></div>';
  } else {
    h += '<label class="f">Año<input id="f-year" type="number" inputmode="numeric" min="1900" max="' + y + '" value="' + esc(D.year) + '"></label>' +
      '<p class="hint" style="margin-top:-8px">Útil para libros que leíste hace tiempo y no recuerdas el mes.</p>';
  }
  return h +
    '<div class="f"><span class="lbl">Calificación</span><div class="stars" role="group" aria-label="Calificación">' + stars + '</div></div>' +
    '<div class="f"><button type="button" class="fav-toggle" data-action="dlg-fav" aria-pressed="' + !!D.fav + '">' + I.heart + '<span>Favorito</span></button></div>' +
    '<label class="f">Tu opinión<textarea id="f-opinion" rows="4" placeholder="¿Qué te dejó este libro?">' + esc(D.opinion) + '</textarea></label>';
}
function syncDialog() {
  const map = { title: 'f-title', author: 'f-author', type: 'f-type', publisher: 'f-pub', total: 'f-total', year: 'f-year', month: 'f-month', opinion: 'f-opinion', startDate: 'f-start', endDate: 'f-end', goal: 'f-goal' };
  Object.keys(map).forEach((k) => { const e = $(map[k]); if (e) D[k] = e.value; });
}
function blankD(kind) {
  return { kind, mode: 'add', id: null, status: 'reading', title: '', author: '', type: 'Libro', publisher: '', format: 'fisico', total: '',
    startDate: '', endDate: '', dmode: 'month', year: String(curYear()), month: String(new Date().getMonth() + 1), rating: 0, fav: false, opinion: '' };
}
function renderDialog() { if (D.kind === 'item') renderItemDialog(); else if (D.kind === 'finish') renderFinishDialog(); }

function openItemDialog(mode, id) {
  D = blankD('item'); D.mode = mode;
  if (mode === 'add') {
    D.status = S.tab === 'read' ? 'read' : S.tab === 'want' ? 'want' : 'reading';
    if (D.status === 'reading') D.startDate = todayStr();
  } else {
    const it = find(id); if (!it) { D = null; return; }
    D.id = it.id; D.status = mode === 'start' ? 'reading' : it.status;
    D.title = it.title; D.author = it.author || ''; D.type = it.type || 'Libro'; D.publisher = it.publisher || '';
    D.format = it.format || 'fisico'; D.total = it.total ? String(it.total) : '';
    D.startDate = it.startDate || (mode === 'start' ? todayStr() : '');
    if (it.status === 'read') {
      D.year = String(it.year); D.month = it.month ? String(it.month) : String(new Date().getMonth() + 1);
      D.endDate = it.endDate || ''; D.dmode = it.endDate ? 'day' : it.month ? 'month' : 'year';
      D.rating = it.rating || 0; D.fav = !!it.favorite; D.opinion = it.opinion || '';
    }
  }
  renderItemDialog(); openDlg();
}
function renderItemDialog() {
  const titles = { add: 'Agregar a tu biblioteca', edit: 'Editar datos', start: 'Empezar a leer' };
  const full = D.status !== 'want';
  let b = '';
  if (D.mode === 'add') b += segHTML('status', [['reading', 'Leyendo'], ['read', 'Ya lo leí'], ['want', 'Quiero leer']], D.status, 'Dónde guardarlo');
  b += '<label class="f">Título<input id="f-title" type="text" autocomplete="off" value="' + esc(D.title) + '"></label>' +
    '<label class="f">Autor<input id="f-author" type="text" autocomplete="off" value="' + esc(D.author) + '"></label>' +
    '<label class="f">Tipo<select id="f-type">' + TYPES.map((t) => '<option' + (D.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
  if (full) {
    b += '<label class="f">Editorial<input id="f-pub" type="text" autocomplete="off" value="' + esc(D.publisher) + '"></label>' +
      '<div class="f"><span class="lbl">Formato</span>' + segHTML('format', [['fisico', 'Físico'], ['digital', 'Digital']], D.format, 'Formato') + '</div>' +
      '<label class="f">Páginas totales' + (D.status === 'read' ? ' (opcional)' : '') + '<input id="f-total" type="number" inputmode="numeric" min="1" value="' + esc(D.total) + '"></label>' +
      '<p class="hint" style="margin-top:-8px">Cuenta solo las páginas que se leen. Es el 100% con el que se calcula tu avance.</p>';
  }
  if (D.status === 'reading') b += '<label class="f">Empecé a leerlo el (opcional)<input id="f-start" type="date" max="' + todayStr() + '" value="' + esc(D.startDate) + '"></label>';
  if (D.status === 'read') b += readFieldsHTML();
  dlgShell(titles[D.mode], b, '<button class="btn ghost" data-action="close-dlg">Cancelar</button><button class="btn" data-action="save-item">' + (D.mode === 'start' ? 'Empezar' : 'Guardar') + '</button>');
}
function validYear(v) {
  const s = String(v).trim(), y = parseInt(s, 10);
  return /^\d{4}$/.test(s) && y >= 1900 && y <= curYear() ? y : null;
}
/* Lee las fechas del formulario según el modo. Devuelve {year,month,endDate,startDate} o un texto de error. */
function readDates() {
  if (D.dmode === 'day') {
    const end = parseDate(D.endDate);
    if (!end) return 'Elige la fecha en que lo terminaste.';
    if (D.endDate > todayStr()) return 'La fecha de término no puede ser futura.';
    let start = null;
    if (D.startDate) {
      if (!parseDate(D.startDate)) return 'La fecha de inicio no es válida.';
      if (D.startDate > D.endDate) return 'La fecha de inicio debe ser anterior a la de término.';
      start = D.startDate;
    }
    return { year: end.getFullYear(), month: end.getMonth() + 1, endDate: D.endDate, startDate: start };
  }
  const year = validYear(D.year);
  if (!year) return 'Escribe un año válido, por ejemplo ' + curYear() + '.';
  if (D.dmode === 'month') return { year, month: parseInt(D.month, 10), endDate: null, startDate: null };
  return { year, month: null, endDate: null, startDate: null };
}
function saveItem() {
  syncDialog();
  const title = D.title.trim();
  if (!title) return setErr('f-err', 'Escribe el título.');
  let total = 0;
  if (D.status !== 'want') {
    const tv = String(D.total).trim();
    if (tv !== '') {
      if (!/^\d+$/.test(tv) || parseInt(tv, 10) < 1) return setErr('f-err', 'Las páginas totales deben ser un número mayor que 0.');
      total = parseInt(tv, 10);
    } else if (D.status === 'reading') {
      return setErr('f-err', 'Escribe cuántas páginas tiene. Con ese número se calcula tu porcentaje.');
    }
  }
  let dates = null;
  if (D.status === 'read') { dates = readDates(); if (typeof dates === 'string') return setErr('f-err', dates); }
  if (D.status === 'reading' && D.startDate && !parseDate(D.startDate)) return setErr('f-err', 'La fecha de inicio no es válida.');
  const now = Date.now();
  let it = D.id ? find(D.id) : null;
  if (!it) it = { id: uid(), addedAt: now, entries: [], current: 0, ci: nextColor() };
  if (D.status === 'reading' && (it.current || 0) > total) return setErr('f-err', 'Tu página actual (' + it.current + ') es mayor que el total. Corrige el número de páginas.');
  const prev = it.status;
  Object.assign(it, { title, author: D.author.trim(), type: D.type, updatedAt: now, status: D.status });
  if (D.status !== 'want') Object.assign(it, { publisher: D.publisher.trim(), format: D.format, total: total || 0 });
  if (D.status === 'reading') {
    it.startDate = D.startDate || null;
    if (prev !== 'reading') it.current = it.current || 0;
  }
  if (D.status === 'read') {
    Object.assign(it, { year: dates.year, month: dates.month, endDate: dates.endDate, startDate: dates.startDate, rating: D.rating || 0, favorite: !!D.fav, opinion: D.opinion.trim() });
    it.finishedAt = it.finishedAt || now;
    it.current = total || it.current || 0;
  }
  const mode = D.mode;
  putItem(it); closeDlg();
  if (mode === 'add' || mode === 'start') { S.search = null; S.tab = it.status; S.detail = mode === 'start' ? it.id : null; render(); window.scrollTo(0, 0); }
  toast(mode === 'add' ? 'Guardado en ' + ({ reading: 'Leyendo', read: 'Leídos', want: 'Quiero leer' }[it.status]) + '.' : mode === 'start' ? 'Listo, ya está en Leyendo.' : 'Cambios guardados.');
}
function openFinishDialog(id, editing) {
  const it = find(id); if (!it) return;
  D = blankD('finish'); D.id = id; D.editing = !!editing;
  D.startDate = it.startDate || '';
  if (editing) {
    D.year = String(it.year); D.month = it.month ? String(it.month) : String(new Date().getMonth() + 1);
    D.endDate = it.endDate || ''; D.dmode = it.endDate ? 'day' : it.month ? 'month' : 'year';
    D.rating = it.rating || 0; D.fav = !!it.favorite; D.opinion = it.opinion || '';
  } else {
    D.dmode = 'day'; D.endDate = todayStr();
  }
  renderFinishDialog(); openDlg();
}
function renderFinishDialog() {
  const it = find(D.id);
  dlgShell(D.editing ? 'Fecha y opinión' : 'Libro terminado', '<p>' + esc(it ? it.title : '') + '</p>' + readFieldsHTML(),
    '<button class="btn ghost" data-action="close-dlg">Ahora no</button><button class="btn" data-action="save-finish">Guardar</button>');
}
function saveFinish() {
  syncDialog();
  const it = find(D.id); if (!it) return;
  const dates = readDates();
  if (typeof dates === 'string') return setErr('f-err', dates);
  const editing = D.editing, now = Date.now();
  Object.assign(it, { status: 'read', year: dates.year, month: dates.month, endDate: dates.endDate, startDate: dates.startDate || (D.dmode === 'day' ? null : it.startDate || null), rating: D.rating || 0, favorite: !!D.fav, opinion: D.opinion.trim(), updatedAt: now });
  if (!editing) { it.finishedAt = now; if (it.total) it.current = it.total; }
  putItem(it); closeDlg();
  toast(editing ? 'Cambios guardados.' : 'Guardado en Leídos.');
}
function openGoalDialog(year) {
  D = { kind: 'goal', year, goal: S.goals[year] ? String(S.goals[year]) : '' };
  dlgShell('Meta de lectura ' + year,
    '<p>¿Cuántos libros quieres terminar en ' + year + '?</p><label class="f">Libros<input id="f-goal" type="number" inputmode="numeric" min="1" max="1000" value="' + esc(D.goal) + '"></label>',
    (S.goals[year] ? '<button class="btn ghost" data-action="goal-clear">Quitar meta</button>' : '<button class="btn ghost" data-action="close-dlg">Cancelar</button>') + '<button class="btn" data-action="goal-save">Guardar</button>');
  openDlg();
}
function confirmBox(title, msg, yes, fn) {
  D = { kind: 'confirm', fn };
  dlg.innerHTML = '<div class="dlg-body"><h2>' + esc(title) + '</h2><p>' + esc(msg) + '</p></div><div class="dlg-foot"><button class="btn ghost" data-action="close-dlg">Cancelar</button><button class="btn danger-fill" data-action="confirm-yes">' + yes + '</button></div>';
  openDlg();
}

/* ================= Copias de seguridad ================= */
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function exportJSON() {
  S.meta.lastBackup = Date.now(); save({ noSync: true });
  download('marcapaginas-copia-' + todayStr() + '.json', JSON.stringify({ app: 'marcapaginas', version: 2, exportedAt: new Date().toISOString(), items: S.items, goals: S.goals }, null, 2), 'application/json');
  toast('Copia lista. Guarda el archivo en un lugar seguro.');
}
function exportCSV() {
  const rows = [['Título', 'Autor', 'Editorial', 'Tipo', 'Formato', 'Páginas', 'Año', 'Mes', 'Inicio', 'Término', 'Calificación', 'Favorito', 'Opinión']];
  byStatus('read').sort(readSort).forEach((it) => rows.push([it.title, it.author, it.publisher, it.type, it.format === 'digital' ? 'Digital' : it.format === 'fisico' ? 'Físico' : '', it.total || '', it.year, it.month ? cap(MONTHS[it.month - 1]) : '', it.startDate || '', it.endDate || '', it.rating || '', it.favorite ? 'Sí' : '', it.opinion]));
  const csv = '\ufeff' + rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  download('marcapaginas-leidos.csv', csv, 'text/csv;charset=utf-8');
}
function sanitize(o) {
  if (!o || typeof o !== 'object' || typeof o.title !== 'string' || !o.title.trim() || !STATUSES.includes(o.status)) return null;
  const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const str = (v, n = 500) => (typeof v === 'string' ? v.slice(0, n) : '');
  const dt = (v) => (parseDate(v) ? v : null);
  const it = {
    id: typeof o.id === 'string' && /^[\w-]{3,40}$/.test(o.id) ? o.id : uid(),
    title: o.title.trim().slice(0, 300), author: str(o.author, 200), type: TYPES.includes(o.type) ? o.type : 'Libro', status: o.status,
    addedAt: num(o.addedAt) || Date.now(), updatedAt: num(o.updatedAt) || Date.now(),
    ci: Number.isInteger(o.ci) ? o.ci : nextColor(),
    entries: (Array.isArray(o.entries) ? o.entries : []).filter((e) => e && typeof e.text === 'string' && e.text.trim()).map((e) => ({ id: typeof e.id === 'string' ? e.id : uid(), kind: e.kind === 'note' ? 'note' : 'quote', text: e.text.slice(0, 5000), page: e.page == null || e.page === '' ? null : num(e.page), createdAt: num(e.createdAt) || Date.now() }))
  };
  if (o.status !== 'want') {
    Object.assign(it, { publisher: str(o.publisher, 200), format: o.format === 'digital' ? 'digital' : 'fisico', total: num(o.total), current: num(o.current), startDate: dt(o.startDate) });
  }
  if (o.status === 'read') {
    const y = num(o.year);
    if (!y) return null;
    Object.assign(it, { year: y, month: num(o.month) >= 1 && num(o.month) <= 12 ? num(o.month) : null, endDate: dt(o.endDate), rating: Math.min(5, num(o.rating)), favorite: !!o.favorite, opinion: str(o.opinion, 5000), finishedAt: num(o.finishedAt) || it.updatedAt });
  }
  if (o.status === 'reading' && !it.total) return null;
  return it;
}
function pickFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const arr = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(arr)) throw new Error('formato');
      const items = arr.map(sanitize).filter(Boolean);
      if (!items.length) { toast('No encontré libros en ese archivo.'); return; }
      const goals = data && data.goals && typeof data.goals === 'object' ? data.goals : {};
      confirmBox('¿Importar ' + plural(items.length, 'libro', 'libros') + '?', 'Se combinarán con tu biblioteca actual. Si un libro ya existe, se reemplaza por el del archivo.', 'Importar', () => {
        items.forEach((it) => { it.updatedAt = Date.now(); delete S.deleted[it.id]; const i = S.items.findIndex((x) => x.id === it.id); if (i < 0) S.items.push(it); else S.items[i] = it; });
        Object.keys(goals).forEach((k) => { if (/^\d{4}$/.test(k) && num1(goals[k])) { S.goals[k] = num1(goals[k]); S.goalsT[k] = Date.now(); } });
        save(); render(); toast('Importación lista.');
      });
    } catch (e) { toast('No pude leer ese archivo. Usa una copia exportada desde Marcapáginas.'); }
  });
  inp.click();
}
const num1 = (v) => (Number.isFinite(+v) && +v > 0 && +v <= 1000 ? Math.floor(+v) : 0);

/* ================= Acciones ================= */
const resetDraft = () => { S.draft = { kind: 'quote', page: '', text: '', pg: null }; };
function savePage(id) {
  const it = find(id); if (!it) return;
  const v = $('pg').value.trim();
  if (!/^\d+$/.test(v)) return setErr('pg-err', 'Escribe un número de página.');
  const n = parseInt(v, 10);
  if (n > it.total) return setErr('pg-err', 'Este libro tiene ' + it.total + ' páginas. Escribe un número menor o igual.');
  it.current = n; it.updatedAt = Date.now(); S.draft.pg = null;
  putItem(it);
  if (n >= it.total) openFinishDialog(id, false); else toast('Avance guardado: ' + pct(it) + '%.');
}
function addEntry(id) {
  const it = find(id); if (!it) return;
  const text = (S.draft.text || '').trim();
  if (!text) return setErr('e-err', 'Escribe el texto antes de guardar.');
  let page = null; const pv = String(S.draft.page || '').trim();
  if (pv !== '') {
    if (!/^\d+$/.test(pv)) return setErr('e-err', 'La página debe ser un número.');
    page = parseInt(pv, 10);
    if (it.total && page > it.total) return setErr('e-err', 'Este libro tiene ' + it.total + ' páginas.');
  }
  const kind = S.draft.kind;
  it.entries = (it.entries || []).concat([{ id: uid(), kind, text, page, createdAt: Date.now() }]);
  S.draft.text = ''; S.draft.page = '';
  putItem(it); toast(kind === 'quote' ? 'Cita guardada.' : 'Nota guardada.');
}
const goTop = () => window.scrollTo(0, 0);
const actions = {
  'tab': (el) => { S.tab = el.dataset.tab; S.detail = null; S.search = null; render(); goTop(); },
  'search': () => { S.detail = null; if (S.search === null) S.search = ''; render(); const q = $('q'); if (q) q.focus(); },
  'open': (el) => { S.detail = el.dataset.id; resetDraft(); render(); goTop(); },
  'goto-want': () => { S.tab = 'want'; S.search = null; S.detail = null; render(); goTop(); },
  'back': () => { S.detail = null; render(); goTop(); },
  'add': () => openItemDialog('add'),
  'edit': (el) => openItemDialog('edit', el.dataset.id),
  'start': (el) => openItemDialog('start', el.dataset.id),
  'save-item': saveItem,
  'close-dlg': closeDlg,
  'seg': (el) => {
    syncDialog();
    const name = el.dataset.seg; D[name] = el.dataset.v;
    if (name === 'status') D.startDate = el.dataset.v === 'reading' ? (D.startDate || todayStr()) : (D.startDate === todayStr() ? '' : D.startDate);
    if (name === 'status' || name === 'dmode') { renderDialog(); return; }
    el.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  'dlg-rate': (el) => {
    const n = parseInt(el.dataset.n, 10);
    D.rating = D.rating === n ? 0 : n;
    dlg.querySelectorAll('.dstar').forEach((s, i) => s.setAttribute('aria-pressed', String(D.rating >= i + 1)));
  },
  'dlg-fav': (el) => { D.fav = !D.fav; el.setAttribute('aria-pressed', String(D.fav)); },
  'save-page': (el) => savePage(el.dataset.id),
  'finish': (el) => openFinishDialog(el.dataset.id, false),
  'edit-finish': (el) => openFinishDialog(el.dataset.id, true),
  'save-finish': saveFinish,
  'rate': (el) => {
    const it = find(el.dataset.id); if (!it) return;
    const n = parseInt(el.dataset.n, 10);
    it.rating = (it.rating || 0) === n ? 0 : n; it.updatedAt = Date.now(); putItem(it);
  },
  'toggle-fav': (el) => { const it = find(el.dataset.id); if (!it) return; it.favorite = !it.favorite; it.updatedAt = Date.now(); putItem(it); },
  'entry-type': (el) => {
    S.draft.kind = el.dataset.v;
    view.querySelectorAll('[data-action="entry-type"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    const q = S.draft.kind === 'quote';
    $('et').placeholder = q ? 'Escribe la cita tal como aparece en el libro' : 'Escribe lo que pensaste en esta página';
    $('e-btn').textContent = q ? 'Guardar cita' : 'Guardar nota';
  },
  'add-entry': (el) => addEntry(el.dataset.id),
  'del-entry': (el) => {
    const it = find(el.dataset.id); if (!it) return;
    const eid = el.dataset.eid, e = (it.entries || []).find((x) => x.id === eid);
    confirmBox(e && e.kind === 'note' ? '¿Eliminar esta nota?' : '¿Eliminar esta cita?', 'Esta acción no se puede deshacer.', 'Eliminar', () => {
      it.entries = it.entries.filter((x) => x.id !== eid); putItem(it); toast('Eliminado.');
    });
  },
  'delete': (el) => {
    const it = find(el.dataset.id); if (!it) return;
    confirmBox('¿Eliminar «' + it.title + '»?', 'Se borrarán también sus citas, notas y opinión. Esta acción no se puede deshacer.', 'Eliminar', () => { removeItem(it.id); toast('Eliminado.'); });
  },
  'confirm-yes': () => { const fn = D && D.fn; closeDlg(); if (fn) fn(); },
  'fav-only': () => { S.favOnly = !S.favOnly; render(); },
  'goal': (el) => openGoalDialog(parseInt(el.dataset.year, 10)),
  'goal-save': () => {
    syncDialog();
    const v = String(D.goal).trim();
    if (!/^\d+$/.test(v) || !num1(v)) return setErr('f-err', 'Escribe un número de libros entre 1 y 1000.');
    S.goals[D.year] = num1(v); S.goalsT[D.year] = Date.now(); save(); closeDlg(); render(); toast('Meta guardada.');
  },
  'goal-clear': () => { delete S.goals[D.year]; S.goalsT[D.year] = Date.now(); save(); closeDlg(); render(); toast('Meta eliminada.'); },
  'login': openLoginDialog,
  'do-login': doLogin,
  'sync-now': () => syncNow(true),
  'logout': () => confirmBox('¿Cerrar sesión?', 'Tus libros seguirán en este dispositivo, pero dejarán de sincronizarse hasta que vuelvas a iniciar sesión.', 'Cerrar sesión', () => { storeAuth(null); S.sync = { state: 'idle', msg: '' }; render(); toast('Sesión cerrada.'); }),
  'export-json': exportJSON,
  'export-csv': exportCSV,
  'import': pickFile,
  'install': async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) { /* cancelado */ }
    deferredInstall = null; render();
  }
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.search = t.value; $('results').innerHTML = resultsHTML(); return; }
  if (t.dataset && t.dataset.draft) { S.draft[t.dataset.draft] = t.value; if (t.id === 'pg') pgPreview(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'stats-year') { S.statsYear = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10); render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'search') return;
  if (e.target.id === 'pg') { e.preventDefault(); savePage(S.detail); }
  else if (D && dlg.contains(e.target)) {
    e.preventDefault();
    if (D.kind === 'item') saveItem(); else if (D.kind === 'finish') saveFinish(); else if (D.kind === 'goal') actions['goal-save'](); else if (D.kind === 'login') doLogin();
  }
});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (S.tab === 'stats' && !S.detail && S.search === null) render(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Marcapáginas quedó instalada.'); if (S.tab === 'stats') render(); });

/* ================= Arranque ================= */
load();
auth = SYNC_ON ? loadAuth() : null;
render();
if (auth) syncNow(false);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && auth && Date.now() - lastSyncTry > 20000) syncNow(false); });
window.addEventListener('online', () => { if (auth) syncNow(false); });
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
})();
