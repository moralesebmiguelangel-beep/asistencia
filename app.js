/* Asistencia — aplicación de control de asistencia sin conexión.
 * Todo se guarda en este dispositivo (IndexedDB) y se sincroniza con una
 * Hoja de Google privada del docente mediante Google Apps Script.
 */
'use strict';

const APP_VERSION = '1.2.0';
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIA_LETRA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESTADO_TXT = { A: 'Asistencia', F: 'Falta', '': 'Sin registrar' };

/* Días de clase precargados del horario 2026-2027 (Tecnología). Editables en Configuración. */
const DIAS_PRECARGADOS = { '1A': [1, 2, 3], '1B': [1, 2, 3], '2A': [1, 3, 5], '2B': [1, 3, 4], '3A': [1, 2, 4], '3B': [2, 4, 5] };
/* Días sin clase del calendario escolar SEP 2026-2027 (días hábiles). Editables en Configuración. */
function calendarioPrecargado() {
  const l = [];
  const add = (f, m) => l.push({ f, m });
  const rango = (a, b, m) => { for (let f = a; f <= b; f = sumarDias(f, 1)) { const d = aFecha(f).getDay(); if (d > 0 && d < 6) add(f, m); } };
  add('2026-09-16', 'Suspensión de labores'); add('2026-09-25', 'Consejo Técnico Escolar');
  add('2026-10-30', 'Consejo Técnico Escolar'); add('2026-11-02', 'Suspensión de labores');
  add('2026-11-16', 'Suspensión de labores'); add('2026-11-27', 'Consejo Técnico Escolar');
  rango('2026-12-21', '2026-12-31', 'Vacaciones'); add('2027-01-01', 'Suspensión de labores');
  rango('2027-01-04', '2027-01-05', 'Vacaciones'); add('2027-01-06', 'Suspensión de labores');
  add('2027-01-29', 'Consejo Técnico Escolar'); add('2027-02-01', 'Suspensión de labores');
  add('2027-02-26', 'Consejo Técnico Escolar'); add('2027-03-15', 'Suspensión de labores');
  rango('2027-03-22', '2027-04-02', 'Vacaciones'); add('2027-04-30', 'Consejo Técnico Escolar');
  add('2027-05-05', 'Suspensión de labores'); add('2027-05-28', 'Consejo Técnico Escolar');
  add('2027-06-25', 'Consejo Técnico Escolar');
  for (const x of l) if (x.f === '2026-12-25') x.m = 'Suspensión de labores';
  return l;
}

/* ---------------- Utilidades ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function aFecha(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function sumarDias(s, n) { const d = aFecha(s); d.setDate(d.getDate() + n); return ymd(d); }
function hoy() { return ymd(new Date()); }
function fmtF(s) { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
function fmtLargo(s) { const d = aFecha(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`; }
function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]/g, ''); }
function normNombre(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function claveNombre(s) { return normNombre(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'; }
function aleatorio(n = 8) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, n); }
function nuevaVer() { return Date.now().toString(36) + '-' + (S.meta.deviceId || 'x') + '-' + aleatorio(4); }
function horaDeVer(v) { const t = parseInt(String(v || '').split('-')[0], 36); return isFinite(t) && t > 0 ? new Date(t) : null; }
function fmtHora(d) { return d ? d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function csvCelda(v) { v = String(v == null ? '' : v); return /[",;\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function aCSV(filas) { return '﻿' + filas.map(f => f.map(csvCelda).join(',')).join('\r\n'); }

/* ---------------- Estado en memoria ---------------- */
const S = {
  db: null,
  items: new Map(),      // k -> {k,t,id,d,del,ver,sv}
  outbox: new Set(),     // claves con cambios pendientes de sincronizar
  conflicts: new Map(),  // k -> {k, local:{d,del,ver}, remote:{d,del,ver}}
  meta: {},
  fechaLista: hoy(),
  busqueda: '',
  deshacer: null,
  sincronizando: false,
  errorSync: '',
  pendienteRender: false,
  vistaActual: '',
  importacion: null,
};

/* ---------------- IndexedDB ---------------- */
function abrirDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('asistencia-db', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('items', { keyPath: 'k' });
      d.createObjectStore('outbox', { keyPath: 'k' });
      d.createObjectStore('conflicts', { keyPath: 'k' });
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function leerTodo(store) {
  return new Promise((res, rej) => { const r = S.db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function transaccion(stores, fn) {
  return new Promise((res, rej) => {
    const t = S.db.transaction(stores, 'readwrite');
    fn(t);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transacción cancelada'));
  });
}
async function cargar() {
  S.db = await abrirDB();
  const [items, outbox, conflicts, meta] = await Promise.all(['items', 'outbox', 'conflicts', 'meta'].map(leerTodo));
  items.forEach(i => S.items.set(i.k, i));
  outbox.forEach(o => S.outbox.add(o.k));
  conflicts.forEach(c => S.conflicts.set(c.k, c));
  meta.forEach(m => { S.meta[m.k] = m.v; });
  if (!S.meta.deviceId) await setMeta('deviceId', aleatorio(6));
  if (!S.items.has('c:general')) {
    await guardar([{ t: 'c', id: 'general', d: { escuela: 'Escuela Secundaria Técnica No. 202 “Gustavo Baz Prada”', docente: '', asignatura: 'Tecnología', inicio: '2026-08-31', fin: '2027-07-09', sinClase: calendarioPrecargado() } }]);
  }
}
async function setMeta(k, v) {
  S.meta[k] = v;
  await transaccion(['meta'], t => t.objectStore('meta').put({ k, v }));
}

/* Guarda cambios (lista de {t,id,d,del}) de inmediato y los marca como pendientes. */
async function guardar(cambios) {
  const nuevos = cambios.map(c => {
    const k = c.t + ':' + c.id;
    const ant = S.items.get(k);
    return { k, t: c.t, id: c.id, d: c.d, del: !!c.del, ver: nuevaVer(), sv: ant ? ant.sv || '' : '' };
  });
  nuevos.forEach(n => { S.items.set(n.k, n); S.outbox.add(n.k); });
  try {
    await transaccion(['items', 'outbox'], t => {
      const si = t.objectStore('items'), so = t.objectStore('outbox');
      nuevos.forEach(n => { si.put(n); so.put({ k: n.k }); });
    });
  } catch (e) {
    alert('No se pudo guardar en este dispositivo: ' + (e && e.message || e) + '\nRevisa el espacio disponible.');
    throw e;
  }
  pedirPersistencia();
  programarSync();
  pintarEstado();
}

let persistenciaPedida = false;
function pedirPersistencia() {
  if (persistenciaPedida || !navigator.storage || !navigator.storage.persist) return;
  persistenciaPedida = true;
  navigator.storage.persist().catch(() => {});
}

/* ---------------- Modelo ---------------- */
function vivos(t) { const r = []; for (const it of S.items.values()) if (it.t === t && !it.del) r.push(it); return r; }
function config() { const c = S.items.get('c:general'); return c ? c.d : { sinClase: [] }; }
function grupos() { return vivos('g').map(i => i.d).sort((a, b) => (a.orden || 0) - (b.orden || 0) || String(a.id).localeCompare(b.id)); }
function grupo(id) { const it = S.items.get('g:' + id); return it && !it.del ? it.d : null; }
function alumnosDe(g) { return vivos('s').map(i => i.d).filter(s => s.g === g); }
function alumno(id) { const it = S.items.get('s:' + id); return it && !it.del ? it.d : null; }
function nombreCompleto(s) { return [s.ap, s.am, s.n].filter(Boolean).join(' ').trim() || s.nc || '(sin nombre)'; }
function ordenar(lista, modo) {
  const l = lista.slice();
  if (modo === 'az') l.sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es', { sensitivity: 'base' }));
  else l.sort((a, b) => (a.o || 0) - (b.o || 0) || nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
  return l;
}
function activoEn(s, f) { return !(s.bajas || []).some(b => b.desde <= f && (!b.hasta || f < b.hasta)); }
function bajaVigente(s) { return (s.bajas || []).find(b => !b.hasta) || null; }
function bajaEn(s, f) { return (s.bajas || []).find(b => b.desde <= f && (!b.hasta || f < b.hasta)) || null; }
function estado(sid, f) { const it = S.items.get('r:' + sid + '|' + f); return it && !it.del ? (it.d.e || '') : ''; }
function sinClaseSet() { return new Map((config().sinClase || []).map(x => [x.f, x.m])); }
function esDiaDeClase(g, f, sc = sinClaseSet()) {
  const gr = grupo(g); if (!gr) return false;
  const c = config();
  if (c.inicio && f < c.inicio) return false;
  if (c.fin && f > c.fin) return false;
  return (gr.dias || []).includes(aFecha(f).getDay()) && !sc.has(f);
}
function cambiarEstado(s, f, e) { return { t: 'r', id: s.id + '|' + f, d: { s: s.id, g: s.g, f, e } }; }

/* ---------------- Interfaz general ---------------- */
function toast(msg, opc = {}) {
  const cont = $('#toasts');
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<span>${h(msg)}</span>` + (opc.accion ? `<button type="button">${h(opc.accion)}</button>` : '');
  cont.appendChild(el);
  while (cont.children.length > 3) cont.firstChild.remove();
  const cerrar = () => el.remove();
  if (opc.accion) el.querySelector('button').onclick = () => { cerrar(); opc.alPulsar && opc.alPulsar(); };
  setTimeout(cerrar, opc.ms || 4500);
  return cerrar;
}
function dialogo({ titulo, html, ok = 'Aceptar', cancelar = 'Cancelar', peligro = false, alAbrir }) {
  return new Promise(res => {
    const d = $('#dlg');
    $('#dlg-titulo').textContent = titulo;
    $('#dlg-cuerpo').innerHTML = html || '';
    $('#dlg-ok').textContent = ok;
    $('#dlg-ok').className = 'btn ' + (peligro ? 'danger' : 'primary');
    $('#dlg-cancelar').textContent = cancelar;
    $('#dlg-cancelar').hidden = cancelar === null;
    d.returnValue = '';
    d.onclose = () => res(d.returnValue === 'ok' ? ($('#dlg-cuerpo')) : null);
    d.showModal();
    alAbrir && alAbrir($('#dlg-cuerpo'));
  });
}
async function confirmar(titulo, texto, ok = 'Sí, continuar', peligro = true) {
  return !!(await dialogo({ titulo, html: `<p>${h(texto)}</p>`, ok, peligro }));
}

function infoEstado() {
  const p = S.outbox.size, c = S.conflicts.size;
  if (c) return { cls: 'warn', txt: `Conflictos (${c})`, href: '#/conflictos' };
  if (!navigator.onLine) return { cls: 'off', txt: p ? `Sin conexión · ${p} pendientes` : 'Sin conexión', href: '#/config' };
  if (!syncConfigurado()) return { cls: 'local', txt: 'Solo en este dispositivo', href: '#/config' };
  if (S.sincronizando) return { cls: 'busy', txt: 'Sincronizando…', href: '#/config' };
  if (p) return { cls: 'pend', txt: `Cambios pendientes (${p})`, href: '#/config' };
  if (S.errorSync) return { cls: 'warn', txt: 'Error al sincronizar', href: '#/config' };
  return { cls: 'ok', txt: 'Sincronizado', href: '#/config' };
}
function pintarEstado() {
  const i = infoEstado(), el = $('#estado');
  el.className = 'pill ' + i.cls; el.textContent = i.txt; el.href = i.href;
}

/* ---------------- Enrutador ---------------- */
function ruta() { const p = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent); return { vista: p[0] || '', args: p.slice(1) }; }
let rutaPrevia = null;
function alCambiarRuta() {
  const r = ruta();
  // Advertencia discreta al salir de un grupo con alumnos pendientes
  if (rutaPrevia && rutaPrevia.vista === 'lista' && rutaPrevia.args[0] && !(['lista', 'trabajos', 'trabajo'].includes(r.vista) && r.args[0] === rutaPrevia.args[0])) {
    const g = rutaPrevia.args[0], f = S.fechaLista;
    const pend = alumnosDe(g).filter(s => activoEn(s, f) && !estado(s.id, f)).length;
    const gr = grupo(g);
    if (gr && pend > 0) toast(`${gr.nombre}: quedaron ${pend} sin registrar.`, { accion: 'Volver', alPulsar: () => { location.hash = '#/lista/' + encodeURIComponent(g); }, ms: 6000 });
  }
  rutaPrevia = r;
  render();
}
function render() {
  const r = ruta();
  S.vistaActual = r.vista;
  $$('nav.bottom a').forEach(a => a.classList.toggle('activo', (a.dataset.nav === (r.vista || 'grupos')) || (a.dataset.nav === 'config' && ['importar', 'grupo', 'conflictos'].includes(r.vista)) || (a.dataset.nav === 'lista' && ['trabajos', 'trabajo'].includes(r.vista))));
  const v = $('#vista');
  v.onclick = null;
  try {
    switch (r.vista) {
      case '': case 'grupos': vistaGrupos(v); break;
      case 'lista': vistaLista(v, r.args[0]); break;
      case 'reporte': vistaReporte(v); break;
      case 'config': vistaConfig(v); break;
      case 'importar': vistaImportar(v); break;
      case 'grupo': vistaGrupo(v, r.args[0]); break;
      case 'trabajos': vistaTrabajos(v, r.args[0]); break;
      case 'trabajo': vistaTrabajo(v, r.args[0], r.args[1]); break;
      case 'conflictos': vistaConflictos(v); break;
      case 'horario': vistaHorario(v); break;
      default: vistaGrupos(v);
    }
  } catch (e) { console.error(e); v.innerHTML = `<div class="error">Ocurrió un error al mostrar esta pantalla: ${h(e.message)}</div>`; }
  pintarEstado();
}

/* ---------------- Vista: Grupos ---------------- */
function vistaGrupos(v) {
  $('#titulo').textContent = 'Asistencia';
  const gs = grupos();
  if (!gs.length) {
    v.innerHTML = `<div class="card"><h2>Bienvenido</h2>
      <p>Aún no hay grupos en este dispositivo.</p>
      <p><a class="btn primary" href="#/importar">Importar mi archivo «reporte»</a></p>
      <p class="tenue">¿Ya los importaste en otro dispositivo? Ve a <a href="#/config">Configuración → Sincronización</a> y vincula este dispositivo para descargarlos.</p></div>`;
    return;
  }
  const f = hoy(), sc = sinClaseSet();
  v.innerHTML = `<p class="tenue" style="margin-top:0">${h(fmtLargo(f))}</p><div class="grupos">` + gs.map(g => {
    const act = alumnosDe(g.id).filter(s => activoEn(s, f));
    const reg = act.filter(s => estado(s.id, f)).length;
    const clase = esDiaDeClase(g.id, f, sc);
    const linea = reg === act.length && act.length ? `<small class="hecho">✓ Lista de hoy completa</small>` : `<small>Hoy: ${reg} de ${act.length} registrados</small>`;
    return `<a class="grupo-btn" href="#/lista/${encodeURIComponent(g.id)}"><strong>${h(g.nombre)}</strong>${linea}<small>${act.length} alumnos activos${clase ? '' : ' · hoy sin clase'}</small></a>`;
  }).join('') + '</div>';
}

/* ---------------- Vista: Pasar lista ---------------- */
function vistaLista(v, gid) {
  if (!gid) {
    const ult = S.meta.ultimoGrupo;
    if (ult && grupo(ult)) { location.replace('#/lista/' + encodeURIComponent(ult)); return; }
    $('#titulo').textContent = 'Pasar lista';
    v.innerHTML = '<p>Elige un grupo:</p>';
    const d = document.createElement('div'); v.appendChild(d); vistaGrupos(d); return;
  }
  const g = grupo(gid);
  if (!g) { v.innerHTML = '<div class="error">Ese grupo no existe.</div>'; return; }
  if (S.meta.ultimoGrupo !== gid) setMeta('ultimoGrupo', gid);
  $('#titulo').textContent = 'Pasar lista · ' + g.nombre;
  const f = S.fechaLista;
  const clase = esDiaDeClase(gid, f);
  const motivo = sinClaseSet().get(f);
  const modo = S.meta.orden || 'reporte';
  const inactivos = alumnosDe(gid).filter(s => !activoEn(s, f)).length;
  v.innerHTML = `${tabsGrupo(gid, 'l')}
  <div class="cab-lista">
    <h2>${h(g.nombre)}</h2>
    <div class="fecha-sel">
      <button class="btn" data-acc="dia-ant" aria-label="Día de clase anterior">◀</button>
      <input type="date" id="fecha" value="${f}" aria-label="Fecha de la lista">
      <button class="btn" data-acc="dia-sig" aria-label="Día de clase siguiente">▶</button>
    </div>
  </div>
  <div class="tenue">${h(fmtLargo(f))}${f === hoy() ? ' (hoy)' : ''}${clase ? '' : ` · <b>${motivo ? h(motivo) : 'No es día de clase de este grupo'}</b>; puedes registrar igualmente.`}</div>
  <div class="contadores" id="contadores"></div>
  <div class="herr">
    <input type="search" id="buscar" placeholder="Buscar alumno…" value="${h(S.busqueda)}" aria-label="Buscar por nombre">
    <button class="btn" data-acc="orden">${modo === 'az' ? 'Orden: A–Z' : 'Orden: reporte'}</button>
    <button class="btn todos" data-acc="todos">Marcar asistencia a todos los pendientes</button>
  </div>
  <ul class="alumnos" id="alumnos"></ul>
  <p class="tenue">${inactivos ? `${inactivos} alumno(s) con «Ya no viene» no aparecen en esta fecha. ` : ''}<a href="#/grupo/${encodeURIComponent(gid)}">Ver alumnos inactivos y administrar grupo</a></p>`;
  pintarAlumnos(gid);
  $('#fecha').onchange = e => { if (e.target.value) { S.fechaLista = e.target.value; S.deshacer = null; render(); } };
  $('#buscar').oninput = e => { S.busqueda = e.target.value; pintarAlumnos(gid); };
  v.onclick = async ev => {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    const acc = b.dataset.acc;
    if (acc === 'dia-ant' || acc === 'dia-sig') { S.fechaLista = diaDeClaseVecino(gid, S.fechaLista, acc === 'dia-sig' ? 1 : -1); render(); }
    else if (acc === 'orden') { await setMeta('orden', modo === 'az' ? 'reporte' : 'az'); render(); }
    else if (acc === 'todos') marcarTodos(gid);
    else if (acc === 'A' || acc === 'F') marcar(gid, b.dataset.s, acc);
    else if (acc === 'B') darDeBaja(b.dataset.s);
  };
}
function diaDeClaseVecino(gid, f, dir) {
  const g = grupo(gid); const sc = sinClaseSet();
  if (!g || !(g.dias || []).length) return sumarDias(f, dir);
  let x = f;
  for (let i = 0; i < 60; i++) { x = sumarDias(x, dir); if (esDiaDeClase(gid, x, sc)) return x; }
  return sumarDias(f, dir);
}
function alumnosDeLista(gid, f) {
  return ordenar(alumnosDe(gid).filter(s => activoEn(s, f)), S.meta.orden || 'reporte');
}
function filaAlumno(s, i, f) {
  const e = estado(s.id, f);
  const cls = e || 'N';
  return `<li class="alumno st-${cls}" id="al-${h(s.id)}">
    <div class="nom"><span><span class="num">${i}.</span><b>${h(nombreCompleto(s))}</b></span><span class="estado-txt ${cls}">${e === 'A' ? '✓ ' : e === 'F' ? '✗ ' : ''}${ESTADO_TXT[e]}</span></div>
    <div class="botones">
      <button class="b-est A" data-acc="A" data-s="${h(s.id)}" aria-pressed="${e === 'A'}">${e === 'A' ? '✓ ' : ''}Asistencia</button>
      <button class="b-est F" data-acc="F" data-s="${h(s.id)}" aria-pressed="${e === 'F'}">${e === 'F' ? '✗ ' : ''}Falta</button>
      <button class="b-est B" data-acc="B" data-s="${h(s.id)}">Ya no viene</button>
    </div></li>`;
}
function pintarAlumnos(gid) {
  const f = S.fechaLista, q = claveNombre(S.busqueda);
  const lista = alumnosDeLista(gid, f);
  const ul = $('#alumnos'); if (!ul) return;
  const html = lista.map((s, i) => q && !claveNombre(nombreCompleto(s)).includes(q) ? '' : filaAlumno(s, i + 1, f)).join('');
  ul.innerHTML = html || `<li class="tenue">${lista.length ? 'Ningún alumno coincide con la búsqueda.' : 'No hay alumnos activos en esta fecha.'}</li>`;
  pintarContadores(gid);
}
function pintarContadores(gid) {
  const f = S.fechaLista, lista = alumnosDeLista(gid, f);
  let a = 0, fa = 0; lista.forEach(s => { const e = estado(s.id, f); if (e === 'A') a++; else if (e === 'F') fa++; });
  const c = $('#contadores'); if (!c) return;
  c.innerHTML = `<div class="contador a"><b>${a}</b>Asistencias</div><div class="contador f"><b>${fa}</b>Faltas</div><div class="contador p"><b>${lista.length - a - fa}</b>Sin registrar</div>`;
}
async function marcar(gid, sid, e) {
  const s = alumno(sid); if (!s) return;
  const f = S.fechaLista;
  const actual = estado(sid, f);
  const nuevo = actual === e ? '' : e;   // tocar de nuevo el mismo botón lo regresa a «Sin registrar»
  await guardar([cambiarEstado(s, f, nuevo)]);
  const li = document.getElementById('al-' + sid);
  if (li) { const n = li.querySelector('.num').textContent.replace('.', ''); li.outerHTML = filaAlumno(s, n, f); }
  pintarContadores(gid);
}
async function marcarTodos(gid) {
  const f = S.fechaLista;
  const pend = alumnosDeLista(gid, f).filter(s => !estado(s.id, f));
  if (!pend.length) { toast('No hay alumnos pendientes.'); return; }
  await guardar(pend.map(s => cambiarEstado(s, f, 'A')));
  const ids = pend.map(s => s.id);
  pintarAlumnos(gid);
  toast(`Se marcó asistencia a ${ids.length} alumno(s).`, {
    accion: 'Deshacer', ms: 10000, alPulsar: async () => {
      const cambios = ids.map(id => alumno(id)).filter(s => s && estado(s.id, f) === 'A').map(s => cambiarEstado(s, f, ''));
      await guardar(cambios); render(); toast('Se deshizo «Marcar asistencia a todos».');
    }
  });
}
async function darDeBaja(sid) {
  const s = alumno(sid); if (!s) return;
  const f = S.fechaLista;
  const r = await dialogo({
    titulo: 'Ya no viene', ok: 'Confirmar baja',
    html: `<p><b>${h(nombreCompleto(s))}</b> dejará de aparecer en las listas a partir de la fecha indicada.</p>
      <label class="campo"><span>No aparece a partir de:</span><input type="date" name="desde" value="${f}" required></label>
      <p class="tenue">Su historial anterior se conserva. Los días posteriores no se cuentan como faltas. Podrás reactivarlo desde la administración del grupo.</p>`
  });
  if (!r) return;
  const desde = r.querySelector('[name=desde]').value || f;
  await guardar([{ t: 's', id: s.id, d: { ...s, bajas: [...(s.bajas || []).filter(b => b.hasta), { desde }] } }]);
  toast(`${nombreCompleto(s)}: baja desde ${fmtF(desde)}.`, {
    accion: 'Deshacer', ms: 8000, alPulsar: async () => { const a = alumno(sid); await guardar([{ t: 's', id: sid, d: { ...a, bajas: (a.bajas || []).filter(b => b.hasta) } }]); render(); }
  });
  render();
}

/* ---------------- Vista: administración de un grupo ---------------- */
function vistaGrupo(v, gid) {
  const g = grupo(gid);
  if (!g) { v.innerHTML = '<div class="error">Ese grupo no existe.</div>'; return; }
  $('#titulo').textContent = 'Grupo ' + g.nombre;
  const todos = ordenar(alumnosDe(gid), S.meta.orden || 'reporte');
  const act = todos.filter(s => !bajaVigente(s)), inact = todos.filter(s => bajaVigente(s));
  v.innerHTML = `
  <p><a href="#/lista/${encodeURIComponent(gid)}">← Volver a pasar lista</a></p>
  <div class="card"><h2>Alumnos inactivos («Ya no viene»)</h2>
    ${inact.length ? `<ul class="lista-simple">${inact.map(s => `<li><span><b>${h(nombreCompleto(s))}</b><br><span class="tenue">No viene desde ${fmtF(bajaVigente(s).desde)}</span></span>
      <button class="btn small" data-acc="reactivar" data-s="${h(s.id)}">Reactivar</button></li>`).join('')}</ul>` : '<p class="tenue">No hay alumnos inactivos.</p>'}
  </div>
  <div class="card"><h2>Días de clase de ${h(g.nombre)}</h2>
    <div class="dias">${[1, 2, 3, 4, 5, 6].map(d => `<label><input type="checkbox" name="dia" value="${d}" ${(g.dias || []).includes(d) ? 'checked' : ''}>${DIAS[d].slice(0, 3)}</label>`).join('')}</div>
    <p class="tenue">Solo estos días (sin contar los días sin clase del calendario) aparecen como columnas en el concentrado.</p>
  </div>
  <div class="card"><h2>Alumnos activos (${act.length})</h2>
    <ul class="lista-simple">${act.map(s => `<li><span>${h(nombreCompleto(s))}<br><span class="tenue">ID: ${h(s.id)}</span></span>
      <button class="btn small danger" data-acc="borrar-al" data-s="${h(s.id)}">Eliminar</button></li>`).join('')}</ul>
    <h3>Agregar alumno</h3>
    <div class="fila"><input type="text" id="nuevo-nombre" placeholder="APELLIDOS NOMBRE(S)" style="flex:1;min-width:220px"><button class="btn" data-acc="agregar">Agregar</button></div>
    <p class="tenue">Úsalo para altas a mitad de ciclo. Para cargas masivas usa «Importar».</p>
  </div>
  <div class="card"><h2>Borrar registros de un día</h2>
    <div class="fila"><input type="date" id="dia-borrar" value="${S.fechaLista}" style="width:auto"><button class="btn danger" data-acc="borrar-dia">Borrar la lista de ese día</button></div>
  </div>
  <div class="card"><h2>Eliminar grupo</h2>
    <p class="tenue">Borra el grupo, sus alumnos y todas sus asistencias. Crea un respaldo antes.</p>
    <button class="btn danger" data-acc="borrar-grupo">Eliminar ${h(g.nombre)}</button>
  </div>`;
  $$('input[name=dia]', v).forEach(c => c.onchange = async () => {
    const dias = $$('input[name=dia]:checked', v).map(x => Number(x.value));
    await guardar([{ t: 'g', id: gid, d: { ...grupo(gid), dias } }]); toast('Días de clase guardados.');
  });
  v.onclick = async ev => {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    const acc = b.dataset.acc, s = b.dataset.s ? alumno(b.dataset.s) : null;
    if (acc === 'reactivar' && s) {
      const r = await dialogo({ titulo: 'Reactivar alumno', ok: 'Reactivar', html: `<p><b>${h(nombreCompleto(s))}</b> volverá a aparecer en las listas a partir de:</p><label class="campo"><span>Fecha de regreso</span><input type="date" name="f" value="${hoy()}"></label>` });
      if (!r) return;
      const f = r.querySelector('[name=f]').value || hoy();
      const bajas = (s.bajas || []).map(x => x.hasta ? x : { ...x, hasta: f < x.desde ? x.desde : f });
      await guardar([{ t: 's', id: s.id, d: { ...s, bajas } }]); toast('Alumno reactivado.'); render();
    } else if (acc === 'borrar-al' && s) {
      if (!await confirmar('Eliminar alumno', `Se eliminará a ${nombreCompleto(s)} y todos sus registros de asistencia. Si solo dejó de asistir, usa «Ya no viene». ¿Eliminar?`, 'Eliminar')) return;
      const cambios = [{ t: 's', id: s.id, d: s, del: true }];
      vivos('r').filter(r => r.d.s === s.id).forEach(r => cambios.push({ t: 'r', id: r.id, d: r.d, del: true }));
      vivos('w').filter(w => w.d.s === s.id).forEach(w => cambios.push({ t: 'w', id: w.id, d: w.d, del: true }));
      await guardar(cambios); toast('Alumno eliminado.'); render();
    } else if (acc === 'agregar') {
      const nom = $('#nuevo-nombre').value.trim(); if (!nom) return;
      const id = 'm-' + aleatorio(8);
      const maxo = Math.max(0, ...alumnosDe(gid).map(x => x.o || 0));
      await guardar([{ t: 's', id, d: { id, g: gid, ap: '', am: '', n: '', nc: normNombre(nom), o: maxo + 1, bajas: [] } }]);
      toast('Alumno agregado.'); render();
    } else if (acc === 'borrar-dia') {
      const f = $('#dia-borrar').value; if (!f) return;
      const regs = vivos('r').filter(r => r.d.g === gid && r.d.f === f && r.d.e);
      if (!regs.length) { toast('No hay registros ese día.'); return; }
      if (!await confirmar('Borrar registros', `Se borrarán ${regs.length} registro(s) de ${g.nombre} del ${fmtF(f)}. Los alumnos quedarán «Sin registrar». ¿Continuar?`, 'Borrar')) return;
      await guardar(regs.map(r => ({ t: 'r', id: r.id, d: { ...r.d, e: '' } }))); toast('Registros borrados.');
    } else if (acc === 'borrar-grupo') {
      if (!await confirmar('Eliminar grupo', `Se eliminará ${g.nombre}, sus ${alumnosDe(gid).length} alumnos y todos sus registros. Esta acción no se puede deshacer salvo con un respaldo. ¿Eliminar?`, 'Eliminar grupo')) return;
      const cambios = [{ t: 'g', id: gid, d: g, del: true }];
      alumnosDe(gid).forEach(s => cambios.push({ t: 's', id: s.id, d: s, del: true }));
      vivos('r').filter(r => r.d.g === gid).forEach(r => cambios.push({ t: 'r', id: r.id, d: r.d, del: true }));
      vivos('a').filter(a => a.d.g === gid).forEach(a => cambios.push({ t: 'a', id: a.id, d: a.d, del: true }));
      vivos('w').filter(w => w.d.g === gid).forEach(w => cambios.push({ t: 'w', id: w.id, d: w.d, del: true }));
      await guardar(cambios); toast('Grupo eliminado.'); location.hash = '#/';
    }
  };
}

/* ---------------- Lectura de archivos .xlsx y .csv (sin bibliotecas externas) ---------------- */
async function leerZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido. Si es .xls antiguo, ábrelo en Excel y guárdalo como .xlsx o .csv.');
  const n = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
  const archivos = {}; const td = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(off + 10, true), tam = dv.getUint32(off + 20, true);
    const ln = dv.getUint16(off + 28, true), lx = dv.getUint16(off + 30, true), lc = dv.getUint16(off + 32, true), loc = dv.getUint32(off + 42, true);
    archivos[td.decode(u8.subarray(off + 46, off + 46 + ln))] = { metodo, tam, loc };
    off += 46 + ln + lx + lc;
  }
  return async nombre => {
    const f = archivos[nombre.replace(/^\//, '')]; if (!f) return null;
    const ln = dv.getUint16(f.loc + 26, true), lx = dv.getUint16(f.loc + 28, true);
    const datos = u8.subarray(f.loc + 30 + ln + lx, f.loc + 30 + ln + lx + f.tam);
    let out;
    if (f.metodo === 0) out = datos;
    else if (f.metodo === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador es muy antiguo para leer .xlsx. Actualízalo o usa un archivo .csv.');
      const st = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out = new Uint8Array(await new Response(st).arrayBuffer());
    } else throw new Error('Compresión no soportada en el .xlsx');
    return td.decode(out);
  };
}
function xml(txt) { return new DOMParser().parseFromString(txt, 'application/xml'); }
function porNombre(nodo, n) { return Array.from(nodo.getElementsByTagNameNS('*', n)); }
function colIndice(ref) { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }
async function leerXlsx(buf) {
  const leer = await leerZip(buf);
  const wb = await leer('xl/workbook.xml'); if (!wb) throw new Error('No se encontró el libro dentro del .xlsx');
  const rels = xml(await leer('xl/_rels/workbook.xml.rels') || '<r/>');
  const destino = {}; porNombre(rels, 'Relationship').forEach(r => { destino[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const ssTxt = await leer('xl/sharedStrings.xml');
  const compartidas = ssTxt ? porNombre(xml(ssTxt), 'si').map(si => porNombre(si, 't').filter(t => !t.parentNode || t.parentNode.localName !== 'rPh').map(t => t.textContent).join('')) : [];
  const hojas = [];
  for (const sh of porNombre(xml(wb), 'sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let t = destino[rid] || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const sx = await leer(t); if (!sx) continue;
    const filas = [];
    porNombre(xml(sx), 'row').forEach(row => {
      const ri = Number(row.getAttribute('r')) - 1;
      const fila = [];
      porNombre(row, 'c').forEach((c, j) => {
        const ref = c.getAttribute('r'); const ci = ref ? colIndice(ref) : j;
        const tipo = c.getAttribute('t'); const v = porNombre(c, 'v')[0];
        let val = '';
        if (tipo === 's') val = compartidas[Number(v && v.textContent)] || '';
        else if (tipo === 'inlineStr') val = porNombre(c, 't').map(x => x.textContent).join('');
        else val = v ? v.textContent : '';
        fila[ci] = String(val).trim();
      });
      filas[ri >= 0 ? ri : filas.length] = fila;
    });
    hojas.push({ nombre: sh.getAttribute('name') || 'Hoja', filas: Array.from(filas, f => Array.from(f || [], x => x || '')) });
  }
  return hojas;
}
function leerCSV(txt, nombre) {
  txt = txt.replace(/^﻿/, '');
  const primera = txt.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : (primera.includes('\t') ? '\t' : ',');
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true;
    else if (c === sep) { fila.push(campo.trim()); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; fila.push(campo.trim()); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  return [{ nombre: nombre.replace(/\.[^.]+$/, ''), filas }];
}

/* ---------------- Importación ---------------- */
const CAMPOS = [
  ['id', 'Identificador del alumno (opcional)', ['id', 'idalumno', 'matricula', 'clave', 'folio', 'numerodecontrol', 'nocontrol', 'numcontrol']],
  ['ap', 'Apellido paterno', ['apellidopaterno', 'primerapellido', 'paterno']],
  ['am', 'Apellido materno', ['apellidomaterno', 'segundoapellido', 'materno']],
  ['n', 'Nombre(s)', ['nombres', 'nombre']],
  ['nc', 'Nombre completo (si viene en una sola columna)', ['nombrecompleto', 'alumno', 'nombredelalumno', 'nombrealumno', 'alumnoa']],
  ['grado', 'Grado', ['grado']],
  ['grupo', 'Grupo', ['grupo']],
];
function detectarEncabezado(filas) {
  const claves = new Set(CAMPOS.flatMap(c => c[2]));
  let mejor = 0, pts = -1;
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const p = (filas[i] || []).filter(x => claves.has(norm(x))).length;
    if (p > pts) { pts = p; mejor = i; }
  }
  return mejor;
}
function mapeoAutomatico(enc) {
  const m = {};
  CAMPOS.forEach(([campo, , cands]) => {
    for (const cand of cands) { const i = enc.findIndex(x => norm(x) === cand); if (i >= 0) { m[campo] = i; break; } }
  });
  if (m.nc != null && m.n != null && m.ap != null) delete m.nc;
  m.fuenteGrupo = (m.grado != null || m.grupo != null) ? 'cols' : 'hoja';
  return m;
}
function grupoDesde(texto) {
  const t = String(texto || '').toUpperCase();
  const num = (t.match(/\d+/) || [''])[0];
  const letras = t.replace(/[^A-ZÑ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const letra = letras.length ? letras[letras.length - 1] : '';
  if (num && letra && letra.length <= 2) return { id: num + letra, nombre: `${num}° ${letra}`, grado: num, letra };
  const limpio = String(texto || '').replace(/[^\p{L}\p{N} °-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return limpio ? { id: norm(limpio).toUpperCase() || limpio, nombre: limpio } : null;
}
function prepararImportacion(hojas, m, incluirDupsExistentes) {
  const filas = [], errores = [];
  const vistos = new Map();
  hojas.forEach(hoja => {
    const ie = hoja.enc;
    hoja.filas.slice(ie + 1).forEach((f, idx) => {
      if (!f || !f.some(x => x)) return;
      const val = k => m[k] != null && m[k] !== '' ? String(f[m[k]] || '').trim() : '';
      let ap = val('ap'), am = val('am'), n = val('n'), nc = val('nc');
      if (!ap && !am && !n && !nc) return;
      let g;
      if (m.fuenteGrupo === 'hoja') g = grupoDesde(hoja.nombre);
      else if (m.grado != null && m.grupo != null) g = grupoDesde(val('grado') + ' ' + val('grupo'));
      else g = grupoDesde(val('grupo') || val('grado'));
      if (!g) { errores.push(`Hoja «${hoja.nombre}», fila ${ie + idx + 2}: no se pudo determinar el grupo.`); return; }
      const nombre = normNombre([ap, am, n].filter(Boolean).join(' ') || nc);
      const id = val('id').replace(/\s+/g, '') || null;
      filas.push({ hoja: hoja.nombre, filaNum: ie + idx + 2, orden: idx + 1, g, ap: normNombre(ap), am: normNombre(am), n: normNombre(n), nc: (ap || am || n) ? '' : normNombre(nc), nombre, id });
    });
  });
  // Detección de duplicados y coincidencias con alumnos existentes
  const existentes = vivos('s').map(i => i.d);
  const porNombreExist = new Map(existentes.map(s => [s.g + '|' + claveNombre(nombreCompleto(s)), s]));
  const nombresArchivo = new Map();
  filas.forEach(r => {
    if (r.id) {
      if (vistos.has(r.id)) { r.accion = 'omitir'; r.nota = `ID repetido en el archivo (ya aparece en hoja «${vistos.get(r.id).hoja}», fila ${vistos.get(r.id).filaNum})`; return; }
      vistos.set(r.id, r);
    }
    const kn = r.g.id + '|' + claveNombre(r.nombre);
    if (nombresArchivo.has(kn)) r.aviso = 'Mismo nombre que otro alumno del archivo en este grupo (posible duplicado)';
    nombresArchivo.set(kn, r);
    let ex = r.id ? alumno(r.id) : null;
    if (!ex && !r.id) ex = porNombreExist.get(kn) || null;
    if (ex) { r.accion = 'actualizar'; r.sid = ex.id; r.nota = 'Ya existe: se actualiza nombre, grupo y orden; sus asistencias se conservan'; return; }
    const mismo = porNombreExist.get(kn);
    if (mismo) {
      r.aviso = `Ya hay un alumno con el mismo nombre en ${r.g.nombre} con otro identificador (posible duplicado)`;
      if (!incluirDupsExistentes) { r.accion = 'omitir'; r.nota = 'Omitido por posible duplicado'; return; }
    }
    r.accion = 'nuevo'; r.sid = r.id || ('n-' + aleatorio(10));
  });
  return { filas, errores };
}
async function aplicarImportacion(prep) {
  const cambios = [];
  const gruposArchivo = new Map();
  prep.filas.forEach(r => { if (r.accion !== 'omitir' && !gruposArchivo.has(r.g.id)) gruposArchivo.set(r.g.id, r.g); });
  let orden = grupos().length;
  const ordenados = [...gruposArchivo.values()].sort((a, b) => String(a.id).localeCompare(String(b.id), 'es', { numeric: true }));
  ordenados.forEach(g => {
    if (!grupo(g.id)) cambios.push({ t: 'g', id: g.id, d: { id: g.id, nombre: g.nombre, orden: ++orden, dias: DIAS_PRECARGADOS[g.id] ? DIAS_PRECARGADOS[g.id].slice() : [] } });
  });
  prep.filas.forEach(r => {
    if (r.accion === 'omitir') return;
    const prev = alumno(r.sid);
    cambios.push({ t: 's', id: r.sid, d: { id: r.sid, g: r.g.id, ap: r.ap, am: r.am, n: r.n, nc: r.nc, o: r.orden, bajas: prev ? prev.bajas || [] : [] } });
  });
  await guardar(cambios);
  return cambios;
}
function vistaImportar(v) {
  $('#titulo').textContent = 'Importar alumnos';
  const st = S.importacion;
  if (!st) {
    v.innerHTML = `<div class="card"><h2>Importar desde tu archivo «reporte»</h2>
      <p>Selecciona el archivo (.xlsx o .csv). Se leerá <b>solo en este dispositivo</b>: no se sube a ningún lado.</p>
      <p>De todas las columnas, la aplicación solo guarda el identificador, los nombres y el grupo. Los demás datos (CURP, domicilio, teléfonos, tutores) se ignoran.</p>
      <input type="file" id="archivo" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv">
      <p class="tenue">Importar de nuevo no borra alumnos ni asistencias anteriores: actualiza a los que ya existen y agrega a los nuevos.</p></div>`;
    $('#archivo').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const esCSV = /\.(csv|txt)$/i.test(file.name);
        const hojas = esCSV ? leerCSV(new TextDecoder().decode(buf), file.name) : await leerXlsx(buf);
        const utiles = hojas.filter(hj => hj.filas.some(f => f && f.some(x => x)));
        if (!utiles.length) throw new Error('El archivo no tiene datos.');
        utiles.forEach(hj => { hj.enc = detectarEncabezado(hj.filas); });
        const enc = utiles[0].filas[utiles[0].enc] || [];
        S.importacion = { archivo: file.name, hojas: utiles, enc, m: mapeoAutomatico(enc), incluirDups: false };
        render();
      } catch (err) { console.error(err); toast('No se pudo leer el archivo: ' + err.message, { ms: 8000 }); }
    };
    return;
  }
  const { hojas, enc, m } = st;
  const difieren = hojas.filter(hj => (hj.filas[hj.enc] || []).map(norm).join('|') !== enc.map(norm).join('|'));
  const opciones = sel => `<option value="">— ninguna —</option>` + enc.map((x, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${h(x || ('Columna ' + (i + 1)))}</option>`).join('');
  const faltaNombre = m.nc == null && m.n == null && m.ap == null;
  const prep = faltaNombre ? { filas: [], errores: [] } : prepararImportacion(hojas, m, st.incluirDups);
  st.prep = prep;
  const porGrupo = new Map();
  prep.filas.forEach(r => { if (!porGrupo.has(r.g.id)) porGrupo.set(r.g.id, { g: r.g, filas: [] }); porGrupo.get(r.g.id).filas.push(r); });
  const cuenta = (l, a) => l.filter(r => r.accion === a).length;
  const avisos = prep.filas.filter(r => r.aviso || r.accion === 'omitir');
  v.innerHTML = `
  <div class="card"><h2>1. Columnas del archivo</h2>
    <p class="tenue">Archivo: <b>${h(st.archivo)}</b> · ${hojas.length} hoja(s): ${hojas.map(x => h(x.nombre.replace(/[^\p{L}\p{N} ]/gu, '°'))).join(', ')}</p>
    ${difieren.length ? `<div class="aviso">Algunas hojas tienen encabezados distintos a la primera: ${difieren.map(x => h(x.nombre)).join(', ')}. Revisa la vista previa.</div>` : ''}
    ${CAMPOS.filter(c => c[0] !== 'grado' && c[0] !== 'grupo').map(([c, et]) => `<label class="campo"><span>${h(et)}</span><select data-campo="${c}">${opciones(m[c])}</select></label>`).join('')}
    <label class="campo"><span>¿De dónde sale el grupo?</span><select data-campo="fuenteGrupo">
      <option value="cols" ${m.fuenteGrupo === 'cols' ? 'selected' : ''}>De las columnas Grado y Grupo</option>
      <option value="hoja" ${m.fuenteGrupo === 'hoja' ? 'selected' : ''}>Del nombre de cada hoja</option></select></label>
    ${m.fuenteGrupo === 'cols' ? CAMPOS.filter(c => c[0] === 'grado' || c[0] === 'grupo').map(([c, et]) => `<label class="campo"><span>${h(et)}</span><select data-campo="${c}">${opciones(m[c])}</select></label>`).join('') : ''}
  </div>
  <div class="card"><h2>2. Vista previa</h2>
    ${faltaNombre ? '<div class="error">Selecciona al menos la columna del nombre.</div>' : ''}
    ${prep.errores.length ? `<div class="error">${prep.errores.slice(0, 10).map(h).join('<br>')}${prep.errores.length > 10 ? `<br>…y ${prep.errores.length - 10} más` : ''}</div>` : ''}
    <div class="scroll"><table class="t"><thead><tr><th>Grupo</th><th>Alumnos</th><th>Nuevos</th><th>Ya existentes</th><th>Omitidos</th></tr></thead><tbody>
    ${[...porGrupo.values()].map(x => `<tr><td><b>${h(x.g.nombre)}</b>${grupo(x.g.id) ? '' : ' <span class="tenue">(grupo nuevo)</span>'}</td><td>${x.filas.length}</td><td>${cuenta(x.filas, 'nuevo')}</td><td>${cuenta(x.filas, 'actualizar')}</td><td>${cuenta(x.filas, 'omitir')}</td></tr>`).join('')}
    </tbody></table></div>
    ${avisos.length ? `<div class="aviso"><b>Posibles duplicados u omisiones (${avisos.length}):</b><br>${avisos.slice(0, 30).map(r => `${h(r.g.nombre)} · ${h(r.nombre)}: ${h(r.nota && r.accion === 'omitir' ? r.nota : r.aviso)}`).join('<br>')}</div>
      <label class="fila"><input type="checkbox" id="incluir-dups" ${st.incluirDups ? 'checked' : ''}> Importar también los que coinciden por nombre con alumnos ya registrados</label>` : ''}
    ${[...porGrupo.values()].map(x => `<details><summary>${h(x.g.nombre)} — ver ${x.filas.length} alumnos en el orden del reporte</summary>
      <ol>${x.filas.map(r => `<li>${h(r.nombre)}${r.id ? ` <span class="tenue">(ID ${h(r.id)})</span>` : ''}${r.accion === 'omitir' ? ' <b>— omitido</b>' : r.accion === 'actualizar' ? ' <span class="tenue">— ya existe</span>' : ''}</li>`).join('')}</ol></details>`).join('')}
  </div>
  <div class="fila"><button class="btn primary" id="confirmar-imp" ${!prep.filas.length || faltaNombre ? 'disabled' : ''}>Confirmar importación</button><button class="btn" id="cancelar-imp">Cancelar</button></div>`;
  $$('select[data-campo]', v).forEach(s => s.onchange = () => {
    const c = s.dataset.campo; if (c === 'fuenteGrupo') m[c] = s.value; else m[c] = s.value === '' ? null : Number(s.value);
    render();
  });
  const cb = $('#incluir-dups'); if (cb) cb.onchange = () => { st.incluirDups = cb.checked; render(); };
  $('#cancelar-imp').onclick = () => { S.importacion = null; render(); };
  $('#confirmar-imp').onclick = async () => {
    const n = prep.filas.filter(r => r.accion !== 'omitir').length;
    const c = await aplicarImportacion(prep);
    S.importacion = null;
    toast(`Importación lista: ${n} alumnos procesados (${c.filter(x => x.t === 'g').length} grupos nuevos).`, { ms: 6000 });
    location.hash = '#/';
  };
}

/* ---------------- Trabajos y avances por actividad ---------------- */
const TRAB_TXT = { T: 'Terminó', A: 'Avance', N: 'No hizo nada', '': 'Sin registrar' };
const TRAB_MARCA = { T: 'T', A: 'AV', N: 'N' };
function actividad(id) { const it = S.items.get('a:' + id); return it && !it.del ? it.d : null; }
function actividadesDe(g) {
  return vivos('a').map(i => i.d).filter(a => a.g === g)
    .sort((x, y) => (y.entrega || '').localeCompare(x.entrega || '') || (y.creada || '').localeCompare(x.creada || ''));
}
function trabajo(aid, sid) { const it = S.items.get('w:' + aid + '|' + sid); return it && !it.del ? it.d : null; }
function estTrab(aid, sid) { const w = trabajo(aid, sid); return w ? w.e || '' : ''; }
function fechaRefActividad(a) { const f = hoy(); return a.entrega && a.entrega < f ? a.entrega : f; }
function alumnosDeActividad(a) {
  const ref = fechaRefActividad(a);
  return ordenar(alumnosDe(a.g).filter(s => activoEn(s, ref) || estTrab(a.id, s.id)), S.meta.orden || 'reporte');
}
function contarTrab(a, lista) {
  const c = { T: 0, A: 0, N: 0, p: 0 };
  lista.forEach(s => { const e = estTrab(a.id, s.id); if (e) c[e]++; else c.p++; });
  return c;
}
function tabsGrupo(gid, activo) {
  const g = encodeURIComponent(gid);
  return `<div class="tabs" role="tablist"><a role="tab" href="#/lista/${g}" class="${activo === 'l' ? 'activo' : ''}" aria-selected="${activo === 'l'}">✓ Asistencia</a><a role="tab" href="#/trabajos/${g}" class="${activo === 't' ? 'activo' : ''}" aria-selected="${activo === 't'}">📝 Trabajos</a></div>`;
}
async function dialogoActividad(gid, a) {
  const r = await dialogo({
    titulo: a ? 'Editar actividad' : 'Nueva actividad', ok: a ? 'Guardar' : 'Crear',
    html: `<label class="campo"><span>Nombre de la actividad</span><input type="text" name="nombre" maxlength="120" required value="${h(a ? a.nombre : '')}" placeholder="Ej. Práctica 3 de Word"></label>
      <label class="campo"><span>Fecha de entrega</span><input type="date" name="entrega" required value="${h(a ? a.entrega : hoy())}"></label>`
  });
  if (!r) return null;
  const nombre = r.querySelector('[name=nombre]').value.trim();
  const entrega = r.querySelector('[name=entrega]').value;
  if (!nombre || !entrega) { toast('Escribe el nombre y la fecha de entrega.'); return null; }
  const id = a ? a.id : 'a' + aleatorio(8);
  const d = { ...(a || {}), id, g: gid, m: a ? (a.m || 'TEC') : 'TEC', nombre, entrega, creada: a ? a.creada : hoy() };
  await guardar([{ t: 'a', id, d }]);
  return d;
}
function vistaTrabajos(v, gid) {
  const g = grupo(gid);
  if (!g) { v.innerHTML = '<div class="error">Ese grupo no existe.</div>'; return; }
  if (S.meta.ultimoGrupo !== gid) setMeta('ultimoGrupo', gid);
  $('#titulo').textContent = 'Trabajos · ' + g.nombre;
  const acts = actividadesDe(gid), f = hoy();
  v.innerHTML = `${tabsGrupo(gid, 't')}
  <div class="cab-lista"><h2>${h(g.nombre)}</h2><button class="btn primary" data-acc="nueva">+ Nueva actividad</button></div>
  ${acts.length ? `<ul class="lista-act">${acts.map(a => {
    const c = contarTrab(a, alumnosDeActividad(a));
    const venc = a.entrega < f;
    return `<li><a class="act" href="#/trabajo/${encodeURIComponent(gid)}/${encodeURIComponent(a.id)}">
      <b>${h(a.nombre)}</b>
      <span class="tenue">Entrega: ${h(fmtLargo(a.entrega))}${a.entrega === f ? ' (hoy)' : venc ? ' · vencida' : ''}</span>
      <span class="mini"><span class="m-T">✓ ${c.T} terminaron</span><span class="m-A">◐ ${c.A} avance</span><span class="m-N">✗ ${c.N} nada</span><span class="m-p">${c.p} sin registrar</span></span></a></li>`;
  }).join('')}</ul>` : `<div class="card"><p>Aún no hay actividades en ${h(g.nombre)}.</p><p class="tenue">Crea una con «+ Nueva actividad», ponle su fecha de entrega y marca quién terminó, quién avanzó y quién no hizo nada.</p></div>`}`;
  v.onclick = async ev => {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    if (b.dataset.acc === 'nueva') {
      const a = await dialogoActividad(gid);
      if (a) location.hash = `#/trabajo/${encodeURIComponent(gid)}/${encodeURIComponent(a.id)}`;
    }
  };
}
function vistaTrabajo(v, gid, aid) {
  const g = grupo(gid), a = actividad(aid);
  if (!g || !a) { v.innerHTML = `<div class="error">Esa actividad no existe o fue eliminada.</div><p><a href="#/trabajos/${encodeURIComponent(gid || '')}">← Volver a las actividades</a></p>`; return; }
  $('#titulo').textContent = 'Trabajos · ' + g.nombre;
  const modo = S.meta.orden || 'reporte';
  const venc = a.entrega < hoy();
  v.innerHTML = `${tabsGrupo(gid, 't')}
  <p style="margin:.2rem 0 .5rem"><a href="#/trabajos/${encodeURIComponent(gid)}">← Todas las actividades de ${h(g.nombre)}</a></p>
  <div class="card"><h2 style="margin-bottom:.2rem">${h(a.nombre)}</h2>
    <p style="margin:.2rem 0 .6rem">Entrega: <b>${h(fmtLargo(a.entrega))}</b>${venc ? ' · <b>fecha vencida</b>' : ''}</p>
    <div class="fila"><button class="btn small" data-acc="editar">Editar nombre o fecha</button><button class="btn small danger" data-acc="borrar">Eliminar actividad</button></div></div>
  <div class="contadores c4" id="contadores"></div>
  <div class="herr">
    <input type="search" id="buscar" placeholder="Buscar alumno…" value="${h(S.busqueda)}" aria-label="Buscar por nombre">
    <button class="btn" data-acc="orden">${modo === 'az' ? 'Orden: A–Z' : 'Orden: reporte'}</button>
  </div>
  <ul class="alumnos" id="alumnos"></ul>
  <p class="tenue">Toca de nuevo el mismo botón para regresar a «Sin registrar». Si marcas «Terminó» después de la fecha de entrega, se anota como entrega tardía.</p>`;
  pintarTrabajos(a);
  $('#buscar').oninput = e => { S.busqueda = e.target.value; pintarTrabajos(a); };
  v.onclick = async ev => {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    const acc = b.dataset.acc;
    if (acc === 'wT' || acc === 'wA' || acc === 'wN') marcarTrab(aid, b.dataset.s, acc.slice(1));
    else if (acc === 'orden') { await setMeta('orden', modo === 'az' ? 'reporte' : 'az'); render(); }
    else if (acc === 'editar') { if (await dialogoActividad(gid, actividad(aid))) render(); }
    else if (acc === 'borrar') {
      const ws = vivos('w').filter(w => w.d.a === aid);
      if (!await confirmar('Eliminar actividad', `Se eliminará «${a.nombre}» y sus ${ws.filter(w => w.d.e).length} registro(s) de trabajo. ¿Eliminar?`, 'Eliminar')) return;
      await guardar([{ t: 'a', id: aid, d: a, del: true }, ...ws.map(w => ({ t: 'w', id: w.id, d: w.d, del: true }))]);
      toast('Actividad eliminada.'); location.hash = '#/trabajos/' + encodeURIComponent(gid);
    }
  };
}
function filaTrab(s, i, a) {
  const w = trabajo(a.id, s.id), e = w ? w.e || '' : '';
  const tarde = e === 'T' && w.f && w.f > a.entrega;
  const cls = e ? 'w' + e : 'N0';
  const btn = (k, txt) => `<button class="b-est w${k}" data-acc="w${k}" data-s="${h(s.id)}" aria-pressed="${e === k}">${e === k ? '● ' : ''}${txt}</button>`;
  return `<li class="alumno st-${cls}" id="al-${h(s.id)}">
    <div class="nom"><span><span class="num">${i}.</span><b>${h(nombreCompleto(s))}</b></span><span class="estado-txt ${e ? 'w' + e : 'N'}">${TRAB_TXT[e]}${e && w.f ? ' · ' + fmtF(w.f).slice(0, 5) : ''}${tarde ? ' · tarde' : ''}</span></div>
    <div class="botones">${btn('T', 'Terminó')}${btn('A', 'Avance')}${btn('N', 'Nada')}</div></li>`;
}
function pintarTrabajos(a) {
  const q = claveNombre(S.busqueda), lista = alumnosDeActividad(a);
  const ul = $('#alumnos'); if (!ul) return;
  ul.innerHTML = lista.map((s, i) => q && !claveNombre(nombreCompleto(s)).includes(q) ? '' : filaTrab(s, i + 1, a)).join('')
    || `<li class="tenue">${lista.length ? 'Ningún alumno coincide con la búsqueda.' : 'No hay alumnos activos.'}</li>`;
  pintarContTrab(a);
}
function pintarContTrab(a) {
  const c = contarTrab(a, alumnosDeActividad(a)), el = $('#contadores'); if (!el) return;
  el.innerHTML = `<div class="contador a"><b>${c.T}</b>Terminó</div><div class="contador av"><b>${c.A}</b>Avance</div><div class="contador f"><b>${c.N}</b>No hizo nada</div><div class="contador p"><b>${c.p}</b>Sin registrar</div>`;
}
async function marcarTrab(aid, sid, e) {
  const a = actividad(aid), s = alumno(sid); if (!a || !s) return;
  const nuevo = estTrab(aid, sid) === e ? '' : e;
  await guardar([{ t: 'w', id: aid + '|' + sid, d: { a: aid, s: sid, g: a.g, e: nuevo, f: hoy() } }]);
  const li = document.getElementById('al-' + sid);
  if (li) { const n = li.querySelector('.num').textContent.replace('.', ''); li.outerHTML = filaTrab(s, n, a); }
  pintarContTrab(a);
}
function datosTrabajos(gid, anio, mes) {
  const g = grupo(gid);
  const pref = `${anio}-${String(mes + 1).padStart(2, '0')}-`;
  const acts = actividadesDe(gid).filter(a => (a.entrega || '').startsWith(pref)).sort((x, y) => x.entrega.localeCompare(y.entrega) || x.nombre.localeCompare(y.nombre));
  const ini = ymd(new Date(anio, mes, 1));
  const alumnos = ordenar(alumnosDe(gid), S.meta.orden || 'reporte').filter(s => {
    const b = bajaVigente(s);
    return !(b && b.desde < ini && !acts.some(a => estTrab(a.id, s.id)));
  });
  const filas = alumnos.map(s => {
    const t = { T: 0, A: 0, N: 0 };
    const celdas = acts.map(a => {
      const w = trabajo(a.id, s.id), e = w ? w.e || '' : '';
      if (e) { t[e]++; const tarde = e === 'T' && w.f && w.f > a.entrega; return { m: TRAB_MARCA[e] + (tarde ? '*' : ''), c: 'w' + e }; }
      if (bajaEn(s, a.entrega)) return { m: 'B', c: 'b' };
      return { m: '–', c: 'sr' };
    });
    return { s, celdas, t, baja: bajaVigente(s) };
  });
  return { g, acts, filas, omitidos: alumnosDe(gid).length - alumnos.length, periodo: `${MESES[mes]} ${anio}` };
}
function htmlTrabajos(dat) {
  const c = config();
  const { g, acts, filas, periodo } = dat;
  const n = acts.length;
  return `<section class="rep-pagina rep">
    <div class="rep-cab"><div>${c.escuela ? `<p>${h(c.escuela)}</p>` : ''}<h3>Concentrado de trabajos · ${h(g.nombre)}</h3></div><p><b>Entregas de:</b> ${h(periodo)}</p></div>
    <table class="rep-t"><thead><tr><th colspan="${n + 5}" class="tcab">${h(g.nombre)} · trabajos · ${h(periodo)}</th></tr>
      <tr><th>No.</th><th style="text-align:left">Alumno</th>${acts.map((a, i) => `<th class="dia" title="${h(a.nombre)}">${i + 1}</th>`).join('')}<th>Termin.</th><th>Avance</th><th>Nada</th></tr></thead>
    <tbody>${filas.length ? filas.map((r, i) => `<tr><td>${i + 1}</td><td class="n">${h(nombreCompleto(r.s))}${r.baja ? `<small>Ya no viene desde ${fmtF(r.baja.desde)}</small>` : ''}</td>${r.celdas.map(x => `<td class="${x.c || ''}">${x.m}</td>`).join('')}<td class="tot">${r.t.T}/${n}</td><td class="tot">${r.t.A}</td><td class="tot">${r.t.N}</td></tr>`).join('') : `<tr><td colspan="${n + 5}">Sin alumnos</td></tr>`}</tbody></table>
    ${n ? `<p class="rep-ley"><b>Actividades:</b> ${acts.map((a, i) => `<b>${i + 1}</b> = ${h(a.nombre)} (entrega ${fmtF(a.entrega)})`).join(' · ')}</p>` : '<p class="rep-ley"><b>No hay actividades con fecha de entrega en este mes.</b></p>'}
    <p class="rep-ley">T = terminó · T* = terminó después de la fecha de entrega · AV = avance · N = no hizo nada · – = sin registrar · B = ya no viene.${dat.omitidos ? ` No se listan ${dat.omitidos} alumno(s) dados de baja antes de este periodo.` : ''}</p>
    <div class="rep-firma"><div>Nombre del docente${c.docente ? `: <b>${h(c.docente)}</b>` : ''}</div><div>Firma</div></div>
  </section>`;
}

/* ---------------- Horario ---------------- */
const MATERIAS = { TEC: 'Tecnología', ART: 'Artes', TUT: 'Tutoría' };
const ROMANO = { 1: 'I', 2: 'II', 3: 'III' };
function horarioPrecargado() {
  const mod = [['1', '07:30', '08:20'], ['2', '08:20', '09:10'], ['3', '09:10', '10:00'], ['4', '10:00', '10:50'], ['R', '10:50', '11:10'], ['5', '11:10', '12:00'], ['6', '12:00', '12:50'], ['7', '12:50', '13:40']]
    .map(([n, ini, fin]) => ({ n, ini, fin }));
  const c = {};
  const p = (d, n, m, g) => { c[d + '-' + n] = { m, g }; };
  p(1, 1, 'TEC', '1B'); p(1, 2, 'TEC', '1A'); p(1, 3, 'TEC', '2A'); p(1, 4, 'TEC', '3A'); p(1, 5, 'ART', '3B'); p(1, 6, 'TEC', '2B'); p(1, 7, 'ART', '3A');
  p(2, 1, 'TEC', '3A'); p(2, 2, 'TEC', '1A'); p(2, 3, 'TEC', '3B'); p(2, 4, 'TEC', '1B');
  p(3, 1, 'TEC', '2A'); p(3, 2, 'TEC', '1A'); p(3, 3, 'ART', '3B'); p(3, 4, 'TEC', '2B'); p(3, 5, 'TEC', '1B'); p(3, 6, 'ART', '3B'); p(3, 7, 'TUT', '3B');
  p(4, 4, 'TEC', '3A'); p(4, 5, 'TEC', '3B'); p(4, 6, 'ART', '3A'); p(4, 7, 'TEC', '2B');
  p(5, 5, 'TEC', '3B'); p(5, 6, 'TEC', '2A'); p(5, 7, 'ART', '3A');
  return { modulos: mod, clases: c };
}
function horario() { const it = S.items.get('c:horario'); return it && !it.del ? it.d : horarioPrecargado(); }
function nombreGrupoH(g) { const gr = grupo(g); if (gr) return gr.nombre; const x = grupoDesde(g); return x ? x.nombre : g; }
function nombreMateria(m, g) { const gr = (String(g).match(/\d/) || [''])[0]; if (m === 'TUT') return 'Tutoría'; return (MATERIAS[m] || m) + (ROMANO[gr] ? ' ' + ROMANO[gr] : ''); }
const aMin = t => { const [a, b] = String(t).split(':').map(Number); return a * 60 + b; };
function tarjetaAhora(hz, ahora) {
  const d = ahora.getDay(), m = ahora.getHours() * 60 + ahora.getMinutes();
  const clase = n => hz.clases[d + '-' + n];
  const txt = (c, n) => `${h(nombreMateria(c.m, c.g))} · ${h(nombreGrupoH(c.g))}`;
  if (d < 1 || d > 5) return `<div class="h-et">Hoy</div><div class="h-cl">Sin clases</div><div class="h-hr">Es fin de semana.</div>`;
  const motivo = sinClaseSet().get(ymd(ahora));
  let html = motivo ? `<div class="aviso" style="margin:0 0 .5rem">Hoy: <b>${h(motivo)}</b> (según tu calendario escolar).</div>` : '';
  const mods = hz.modulos;
  const act = mods.find(x => m >= aMin(x.ini) && m < aMin(x.fin));
  const cAct = act && act.n !== 'R' ? clase(act.n) : null;
  const prox = mods.filter(x => x.n !== 'R' && aMin(x.ini) > m && clase(x.n))[0];
  if (cAct) html += `<div class="h-et">Ahora · ${act.n}° módulo</div><div class="h-cl">${txt(cAct)}</div><div class="h-hr">${act.ini} – ${act.fin} · termina en ${aMin(act.fin) - m} min</div>`;
  else if (act && act.n === 'R') html += `<div class="h-et">Ahora</div><div class="h-cl">Receso</div><div class="h-hr">${act.ini} – ${act.fin}</div>`;
  else if (m < aMin(mods[0].ini)) html += `<div class="h-et">Hoy</div><div class="h-cl">Aún no empiezan las clases</div>`;
  else if (m >= aMin(mods[mods.length - 1].fin)) html += `<div class="h-et">Hoy</div><div class="h-cl">Terminaron tus clases</div>`;
  else html += `<div class="h-et">Ahora</div><div class="h-cl">Hora libre</div>${act ? `<div class="h-hr">${act.n}° módulo · ${act.ini} – ${act.fin}</div>` : ''}`;
  if (prox) html += `<div class="h-sig"><b>Siguiente:</b> ${txt(clase(prox.n))} a las ${prox.ini} (${prox.n}° módulo)</div>`;
  else if (m < aMin(mods[mods.length - 1].fin)) html += `<div class="h-sig">No tienes más clases hoy.</div>`;
  if (cAct && cAct.m === 'TEC' && grupo(cAct.g)) html += `<a class="btn primary" style="margin-top:.6rem;display:inline-flex;align-items:center" href="#/lista/${encodeURIComponent(cAct.g)}">Pasar lista de ${h(nombreGrupoH(cAct.g))}</a>`;
  return html;
}
function vistaHorario(v) {
  $('#titulo').textContent = 'Mi horario';
  const hz = horario(), ahora = new Date(), d = ahora.getDay(), m = ahora.getHours() * 60 + ahora.getMinutes();
  if (!S.diaHorario) S.diaHorario = d >= 1 && d <= 5 ? d : 1;
  const ds = S.diaHorario, editar = !!S.editarHorario;
  v.innerHTML = `
  <section class="h-ahora" id="h-ahora" aria-live="polite">${tarjetaAhora(hz, ahora)}</section>
  <div class="h-dias" role="tablist">${[1, 2, 3, 4, 5].map(x => `<button role="tab" data-d="${x}" class="${x === ds ? 'sel' : ''} ${x === d ? 'hoy' : ''}" aria-selected="${x === ds}">${DIAS[x].slice(0, 3)}</button>`).join('')}</div>
  ${editar ? '<div class="aviso">Modo modificar: toca un módulo para cambiar la clase. Los cambios se guardan y se sincronizan con tus otros dispositivos.</div>' : ''}
  <ol class="h-lista">${hz.modulos.map(mod => {
    if (mod.n === 'R') return `<li class="h-receso"><span class="h-t">${mod.ini}</span><span>Receso</span></li>`;
    const c = hz.clases[ds + '-' + mod.n];
    const est = ds === d ? (m >= aMin(mod.ini) && m < aMin(mod.fin) ? ' actual' : m >= aMin(mod.fin) ? ' pasada' : '') : '';
    const t = `<span class="h-t"><b>${mod.n}° mód.</b>${mod.ini}–${mod.fin}</span>`;
    const lleva = !editar && c && c.m === 'TEC' && grupo(c.g);
    const tag = editar ? 'button' : lleva ? 'a' : 'div';
    const attr = editar ? `type="button" data-mod="${mod.n}"` : lleva ? `href="#/lista/${encodeURIComponent(c.g)}"` : '';
    const cont = c ? `<span class="h-c">${h(nombreGrupoH(c.g))}<small>${h(nombreMateria(c.m, c.g))}${lleva ? ' · tocar para pasar lista ›' : ''}</small></span>` : `<span class="h-c libre">Libre</span>`;
    return `<li class="${c ? 'h-' + c.m : 'h-libre'}${est}"><${tag} class="h-fila" ${attr}>${t}${cont}</${tag}></li>`;
  }).join('')}</ol>
  <div class="h-ley"><span class="h-TEC">Tecnología</span><span class="h-ART">Artes</span><span class="h-TUT">Tutoría</span></div>
  <div class="fila" style="margin-top:.9rem">
    <button class="btn ${editar ? 'primary' : ''}" data-acc="editar">${editar ? '✓ Terminar de modificar' : '✏️ Modificar horario'}</button>
    ${editar ? '<button class="btn danger" data-acc="restaurar">Restaurar horario original</button>' : ''}
  </div>
  <p class="tenue">Por ahora solo Tecnología tiene lista de asistencia en la app; Artes y Tutoría se muestran para consulta.</p>`;
  v.onclick = async ev => {
    const dia = ev.target.closest('[data-d]');
    if (dia) { S.diaHorario = Number(dia.dataset.d); render(); return; }
    const b = ev.target.closest('[data-acc],[data-mod]'); if (!b) return;
    if (b.dataset.acc === 'editar') { S.editarHorario = !editar; render(); }
    else if (b.dataset.acc === 'restaurar') {
      if (!await confirmar('Restaurar horario', 'Se reemplazará tu horario por el original de 2026-2027. ¿Continuar?', 'Restaurar')) return;
      await guardar([{ t: 'c', id: 'horario', d: horarioPrecargado() }]); toast('Horario restaurado.'); render();
    } else if (b.dataset.mod) editarModulo(ds, b.dataset.mod);
  };
}
async function editarModulo(dia, n) {
  const hz = horario(), k = dia + '-' + n, c = hz.clases[k] || null, mod = hz.modulos.find(x => x.n === n);
  const gs = grupos(); const ids = gs.length ? gs.map(g => g.id) : ['1A', '1B', '2A', '2B', '3A', '3B'];
  const r = await dialogo({
    titulo: `${DIAS[dia]} · ${n}° módulo (${mod.ini}–${mod.fin})`, ok: 'Guardar',
    html: `<label class="campo"><span>Materia</span><select name="m"><option value="">Libre (sin clase)</option>${Object.entries(MATERIAS).map(([k2, t]) => `<option value="${k2}" ${c && c.m === k2 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo"><span>Grupo</span><select name="g">${ids.map(g => `<option value="${h(g)}" ${c && c.g === g ? 'selected' : ''}>${h(nombreGrupoH(g))}</option>`).join('')}</select></label>`
  });
  if (!r) return;
  const m = r.querySelector('[name=m]').value, g = r.querySelector('[name=g]').value;
  const clases = { ...hz.clases };
  if (m) clases[k] = { m, g }; else delete clases[k];
  await guardar([{ t: 'c', id: 'horario', d: { ...hz, clases } }]);
  toast('Horario guardado.'); render();
}

/* ---------------- Concentrado mensual ---------------- */
function fechasDelMes(gid, anio, mes) {
  const sc = sinClaseSet(), r = new Set();
  const ult = new Date(anio, mes + 1, 0).getDate();
  for (let d = 1; d <= ult; d++) { const f = ymd(new Date(anio, mes, d)); if (esDiaDeClase(gid, f, sc)) r.add(f); }
  const pref = `${anio}-${String(mes + 1).padStart(2, '0')}-`;
  vivos('r').forEach(x => { if (x.d.g === gid && x.d.e && x.d.f.startsWith(pref)) r.add(x.d.f); });
  return [...r].sort();
}
function datosConcentrado(gid, anio, mes) {
  const g = grupo(gid);
  const fechas = fechasDelMes(gid, anio, mes);
  const ini = ymd(new Date(anio, mes, 1)), fin = ymd(new Date(anio, mes + 1, 0));
  const alumnos = ordenar(alumnosDe(gid), S.meta.orden || 'reporte').filter(s => {
    const b = bajaVigente(s);
    return !(b && b.desde < ini && !fechas.some(f => estado(s.id, f)));   // se omite si ya no venía desde antes del periodo
  });
  const filas = alumnos.map(s => {
    let a = 0, fa = 0;
    const celdas = fechas.map(f => {
      const bj = bajaEn(s, f);
      if (bj) return { m: 'B', c: 'b' };
      const e = estado(s.id, f);
      if (e === 'A') { a++; return { m: 'A' }; }
      if (e === 'F') { fa++; return { m: 'F' }; }
      return { m: '–', c: 'sr' };
    });
    const bajasPer = (s.bajas || []).filter(b => b.desde <= fin && (!b.hasta || b.hasta > ini));
    return { s, celdas, a, fa, bajas: bajasPer };
  });
  const omitidos = alumnosDe(gid).length - alumnos.length;
  return { g, fechas, filas, omitidos, periodo: `${MESES[mes]} ${anio}` };
}
function htmlConcentrado(dat) {
  const c = config();
  const { g, fechas, filas, periodo } = dat;
  return `<section class="rep-pagina rep">
    <div class="rep-cab"><div>${c.escuela ? `<p>${h(c.escuela)}</p>` : ''}<h3>Concentrado de asistencia · ${h(g.nombre)}${c.asignatura ? ' · ' + h(c.asignatura) : ''}</h3></div><p><b>Periodo:</b> ${h(periodo)}</p></div>
    <table class="rep-t"><thead><tr><th colspan="${fechas.length + 4}" class="tcab">${h(g.nombre)} · ${h(periodo)}</th></tr><tr><th>No.</th><th style="text-align:left">Alumno</th>${fechas.map(f => { const d = aFecha(f); return `<th class="dia">${DIA_LETRA[d.getDay()]}<br>${d.getDate()}</th>`; }).join('')}<th>Total A</th><th>Total F</th></tr></thead>
    <tbody>${filas.length ? filas.map((r, i) => `<tr><td>${i + 1}</td><td class="n">${h(nombreCompleto(r.s))}${r.bajas.map(b => `<small>Ya no viene desde ${fmtF(b.desde)}${b.hasta ? ` · regresó ${fmtF(b.hasta)}` : ''}</small>`).join('')}</td>${r.celdas.map(x => `<td class="${x.c || ''}">${x.m}</td>`).join('')}<td class="tot">${r.a}</td><td class="tot">${r.fa}</td></tr>`).join('') : `<tr><td colspan="${fechas.length + 4}">Sin alumnos</td></tr>`}</tbody></table>
    ${fechas.length ? '' : '<p class="rep-ley"><b>No hay días de clase configurados en este periodo.</b></p>'}
    <p class="rep-ley">A = asistencia · F = falta · – = sin registrar (no cuenta como falta) · B = ya no viene (después de su fecha de baja; no cuenta como falta).${dat.omitidos ? ` No se listan ${dat.omitidos} alumno(s) dados de baja antes de este periodo.` : ''}</p>
    <div class="rep-firma"><div>Nombre del docente${c.docente ? `: <b>${h(c.docente)}</b>` : ''}</div><div>Firma</div></div>
  </section>`;
}
function vistaReporte(v) {
  $('#titulo').textContent = 'Reporte mensual';
  const gs = grupos();
  if (!gs.length) { v.innerHTML = '<div class="card">Primero importa tus grupos.</div>'; return; }
  const d = new Date();
  const sel = S.selReporte || (S.selReporte = { tipo: 'asis', g: S.meta.ultimoGrupo && grupo(S.meta.ultimoGrupo) ? S.meta.ultimoGrupo : gs[0].id, anio: d.getFullYear(), mes: d.getMonth() });
  const anios = []; for (let a = d.getFullYear() - 2; a <= d.getFullYear() + 1; a++) anios.push(a);
  const pend = S.outbox.size, conf = S.conflicts.size;
  const ultima = S.meta.ultimaSync ? new Date(S.meta.ultimaSync) : null;
  let aviso = '';
  if (pend || conf) aviso = `<div class="aviso">Hay ${pend ? `${pend} cambio(s) pendiente(s) de sincronizar` : ''}${pend && conf ? ' y ' : ''}${conf ? `${conf} conflicto(s) sin resolver` : ''}. Si también capturaste en otro dispositivo, este reporte podría estar incompleto. ${conf ? '<a href="#/conflictos">Resolver conflictos</a>' : ''}</div>`;
  else if (syncConfigurado() && ultima && Date.now() - ultima > 6 * 3600e3) aviso = `<div class="aviso">Última sincronización: ${fmtHora(ultima)}. Si capturaste en otro dispositivo después, sincroniza antes de imprimir.</div>`;
  v.innerHTML = `
  <div class="card"><h2>Concentrado mensual</h2>
    <div class="tabs" id="r-tipo"><a href="javascript:void 0" data-t="asis" class="${sel.tipo === 'asis' ? 'activo' : ''}">✓ Asistencia</a><a href="javascript:void 0" data-t="trab" class="${sel.tipo === 'trab' ? 'activo' : ''}">📝 Trabajos</a></div>
    <div class="fila">
      <label class="campo" style="flex:1;min-width:150px"><span>Grupo</span><select id="r-g"><option value="*" ${sel.g === '*' ? 'selected' : ''}>Los ${gs.length} grupos</option>${gs.map(g => `<option value="${h(g.id)}" ${sel.g === g.id ? 'selected' : ''}>${h(g.nombre)}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1;min-width:140px"><span>Mes</span><select id="r-m">${MESES.map((m, i) => `<option value="${i}" ${sel.mes === i ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="campo" style="width:110px"><span>Año</span><select id="r-a">${anios.map(a => `<option ${sel.anio === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
    </div>
    ${aviso}
    <div class="fila"><button class="btn primary" id="r-imprimir">Imprimir / Guardar PDF</button><button class="btn" id="r-csv">Descargar CSV</button></div>
    <p class="tenue">En la ventana de impresión elige <b>«Guardar como PDF»</b> como destino para descargarlo. Tamaño carta; la orientación se ajusta sola.</p>
  </div>
  <div class="card scroll" id="r-prev"></div>`;
  const ids = () => sel.g === '*' ? gs.map(g => g.id) : [sel.g];
  const esTrab = () => sel.tipo === 'trab';
  const datos = () => ids().map(id => esTrab() ? datosTrabajos(id, sel.anio, sel.mes) : datosConcentrado(id, sel.anio, sel.mes));
  const pintar = () => { $('#r-prev').innerHTML = datos().map(esTrab() ? htmlTrabajos : htmlConcentrado).join('<hr>'); };
  $$('#r-tipo a').forEach(a => a.onclick = e => { e.preventDefault(); sel.tipo = a.dataset.t; render(); });
  pintar();
  $('#r-g').onchange = e => { sel.g = e.target.value; pintar(); };
  $('#r-m').onchange = e => { sel.mes = Number(e.target.value); pintar(); };
  $('#r-a').onchange = e => { sel.anio = Number(e.target.value); pintar(); };
  $('#r-imprimir').onclick = () => imprimir(datos(), esTrab() ? htmlTrabajos : htmlConcentrado, esTrab() ? 'acts' : 'fechas');
  $('#r-csv').onclick = () => {
    const filas = [];
    if (esTrab()) {
      datos().forEach(dat => {
        filas.push([`${dat.g.nombre} — trabajos con entrega en ${dat.periodo}`]);
        filas.push(['No.', 'ID', 'Alumno', ...dat.acts.map(a => `${a.nombre} (${fmtF(a.entrega)})`), 'Terminados', 'Avances', 'No hizo nada', 'Ya no viene desde']);
        dat.filas.forEach((r, i) => filas.push([i + 1, r.s.id, nombreCompleto(r.s), ...r.celdas.map(x => x.m === '–' ? 'SR' : x.m), r.t.T, r.t.A, r.t.N, r.baja ? fmtF(r.baja.desde) : '']));
        filas.push([]);
      });
      filas.push(['T = terminó; T* = terminó después de la fecha de entrega; AV = avance; N = no hizo nada; SR = sin registrar; B = ya no viene']);
      descargar(`trabajos_${sel.g === '*' ? 'todos' : sel.g}_${MESES[sel.mes]}_${sel.anio}.csv`, aCSV(filas), 'text/csv;charset=utf-8');
      return;
    }
    datos().forEach(dat => {
      filas.push([`${dat.g.nombre} — ${dat.periodo}`]);
      filas.push(['No.', 'ID', 'Alumno', ...dat.fechas.map(fmtF), 'Total asistencias', 'Total faltas', 'Ya no viene desde']);
      dat.filas.forEach((r, i) => filas.push([i + 1, r.s.id, nombreCompleto(r.s), ...r.celdas.map(x => x.m === '–' ? 'SR' : x.m), r.a, r.fa, r.bajas.map(b => fmtF(b.desde)).join(' ')]));
      filas.push([]);
    });
    filas.push(['A = asistencia; F = falta; SR = sin registrar; B = ya no viene']);
    descargar(`concentrado_${sel.g === '*' ? 'todos' : sel.g}_${MESES[sel.mes]}_${sel.anio}.csv`, aCSV(filas), 'text/csv;charset=utf-8');
  };
}
function imprimir(lista, plantilla = htmlConcentrado, campo = 'fechas') {
  const maxCols = Math.max(0, ...lista.map(d => d[campo].length));
  const horizontal = maxCols > 8;
  let st = $('#estilo-pagina');
  if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
  st.textContent = `@page{size:letter ${horizontal ? 'landscape' : 'portrait'};margin:10mm}`;
  $('#impresion').innerHTML = lista.map(plantilla).join('');
  setTimeout(() => window.print(), 50);
}

/* ---------------- Conflictos ---------------- */
function describir(k, val) {
  if (!val) return '—';
  if (val.del) return 'Eliminado';
  const d = val.d || {};
  if (k.startsWith('r:')) return ESTADO_TXT[d.e || ''];
  if (k.startsWith('s:')) { const b = (d.bajas || []).find(x => !x.hasta); return `${nombreCompleto(d)} · ${b ? 'Ya no viene desde ' + fmtF(b.desde) : 'Activo'}`; }
  if (k.startsWith('g:')) return `${d.nombre} · días: ${(d.dias || []).map(x => DIAS[x].slice(0, 3)).join(', ') || 'ninguno'}`;
  if (k.startsWith('w:')) return TRAB_TXT[d.e || ''];
  if (k.startsWith('a:')) return `${d.nombre} · entrega ${fmtF(d.entrega)}`;
  if (k === 'c:horario') return `${Object.keys(d.clases || {}).length} clases por semana`;
  return 'Configuración general';
}
function tituloConflicto(c) {
  const d = (c.local && c.local.d) || (c.remote && c.remote.d) || {};
  if (c.k.startsWith('r:')) { const s = alumno(d.s); const g = grupo(d.g); return `${g ? g.nombre + ' · ' : ''}${s ? nombreCompleto(s) : d.s} · ${fmtLargo(d.f)}`; }
  if (c.k.startsWith('s:')) return 'Datos del alumno ' + nombreCompleto(d);
  if (c.k.startsWith('g:')) return 'Datos del grupo ' + (d.nombre || '');
  if (c.k.startsWith('w:')) { const s = alumno(d.s), a = actividad(d.a); return `Trabajo «${a ? a.nombre : ''}» · ${s ? nombreCompleto(s) : d.s}`; }
  if (c.k.startsWith('a:')) return 'Actividad ' + (d.nombre || '');
  if (c.k === 'c:horario') return 'Horario de clases';
  return 'Configuración general';
}
function vistaConflictos(v) {
  $('#titulo').textContent = 'Conflictos';
  const l = [...S.conflicts.values()];
  v.innerHTML = `<p>Estos datos se modificaron en dos dispositivos con valores distintos. Elige cuál es el correcto; nada se descarta sin tu decisión.</p>` +
    (l.length ? l.map(c => `<div class="conf"><b>${h(tituloConflicto(c))}</b>
      <div class="opc"><div><div class="tenue">Este dispositivo · ${h(fmtHora(horaDeVer(c.local.ver)))}</div><b>${h(describir(c.k, c.local))}</b><br><button class="btn small primary" data-k="${h(c.k)}" data-u="local">Usar este</button></div>
      <div><div class="tenue">Otro dispositivo · ${h(fmtHora(horaDeVer(c.remote.ver)))}</div><b>${h(describir(c.k, c.remote))}</b><br><button class="btn small primary" data-k="${h(c.k)}" data-u="remote">Usar este</button></div></div></div>`).join('')
      : '<div class="ok-box">No hay conflictos pendientes.</div>');
  v.onclick = async e => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    await resolverConflicto(b.dataset.k, b.dataset.u); render();
  };
}
async function resolverConflicto(k, usar) {
  const c = S.conflicts.get(k); if (!c) return;
  const it = S.items.get(k) || { k, t: k.split(':')[0], id: k.slice(k.indexOf(':') + 1) };
  let nuevo;
  if (usar === 'remote') { nuevo = { ...it, d: c.remote.d, del: !!c.remote.del, ver: c.remote.ver, sv: c.remote.ver }; S.outbox.delete(k); }
  else { nuevo = { ...it, d: c.local.d, del: !!c.local.del, ver: nuevaVer(), sv: c.remote.ver }; S.outbox.add(k); }
  S.items.set(k, nuevo); S.conflicts.delete(k);
  await transaccion(['items', 'outbox', 'conflicts'], t => {
    t.objectStore('items').put(nuevo); t.objectStore('conflicts').delete(k);
    if (usar === 'remote') t.objectStore('outbox').delete(k); else t.objectStore('outbox').put({ k });
  });
  programarSync(500);
}

/* ---------------- Sincronización con Hoja de Google (Apps Script) ---------------- */
function syncConfigurado() { return !!(S.meta.syncUrl && S.meta.syncClave); }
let temporizadorSync = null;
function programarSync(ms = 3000) {
  if (!syncConfigurado()) return;
  clearTimeout(temporizadorSync);
  temporizadorSync = setTimeout(() => sincronizar(false), ms);
}
async function llamar(cuerpo) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(S.meta.syncUrl, { method: 'POST', body: JSON.stringify({ ...cuerpo, key: S.meta.syncClave, device: S.meta.deviceId }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl.signal, cache: 'no-store' });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Respuesta inesperada del servicio. Revisa que la dirección sea la de la implementación (termina en /exec) y que el acceso sea «Cualquier usuario».'); }
    if (j.error) throw new Error(j.error === 'clave' ? 'La clave no coincide con la configurada en la Hoja de Google.' : j.error === 'sin_clave' ? 'Falta definir la CLAVE en el Apps Script (ejecuta la función configurarClave).' : j.error);
    return j;
  } finally { clearTimeout(to); }
}
async function sincronizar(manual) {
  if (!syncConfigurado()) { if (manual) toast('Primero configura la sincronización.'); return; }
  if (S.sincronizando) return;
  if (!navigator.onLine) { if (manual) toast('Sin conexión. Los cambios quedan guardados en este dispositivo.'); pintarEstado(); return; }
  S.sincronizando = true; pintarEstado();
  let cambiosRemotos = 0;
  try {
    let pendientes = [...S.outbox];
    let vueltas = 0, mas = true;
    while ((pendientes.length || mas) && vueltas++ < 500) {
      const lote = pendientes.splice(0, 400).map(k => { const it = S.items.get(k); return it ? { k, t: it.t, id: it.id, d: it.d, del: !!it.del, ver: it.ver, base: it.sv || '' } : null; }).filter(Boolean);
      const resp = await llamar({ action: 'sync', since: S.meta.since || 0, push: lote });
      await aplicarResultados(lote, resp.results || []);
      cambiosRemotos += await aplicarRemotos(resp.rows || []);
      await setMeta('since', resp.next);
      mas = !!resp.more;
    }
    S.errorSync = '';
    await setMeta('ultimaSync', Date.now());
    if (manual) toast(S.conflicts.size ? `Sincronizado, con ${S.conflicts.size} conflicto(s) por resolver.` : 'Sincronizado.');
  } catch (e) {
    S.errorSync = e.name === 'AbortError' ? 'Tiempo de espera agotado' : (e.message || String(e));
    if (manual) toast('No se pudo sincronizar: ' + S.errorSync, { ms: 8000 });
  } finally {
    S.sincronizando = false;
    pintarEstado();
    if (cambiosRemotos || S.conflicts.size) refrescarSiConviene();
    if (S.outbox.size && !S.errorSync) programarSync(2000);
  }
}
async function aplicarResultados(lote, res) {
  const enviados = new Map(lote.map(x => [x.k, x]));
  const cambiados = [], confl = [], quitarOutbox = [];
  res.forEach(r => {
    const env = enviados.get(r.k); const it = S.items.get(r.k); if (!env || !it) return;
    if (r.ok) {
      if (it.ver === env.ver) { it.ver = r.ver; it.sv = r.ver; S.outbox.delete(r.k); quitarOutbox.push(r.k); }
      else it.sv = r.ver; // hubo otro cambio local mientras se enviaba; se enviará después
      cambiados.push(it);
    } else if (r.conflict) {
      if (it.ver === env.ver) {
        const c = { k: r.k, local: { d: env.d, del: env.del, ver: env.ver }, remote: r.remote };
        S.conflicts.set(r.k, c); confl.push(c); S.outbox.delete(r.k); quitarOutbox.push(r.k);
      }
    }
  });
  if (!cambiados.length && !confl.length) return;
  await transaccion(['items', 'outbox', 'conflicts'], t => {
    cambiados.forEach(i => t.objectStore('items').put(i));
    confl.forEach(c => t.objectStore('conflicts').put(c));
    quitarOutbox.forEach(k => t.objectStore('outbox').delete(k));
  });
}
async function aplicarRemotos(rows) {
  const cambiados = [], quitarOutbox = [], confl = [], borrarConfl = [];
  let n = 0;
  rows.forEach(r => {
    const loc = S.items.get(r.k);
    if (loc && loc.ver === r.ver) { if (loc.sv !== r.ver) { loc.sv = r.ver; cambiados.push(loc); } return; }
    const mismo = loc && canon(loc.d) === canon(r.d) && !!loc.del === !!r.del;
    if (S.conflicts.has(r.k)) {
      const c = S.conflicts.get(r.k);
      if (canon(c.local.d) === canon(r.d) && !!c.local.del === !!r.del) { borrarConfl.push(r.k); S.conflicts.delete(r.k); const it = { ...(loc || { k: r.k, t: r.t, id: r.id }), d: r.d, del: !!r.del, ver: r.ver, sv: r.ver }; S.items.set(r.k, it); cambiados.push(it); }
      else { c.remote = { d: r.d, del: !!r.del, ver: r.ver }; confl.push(c); }
      return;
    }
    if (S.outbox.has(r.k)) {
      if (mismo) { loc.ver = r.ver; loc.sv = r.ver; S.outbox.delete(r.k); quitarOutbox.push(r.k); cambiados.push(loc); }
      return; // el cambio local pendiente se enviará y el servicio detectará si hay conflicto
    }
    const it = { k: r.k, t: r.t, id: r.id, d: r.d, del: !!r.del, ver: r.ver, sv: r.ver };
    S.items.set(r.k, it); cambiados.push(it); n++;
  });
  if (cambiados.length || quitarOutbox.length || confl.length || borrarConfl.length) {
    await transaccion(['items', 'outbox', 'conflicts'], t => {
      cambiados.forEach(i => t.objectStore('items').put(i));
      quitarOutbox.forEach(k => t.objectStore('outbox').delete(k));
      confl.forEach(c => t.objectStore('conflicts').put(c));
      borrarConfl.forEach(k => t.objectStore('conflicts').delete(k));
    });
  }
  return n;
}
function refrescarSiConviene() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') || $('#dlg').open) { S.pendienteRender = true; return; }
  if (['', 'grupos', 'lista', 'conflictos', 'reporte'].includes(S.vistaActual)) {
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }
}
function codigoVinculacion() { return 'ASIS1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: S.meta.syncUrl, k: S.meta.syncClave })))); }
function leerCodigo(c) {
  c = String(c || '').trim();
  if (!c.startsWith('ASIS1.')) throw new Error('El código no tiene el formato correcto.');
  const o = JSON.parse(decodeURIComponent(escape(atob(c.slice(6)))));
  if (!o.u || !o.k) throw new Error('Código incompleto.');
  return o;
}
async function vincular(url, clave) {
  url = String(url || '').trim(); clave = String(clave || '').trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error('La dirección debe ser la de tu implementación de Apps Script (https://script.google.com/macros/s/…/exec).');
  if (clave.length < 8) throw new Error('La clave debe tener al menos 8 caracteres.');
  const prevU = S.meta.syncUrl, prevK = S.meta.syncClave;
  S.meta.syncUrl = url; S.meta.syncClave = clave;
  try { await llamar({ action: 'ping' }); }
  catch (e) { S.meta.syncUrl = prevU; S.meta.syncClave = prevK; throw e; }
  await setMeta('syncUrl', url); await setMeta('syncClave', clave); await setMeta('since', 0);
  // Al vincular se envían todos los datos locales; el servicio detecta los que ya tiene y los conflictos.
  const ks = [...S.items.keys()];
  ks.forEach(k => S.outbox.add(k));
  await transaccion(['outbox'], t => ks.forEach(k => t.objectStore('outbox').put({ k })));
}

/* ---------------- Respaldo ---------------- */
function crearRespaldo() {
  const meta = { ...S.meta }; delete meta.syncClave; delete meta.syncUrl; delete meta.deviceId;
  const datos = { app: 'asistencia', formato: 1, version: APP_VERSION, creado: new Date().toISOString(), items: [...S.items.values()], outbox: [...S.outbox], conflicts: [...S.conflicts.values()], meta };
  const f = new Date();
  descargar(`respaldo_asistencia_${ymd(f)}_${String(f.getHours()).padStart(2, '0')}${String(f.getMinutes()).padStart(2, '0')}.json`, JSON.stringify(datos), 'application/json');
  setMeta('ultimoRespaldo', Date.now());
}
async function restaurarRespaldo(file) {
  let datos;
  try { datos = JSON.parse(await file.text()); } catch (e) { throw new Error('El archivo no es un respaldo válido.'); }
  if (!datos || datos.app !== 'asistencia' || !Array.isArray(datos.items)) throw new Error('El archivo no es un respaldo de esta aplicación.');
  const nG = datos.items.filter(i => i.t === 'g' && !i.del).length, nS = datos.items.filter(i => i.t === 's' && !i.del).length, nR = datos.items.filter(i => i.t === 'r' && !i.del && i.d.e).length;
  if (!await confirmar('Restaurar respaldo', `Respaldo del ${new Date(datos.creado).toLocaleString('es-MX')}: ${nG} grupos, ${nS} alumnos y ${nR} registros. Reemplazará los datos de ESTE dispositivo. Si tienes sincronización, los datos más recientes de la Hoja de Google se volverán a descargar después. ¿Continuar?`, 'Restaurar')) return false;
  await transaccion(['items', 'outbox', 'conflicts'], t => {
    ['items', 'outbox', 'conflicts'].forEach(s => t.objectStore(s).clear());
    datos.items.forEach(i => t.objectStore('items').put(i));
    (datos.outbox || []).forEach(k => t.objectStore('outbox').put({ k }));
    (datos.conflicts || []).forEach(c => t.objectStore('conflicts').put(c));
  });
  S.items = new Map(datos.items.map(i => [i.k, i])); S.outbox = new Set(datos.outbox || []); S.conflicts = new Map((datos.conflicts || []).map(c => [c.k, c]));
  await setMeta('since', 0);
  programarSync(500);
  return true;
}
function exportarTrabajosCSV() {
  const filas = [['Grupo', 'Actividad', 'Fecha de entrega', 'ID alumno', 'Alumno', 'Estado', 'Fecha en que se marcó', 'Entrega tardía']];
  vivos('w').filter(w => w.d.e).map(w => w.d).sort((a, b) => (a.g + a.a).localeCompare(b.g + b.a)).forEach(w => {
    const a = actividad(w.a), s = alumno(w.s), g = grupo(w.g); if (!a) return;
    filas.push([g ? g.nombre : w.g, a.nombre, a.entrega, w.s, s ? nombreCompleto(s) : '(eliminado)', TRAB_TXT[w.e], w.f || '', w.e === 'T' && w.f > a.entrega ? 'Sí' : '']);
  });
  descargar(`trabajos_${hoy()}.csv`, aCSV(filas), 'text/csv;charset=utf-8');
}
function exportarRegistrosCSV() {
  const filas = [['Grupo', 'ID alumno', 'Alumno', 'Fecha', 'Estado', 'Ya no viene desde']];
  const regs = vivos('r').filter(r => r.d.e).sort((a, b) => (a.d.g + a.d.f).localeCompare(b.d.g + b.d.f));
  regs.forEach(r => { const s = alumno(r.d.s), g = grupo(r.d.g); filas.push([g ? g.nombre : r.d.g, r.d.s, s ? nombreCompleto(s) : '(eliminado)', r.d.f, ESTADO_TXT[r.d.e], s && bajaVigente(s) ? bajaVigente(s).desde : '']); });
  descargar(`registros_asistencia_${hoy()}.csv`, aCSV(filas), 'text/csv;charset=utf-8');
}

/* ---------------- Vista: Configuración ---------------- */
function vistaConfig(v) {
  $('#titulo').textContent = 'Configuración y respaldo';
  const c = config();
  const gs = grupos();
  const ultR = S.meta.ultimoRespaldo ? new Date(S.meta.ultimoRespaldo) : null;
  const sc = (c.sinClase || []).slice().sort((a, b) => a.f.localeCompare(b.f));
  v.innerHTML = `
  <div class="card" id="sync"><h2>Sincronización</h2>
    <p>Estado: <b>${h(infoEstado().txt)}</b>${S.meta.ultimaSync ? ` · última: ${h(fmtHora(new Date(S.meta.ultimaSync)))}` : ''}</p>
    ${S.errorSync ? `<div class="error">${h(S.errorSync)}</div>` : ''}
    ${S.conflicts.size ? `<p><a class="btn danger" href="#/conflictos">Resolver ${S.conflicts.size} conflicto(s)</a></p>` : ''}
    ${syncConfigurado() ? `
      <div class="fila"><button class="btn primary" id="sync-ya">Sincronizar ahora</button><button class="btn" id="ver-codigo">Mostrar código para vincular otro dispositivo</button><button class="btn danger" id="desvincular">Desvincular</button></div>
      <div id="codigo"></div>` : `
      <p class="tenue">Para compartir grupos y registros entre tu computadora y tu celular, conecta una Hoja de Google privada (ver instrucciones, paso «Sincronización»).</p>
      <label class="campo"><span>Código de vinculación (si ya lo generaste en otro dispositivo)</span><input type="text" id="codigo-in" placeholder="ASIS1.…" autocomplete="off"></label>
      <details><summary>O escribir dirección y clave</summary>
        <label class="campo"><span>Dirección de la implementación (termina en /exec)</span><input type="url" id="url-in" placeholder="https://script.google.com/macros/s/…/exec"></label>
        <label class="campo"><span>Clave secreta</span><input type="password" id="clave-in" autocomplete="off"></label>
      </details>
      <button class="btn primary" id="vincular">Vincular este dispositivo</button>`}
  </div>
  <div class="card"><h2>Alumnos y grupos</h2>
    <p><a class="btn primary" href="#/importar">Importar o actualizar desde el archivo «reporte»</a></p>
    ${gs.length ? `<ul class="lista-simple">${gs.map(g => `<li><span><b>${h(g.nombre)}</b> · ${alumnosDe(g.id).filter(s => !bajaVigente(s)).length} activos · clase: ${(g.dias || []).map(d => DIAS[d].slice(0, 3)).join(', ') || '<b>sin días configurados</b>'}</span><a class="btn small" href="#/grupo/${encodeURIComponent(g.id)}">Administrar</a></li>`).join('')}</ul>` : '<p class="tenue">Sin grupos todavía.</p>'}
  </div>
  <div class="card"><h2>Calendario escolar</h2>
    <div class="fila"><label class="campo" style="flex:1"><span>Inicio de clases</span><input type="date" id="c-ini" value="${h(c.inicio || '')}"></label><label class="campo" style="flex:1"><span>Fin de clases</span><input type="date" id="c-fin" value="${h(c.fin || '')}"></label></div>
    <details><summary>Días sin clase (${sc.length})</summary>
      <ul class="lista-simple">${sc.map(x => `<li><span>${h(fmtLargo(x.f))} · <span class="tenue">${h(x.m || '')}</span></span><button class="btn small danger" data-quitar="${h(x.f)}">Quitar</button></li>`).join('')}</ul>
    </details>
    <div class="fila" style="margin-top:.5rem"><input type="date" id="sc-f" style="width:auto"><input type="text" id="sc-m" placeholder="Motivo (opcional)" style="flex:1;min-width:150px"><button class="btn" id="sc-add">Agregar día sin clase</button></div>
    <p class="tenue">Precargado con el calendario SEP 2026-2027 (suspensiones, CTE y vacaciones). Revísalo y ajústalo si tu escuela tiene otros días.</p>
  </div>
  <div class="card"><h2>Datos del concentrado</h2>
    <label class="campo"><span>Escuela</span><input type="text" id="c-esc" value="${h(c.escuela || '')}"></label>
    <label class="campo"><span>Asignatura</span><input type="text" id="c-asig" value="${h(c.asignatura || '')}"></label>
    <label class="campo"><span>Nombre del docente (aparece junto a la firma)</span><input type="text" id="c-doc" value="${h(c.docente || '')}"></label>
    <button class="btn" id="c-guardar">Guardar datos</button>
  </div>
  <div class="card"><h2>Respaldo</h2>
    <p class="tenue">${ultR ? 'Último respaldo en este dispositivo: ' + h(fmtHora(ultR)) : 'Aún no has creado un respaldo en este dispositivo.'} Guarda el archivo en una memoria USB, tu correo o Google Drive.</p>
    <div class="fila"><button class="btn primary" id="resp-crear">Crear respaldo completo</button>
    <label class="btn" style="display:inline-flex;align-items:center">Restaurar respaldo<input type="file" id="resp-rest" accept=".json,application/json" hidden></label>
    <button class="btn" id="csv-todo">Exportar todos los registros (CSV)</button>
    <button class="btn" id="csv-trab">Exportar todos los trabajos (CSV)</button></div>
  </div>
  <div class="card"><h2>Este dispositivo</h2>
    <p class="tenue">Versión ${APP_VERSION} · ID del dispositivo: ${h(S.meta.deviceId)} · <span id="almac"></span></p>
  </div>`;
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const p = $('#almac'); if (p) p.textContent = `espacio usado: ${(e.usage / 1048576).toFixed(1)} MB`; }).catch(() => {});
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => { const el = $('#almac'); if (el) el.textContent += p ? ' · almacenamiento persistente' : ''; }).catch(() => {});
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('sync-ya', () => sincronizar(true));
  on('ver-codigo', () => { $('#codigo').innerHTML = `<p>Escribe o pega este código en el otro dispositivo (Configuración → Sincronización). <b>No lo publiques</b>: quien lo tenga puede ver y modificar tus listas.</p><code class="blk" id="cod-txt">${h(codigoVinculacion())}</code><button class="btn small" id="copiar">Copiar código</button>`; on('copiar', () => { navigator.clipboard.writeText(codigoVinculacion()).then(() => toast('Código copiado.'), () => toast('No se pudo copiar; selecciónalo manualmente.')); }); });
  on('desvincular', async () => {
    if (!await confirmar('Desvincular', 'Este dispositivo dejará de sincronizar. Tus datos locales se conservan. ¿Continuar?', 'Desvincular')) return;
    await setMeta('syncUrl', ''); await setMeta('syncClave', ''); S.errorSync = ''; render();
  });
  on('vincular', async () => {
    const b = $('#vincular'); b.disabled = true; b.textContent = 'Comprobando…';
    try {
      let u = $('#url-in').value, k = $('#clave-in').value;
      const cod = $('#codigo-in').value.trim();
      if (cod) { const o = leerCodigo(cod); u = o.u; k = o.k; }
      await vincular(u, k);
      toast('Dispositivo vinculado. Sincronizando…'); render(); await sincronizar(true); render();
    } catch (e) { toast('No se pudo vincular: ' + e.message, { ms: 9000 }); b.disabled = false; b.textContent = 'Vincular este dispositivo'; }
  });
  const guardarCfg = async (cambio, msg) => { await guardar([{ t: 'c', id: 'general', d: { ...config(), ...cambio } }]); if (msg) toast(msg); };
  $('#c-ini').onchange = e => guardarCfg({ inicio: e.target.value }, 'Inicio de clases guardado.');
  $('#c-fin').onchange = e => guardarCfg({ fin: e.target.value }, 'Fin de clases guardado.');
  on('c-guardar', () => guardarCfg({ escuela: $('#c-esc').value.trim(), asignatura: $('#c-asig').value.trim(), docente: $('#c-doc').value.trim() }, 'Datos guardados.'));
  on('sc-add', async () => {
    const f = $('#sc-f').value; if (!f) { toast('Elige una fecha.'); return; }
    const l = (config().sinClase || []).filter(x => x.f !== f); l.push({ f, m: $('#sc-m').value.trim() });
    await guardarCfg({ sinClase: l }, 'Día sin clase agregado.'); render();
  });
  $$('[data-quitar]', v).forEach(b => b.onclick = async () => { await guardarCfg({ sinClase: (config().sinClase || []).filter(x => x.f !== b.dataset.quitar) }, 'Día quitado.'); render(); });
  on('resp-crear', () => { crearRespaldo(); toast('Respaldo descargado.'); setTimeout(render, 300); });
  $('#resp-rest').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { if (await restaurarRespaldo(f)) { toast('Respaldo restaurado.'); render(); } } catch (err) { toast(err.message, { ms: 8000 }); }
  };
  on('csv-todo', exportarRegistrosCSV);
  on('csv-trab', exportarTrabajosCSV);
}

/* ---------------- Arranque ---------------- */
async function iniciar() {
  try { await cargar(); }
  catch (e) {
    $('#vista').innerHTML = `<div class="error">No se pudo abrir el almacenamiento local de este navegador (${h(e.message)}). Si estás en modo privado/incógnito, ábrela en una ventana normal.</div>`;
    return;
  }
  window.addEventListener('hashchange', alCambiarRuta);
  window.addEventListener('online', () => { pintarEstado(); sincronizar(false); });
  window.addEventListener('offline', pintarEstado);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (S.fechaLista < hoy() && S.vistaActual !== 'lista') S.fechaLista = hoy(); sincronizar(false); } });
  document.addEventListener('focusout', () => { setTimeout(() => { if (S.pendienteRender && !(document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName))) { S.pendienteRender = false; refrescarSiConviene(); } }, 200); });
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar(false); }, 90000);
  setInterval(() => { if (S.vistaActual === 'horario' && document.visibilityState === 'visible' && !$('#dlg').open) { const x = $('#h-ahora'); if (x) x.innerHTML = tarjetaAhora(horario(), new Date()); } }, 30000);
  alCambiarRuta();
  sincronizar(false);
  registrarSW();
}
function registrarSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Solo hay «actualización» si esta página ya estaba controlada por una versión anterior
  const habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const avisar = w => {
      if (!habiaControlador) { w.postMessage('activar'); return; } $('#aviso-actualizacion').hidden = false; $('#btn-actualizar').onclick = () => w.postMessage('activar'); };
    if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) avisar(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 6 * 3600e3);
  }).catch(e => console.warn('SW', e));
  // Solo recarga cuando el usuario aceptó una actualización (no en la primera instalación)
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaControlador && !recargando) { recargando = true; location.reload(); } });
}
iniciar();
