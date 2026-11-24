/**
 * Servicio de sincronización para la app «Asistencia».
 * Va pegado en el editor de Apps Script de UNA Hoja de Google privada del docente.
 * Los datos quedan en la pestaña «datos» de esa hoja (en su propio Google Drive).
 *
 * Pasos (detallados en INSTRUCCIONES.md):
 *  1. Cambia la clave de abajo, guarda y ejecuta una vez la función configurarClave.
 *  2. Implementar → Nueva implementación → Aplicación web:
 *       Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier usuario
 *  3. Copia la dirección que termina en /exec y pégala en la app junto con la clave.
 */

// ⚠️ Escribe aquí una clave larga (mínimo 8 caracteres) antes de ejecutar configurarClave.
const CLAVE_NUEVA = 'CAMBIA-ESTA-CLAVE';

const HOJA = 'datos';
const COLUMNAS = ['k', 't', 'id', 'd', 'del', 'ver', 'fecha', 'dispositivo'];
const LIMITE_FILAS = 3000;

function configurarClave() {
  if (!CLAVE_NUEVA || CLAVE_NUEVA === 'CAMBIA-ESTA-CLAVE' || CLAVE_NUEVA.length < 8) {
    throw new Error('Primero escribe una clave propia de al menos 8 caracteres en CLAVE_NUEVA.');
  }
  PropertiesService.getScriptProperties().setProperty('CLAVE', CLAVE_NUEVA);
  obtenerHoja_();
  Logger.log('Clave guardada. Ya puedes implementar como aplicación web.');
}

function doGet() {
  return ContentService.createTextOutput('Servicio de asistencia activo. Esta dirección solo la usa la aplicación.');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) { return salida_({ error: 'El servicio está ocupado, intenta de nuevo.' }); }
  try {
    const req = JSON.parse(e.postData.contents);
    const clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
    if (!clave) return salida_({ error: 'sin_clave' });
    if (req.key !== clave) return salida_({ error: 'clave' });
    if (req.action === 'ping') { obtenerHoja_(); return salida_({ ok: true }); }
    if (req.action === 'sync') return salida_(sincronizar_(obtenerHoja_(), req));
    return salida_({ error: 'Acción desconocida' });
  } catch (err) {
    return salida_({ error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function obtenerHoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]);
    sh.setFrozenRows(1);
    // Texto plano para que Hojas de cálculo no convierta identificadores ni fechas
    sh.getRange(1, 1, sh.getMaxRows(), COLUMNAS.length).setNumberFormat('@');
  }
  return sh;
}

function canon_(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canon_).join(',') + ']';
  return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon_(o[k]); }).join(',') + '}';
}

/**
 * Registro de solo-agregar: cada cambio es una fila nueva. El estado vigente de cada
 * elemento (k) es su última fila. Un cambio se acepta solo si se hizo sobre la versión
 * vigente (base); si no, y el contenido es distinto, se devuelve como conflicto.
 */
function sincronizar_(sh, req) {
  const ultima = sh.getLastRow();
  const n = Math.max(0, ultima - 1);
  const vigente = {};
  if (n > 0) {
    const vals = sh.getRange(2, 1, n, 6).getValues();
    for (let i = 0; i < vals.length; i++) {
      vigente[String(vals[i][0])] = { d: String(vals[i][3]), del: String(vals[i][4]) === '1', ver: String(vals[i][5]) };
    }
  }
  const ahora = new Date().toISOString();
  const nuevas = [], resultados = [];
  (req.push || []).forEach(function (p) {
    const cur = vigente[p.k];
    const dj = canon_(p.d);
    const del = !!p.del;
    if (cur && cur.ver === p.ver) { resultados.push({ k: p.k, ok: true, ver: cur.ver }); return; }   // reintento
    if (!cur || cur.ver === p.base) {
      nuevas.push([p.k, p.t, String(p.id), dj, del ? '1' : '', p.ver, ahora, String(req.device || '')]);
      vigente[p.k] = { d: dj, del: del, ver: p.ver };
      resultados.push({ k: p.k, ok: true, ver: p.ver });
      return;
    }
    if (cur.d === dj && cur.del === del) { resultados.push({ k: p.k, ok: true, ver: cur.ver }); return; }  // mismo dato
    resultados.push({ k: p.k, conflict: true, remote: { d: JSON.parse(cur.d), del: cur.del, ver: cur.ver } });
  });
  if (nuevas.length) {
    if (sh.getMaxRows() < ultima + nuevas.length) sh.insertRowsAfter(sh.getMaxRows(), nuevas.length + 500);
    const rango = sh.getRange(ultima + 1, 1, nuevas.length, COLUMNAS.length);
    rango.setNumberFormat('@');
    rango.setValues(nuevas);
  }
  const total = n + nuevas.length;
  const desde = Math.min(Math.max(0, Number(req.since) || 0), total);
  const cuantas = Math.min(LIMITE_FILAS, total - desde);
  const filas = [];
  if (cuantas > 0) {
    const vals = sh.getRange(2 + desde, 1, cuantas, 6).getValues();
    vals.forEach(function (r) {
      filas.push({ k: String(r[0]), t: String(r[1]), id: String(r[2]), d: JSON.parse(String(r[3])), del: String(r[4]) === '1', ver: String(r[5]) });
    });
  }
  return { results: resultados, rows: filas, next: desde + cuantas, more: desde + cuantas < total };
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
