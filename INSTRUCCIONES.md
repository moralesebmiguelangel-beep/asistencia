# Asistencia — Instrucciones de instalación y uso

Aplicación para pasar lista a tus seis grupos (1° A, 1° B, 2° A, 2° B, 3° A y 3° B), con o sin internet, en tu computadora Windows y en tu iPhone.

**Contenido del paquete**

| Carpeta / archivo | Para qué sirve |
|---|---|
| `app/` | La aplicación. Es lo único que se publica en internet y **no contiene nombres de alumnos**. |
| `apps-script/Code.gs` | El servicio de sincronización. Se pega en una Hoja de Google privada tuya. |
| `INSTRUCCIONES.md` | Este documento. |

---

## 0. Lo que debes saber antes de empezar

- **Necesitas internet solo para la instalación inicial y para vincular tus dispositivos.** Después, pasar lista, consultar y generar el concentrado funciona sin conexión.
- **Dónde quedan los datos:**
  - En la memoria interna de cada dispositivo.
  - En una Hoja de Google privada de tu cuenta, que sirve para sincronizar y como copia de seguridad.
  - Nadie más tiene acceso.
- **Qué datos se guardan:** de tu archivo «reporte» solo se toman el ID, los apellidos, el nombre y el grupo. La CURP, los domicilios, los teléfonos y los datos de tutores **no se importan**.
- **Costo: $0.** Se usan GitHub Pages para publicar la app y tu cuenta de Google para sincronizar, ambos gratuitos. La app no tiene publicidad ni rastreo.
- **No hay instalador `.exe` ni de App Store.** Es una aplicación web instalable (PWA): se instala desde el navegador y queda con su propio icono. No pude generar un instalador nativo en mi entorno, y para este tipo de app no hace falta.
- **Limitación en iPhone:** la sincronización ocurre **con la app abierta** y con conexión:
  - al abrirla,
  - al recuperar la señal,
  - cada 90 segundos mientras está abierta,
  - al tocar «Sincronizar ahora».

  iOS no permite que una PWA sincronice estando cerrada.
- **No borres los datos de navegación** del navegador donde instalaste la app, porque perderías la copia local. Por eso existen la Hoja de Google y el botón de respaldo.

---

## 1. Publicar la aplicación (una sola vez, desde la computadora)

La app debe estar en una dirección `https://` para poder instalarse en el iPhone y funcionar sin conexión. Recomiendo **GitHub Pages**, que es gratuito:

1. Crea una cuenta en <https://github.com>, o entra a la tuya.
2. Arriba a la derecha toca **+ → New repository**:
   - Nombre: `asistencia`.
   - Visibilidad: **Public**. Es necesario para Pages gratis, y el código no contiene datos de alumnos.
   - Toca **Create repository**.
3. En el repositorio recién creado, haz clic en **uploading an existing file**. Arrastra **todo el contenido de la carpeta `app/`** (index.html, app.js, app.css, sw.js, manifest.webmanifest y la carpeta icons). Luego toca **Commit changes**.
   - Arrastra el contenido, no la carpeta `app` misma. `index.html` debe quedar en la raíz del repositorio.
4. Ve a **Settings → Pages**:
   - En «Branch» elige `main` y `/ (root)`.
   - Toca **Save**.
5. Espera 1–2 minutos. Tu dirección será `https://TU-USUARIO.github.io/asistencia/`. Guárdala.

> Otra opción: Netlify Drop (<https://app.netlify.com/drop>). Arrastras la carpeta `app` y te da una dirección. Necesitas una cuenta gratuita para que el sitio no caduque.

---

## 2. Instalar en la computadora (Windows)

1. Abre la dirección del paso 1 en **Google Chrome** o **Microsoft Edge**.
2. Instala la app:
   - **Chrome:** icono de instalar (⊕) en la barra de direcciones → **Instalar**.
   - **Edge:** menú **… → Aplicaciones → Instalar este sitio como una aplicación**.
3. Si no aparece el acceso en el escritorio:
   - **Chrome:** abre `chrome://apps`, haz clic derecho en «Asistencia» → **Crear accesos directos → Escritorio**.
   - **Edge:** abre `edge://apps` y usa la opción **Crear acceso directo en el escritorio**.

La app se abre en su propia ventana, como un programa.

### Importar tus seis grupos (solo en la computadora)

1. En la app ve a **Configuración → Importar o actualizar desde el archivo «reporte»**.
2. Elige `Reporte.xlsx`. La app reconoce automáticamente estas columnas:
   - **ID**
   - **Apellido Paterno**, **Apellido Materno** y **Nombre(s)**
   - **Grado** y **Grupo**

   Si alguna no se reconoce, la puedes elegir a mano.
3. Revisa la vista previa:
   - Deben aparecer 6 grupos y 190 alumnos, en el mismo orden del reporte.
   - Si hay posibles duplicados, se avisan antes de importar.
4. Toca **Confirmar importación**.

**Importar de nuevo** (por ejemplo, con un reporte actualizado) **no borra nada**:
- Actualiza a los alumnos que ya existen, reconocidos por su ID.
- Agrega a los nuevos.
- Conserva todas las asistencias y bajas.

---

## 3. Sincronización: crear tu Hoja de Google privada (una sola vez)

1. Entra a <https://sheets.google.com> con tu cuenta y crea una **hoja en blanco**. Llámala, por ejemplo, «Asistencia – sincronización». **No la compartas con nadie.**
2. En la hoja ve a **Extensiones → Apps Script**.
3. Borra lo que aparezca y **pega todo el contenido de `apps-script/Code.gs`**.
4. Busca la línea `const CLAVE_NUEVA = 'CAMBIA-ESTA-CLAVE';` y cambia el texto entre comillas por **una clave larga que solo tú conozcas**. Usa al menos 12 caracteres, por ejemplo una frase sin espacios. Guarda con el icono de disco.
5. Arriba elige la función **configurarClave** y toca **Ejecutar**. Google pedirá permisos la primera vez:
   1. Toca **Revisar permisos** y elige tu cuenta.
   2. Si aparece «Google no verificó esta app», toca **Configuración avanzada → Ir a … (no seguro)** y luego **Permitir**. Es seguro porque el código es tuyo y corre solo en tu cuenta.
6. Toca **Implementar → Nueva implementación**:
   1. En el engrane elige el tipo **Aplicación web**.
   2. **Ejecutar como:** *Yo*.
   3. **Quién tiene acceso:** *Cualquier usuario*. Es necesario para que la app se conecte; sin tu clave, el servicio no entrega ni acepta datos.
   4. Toca **Implementar** y **copia la URL de la aplicación web**, que termina en `/exec`.

### Vincular la computadora
En la app: **Configuración → Sincronización → «O escribir dirección y clave»**. Pega la URL `/exec`, escribe tu clave y toca **Vincular este dispositivo**. El indicador debe cambiar a **«Sincronizado»**.

### Vincular el iPhone
1. **Instala la app en el iPhone:**
   1. Abre la dirección del paso 1 en **Safari**. Debe ser Safari.
   2. Toca **Compartir (□↑) → Agregar a inicio → Agregar**.
2. **Abre la app desde el icono nuevo**, no desde Safari. En iPhone, la app instalada guarda sus datos aparte de Safari.
3. En la computadora, ve a **Configuración → Mostrar código para vincular otro dispositivo**. Ese código contiene la dirección y la clave.
4. Pásalo al iPhone por un medio privado, por ejemplo un correo a ti mismo. Pégalo en **Configuración → Sincronización → Código de vinculación** y toca **Vincular este dispositivo**. Después borra el mensaje donde lo enviaste.
5. En segundos aparecerán tus seis grupos con todos sus registros.

> Importa el archivo «reporte» **solo en la computadora**. El iPhone recibe los alumnos por sincronización.

### Cómo funciona la sincronización
- **Indicador de estado:** cada toque se guarda primero en el dispositivo. Arriba a la derecha verás:
  - «Sin conexión»
  - «Cambios pendientes (n)»
  - «Sincronizado»
  - «Conflictos (n)»
- **Sin duplicados:** cada registro se identifica por *alumno + fecha*. Repetir la sincronización no duplica nada.
- **Conflictos:** si la computadora y el celular ponen estados distintos al mismo alumno en la misma fecha, la app muestra **«Conflictos»**. En esa pantalla ves los dos valores con su hora y eliges el correcto. Nada se descarta sin tu decisión.
- **Historial completo:** la pestaña «datos» de tu Hoja de Google guarda cada cambio como una fila nueva. No la edites a mano.

---

## 4. Uso diario

1. Abre la app y toca el grupo. La fecha de hoy ya está seleccionada.
2. Usa los botones de cada alumno:
   - Toca **Asistencia** o **Falta**. Se guarda al instante, sin confirmaciones.
   - Si te equivocas, toca el otro botón. Tocar de nuevo el mismo botón regresa al alumno a «Sin registrar».
3. Usa las herramientas de la lista:
   - **Marcar asistencia a todos los pendientes:** no cambia a quienes ya tienen registro. Aparece **Deshacer** durante 10 segundos.
   - **Buscador:** encuentra a un alumno por nombre.
   - **Botón de orden:** cambia entre el orden del reporte y el alfabético.
   - **Flechas ◀ ▶:** saltan al día de clase anterior o siguiente del grupo.
4. Si sales de un grupo con alumnos sin registrar, aparece un aviso breve con el botón **Volver**.

### «Ya no viene»
- **Al darlo de baja:**
  - Pide confirmación y la fecha desde la que el alumno deja de asistir.
  - El alumno desaparece de las listas desde esa fecha.
  - Su historial anterior se conserva.
  - Los días siguientes **no** cuentan como faltas.
- **Para ver o reactivar alumnos inactivos:** pantalla de lista → **Ver alumnos inactivos y administrar grupo** → **Reactivar**.

### Concentrado mensual (PDF)
1. Ve a **Reporte mensual**.
2. Elige el grupo (o **Los 6 grupos**), el mes y el año.
3. Toca **Imprimir / Guardar PDF**:
   - **Windows:** en «Destino» elige **Guardar como PDF**, o tu impresora.
   - **iPhone:** en la vista de impresión toca **Compartir → Guardar en Archivos**.

**Qué incluye el concentrado:**
- Tamaño carta. Orientación horizontal automática cuando hay más de 8 fechas.
- Encabezados repetidos en cada página y cada grupo en página nueva.
- Marcas por día:
  - **A** = asistencia
  - **F** = falta
  - **–** = sin registrar (no cuenta como falta)
  - **B** = días después de la baja
- Totales de asistencias y faltas por alumno, y espacio para nombre y firma.
- Las columnas son solo los días de clase de cada grupo, sin fines de semana ni días sin clase.
- Si hay cambios sin sincronizar, aparece un aviso.

**Descargar CSV** genera la misma tabla para Excel.

### Días de clase y calendario
Vienen precargados y puedes cambiarlos cuando quieras.

**Días de clase:** tomados de tu horario 2026-2027 de Tecnología. Se cambian en **Configuración → Administrar** de cada grupo.

| Grupo | Días de clase |
|---|---|
| 1° A | lun, mar, mié |
| 1° B | lun, mar, mié |
| 2° A | lun, mié, vie |
| 2° B | lun, mié, jue |
| 3° A | lun, mar, jue |
| 3° B | mar, jue, vie |

**Días sin clase:** tomados del calendario escolar SEP 2026-2027 (suspensiones, CTE y vacaciones). Se ajustan en **Configuración → Calendario escolar**. **Revísalos una vez**, por si tu escuela tiene días distintos.

**Datos del concentrado:** en **Configuración** escribe tu nombre para que aparezca junto a la firma.

---

## 5. Respaldo y restauración

- **Crear respaldo:** **Configuración → Crear respaldo completo** descarga un archivo `.json` con grupos, alumnos, asistencias y bajas. Guárdalo en una USB, en tu correo o en Drive. Recomiendo hacerlo cada mes.
- **Restaurar:** **Configuración → Restaurar respaldo**. Pide confirmación antes de reemplazar los datos del dispositivo. Si tienes sincronización, después se descargan los cambios más recientes de tu Hoja de Google, así que no pierdes lo capturado en el otro dispositivo.
- **Exportar todos los registros (CSV):** copia legible en Excel de todas las asistencias.
- **Confirmaciones:** borrar alumnos, grupos o los registros de un día siempre pide confirmación.

---

## 6. Actualizar la aplicación

Si recibes una versión nueva:

1. En tu repositorio de GitHub, toca **Add file → Upload files**, sube los archivos nuevos de `app/` (reemplazan a los anteriores) y toca **Commit changes**.
2. Al abrir la app con internet, aparece **«Hay una versión nueva — Actualizar»**. Tócalo.

Tus datos no se tocan al actualizar.

Si cambia `Code.gs`, pégalo de nuevo en Apps Script y ve a **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. La URL no cambia.

---

## 7. Solución de problemas

| Situación | Qué hacer |
|---|---|
| «La clave no coincide» | Revisa que la clave de la app sea la misma que pusiste en `CLAVE_NUEVA` y que ejecutaste `configurarClave`. |
| «Respuesta inesperada del servicio» | La URL debe terminar en `/exec`, y el acceso debe ser «Cualquier usuario». |
| El iPhone no muestra mis grupos | Abre la app desde el icono de inicio (no desde Safari) y vincúlala con el código. |
| Quiero dejar de sincronizar un dispositivo | Configuración → Desvincular. Los datos locales se conservan. |
| Cambié de celular | Instala la app en el nuevo y vincúlalo con el código. Todo se descarga de tu Hoja de Google. |

---

## 8. Pruebas de aceptación realizadas

Probé esta versión en Chromium (perfil de escritorio y perfil de iPhone 13) con tu `Reporte.xlsx` real. La sincronización la probé con el mismo `Code.gs` corriendo en un simulador local de Apps Script. **47 de 47 pruebas pasaron:**

- Importa los 6 grupos (190 alumnos) con vista previa y columnas reconocidas automáticamente. Al reimportar se conservan asistencias y bajas.
- Registra asistencia o falta con un toque. Los contadores, el buscador, el orden alfabético, «Marcar a todos» con deshacer y el aviso al salir funcionan.
- Funciona sin internet. Lo capturado se recupera al cerrar y volver a abrir.
- «Ya no viene» conserva el historial y oculta al alumno en fechas posteriores. Se puede consultar en la lista de inactivos.
- La computadora y el celular se sincronizan sin duplicar registros. Una clave incorrecta es rechazada.
- Un conflicto entre dispositivos se detecta, se muestra y se resuelve.
- El concentrado en PDF sale en tamaño carta horizontal, con encabezados repetidos y cada grupo en página nueva. El CSV también funciona.
- El respaldo se crea y se restaura en un dispositivo nuevo.

**Pendiente de comprobar en tus equipos reales:**
- La instalación en tu Windows y en tu iPhone (Safari).
- La conexión con tu propia Hoja de Google, porque no tengo acceso a tu cuenta.
