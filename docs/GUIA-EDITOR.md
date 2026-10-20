# Guía del editor de tours

Cómo armar un recorrido 360° con tus fotos, probarlo, compartirlo y exportarlo.

---

## 1. Abrir el editor

Doble click en **`Crear tour (Mac).command`** (o **`Crear tour (Windows).bat`**).

- Se abre una ventana de Terminal: **no la cierres mientras uses el editor**,
  es el servidor que guarda los cambios.
- Enseguida se abre el navegador en `http://localhost:8080/editor/`. Si el
  puerto está ocupado usa el siguiente libre, hasta el 8100.
- Si macOS dice que no puede abrir el archivo: click derecho → **Abrir** → **Abrir**.
  Solo pasa la primera vez.

| Sistema | Qué necesita |
|---|---|
| Mac | [Node.js](https://nodejs.org). Busca Node también en nvm y Homebrew. |
| Windows | Nada. Usa Node si está instalado; si no, PowerShell. |

---

## 2. Crear un tour

Escribí un nombre (por ejemplo "Casa Palermo") y tocá **Crear tour**.
Cada tour queda en su propia carpeta: `tours/casa-palermo/`.

En la pantalla de inicio podés **Editar**, **Ver** o **Borrar** los tours que ya tenés.

---

## 3. Agregar fotos

Tocá **+ Agregar fotos 360** o arrastrá las fotos a la ventana.

- Tienen que ser **equirectangulares**: el doble de anchas que de altas (por
  ejemplo 6000 × 3000). Es el formato de "foto 360 plana" que exportan las
  cámaras y apps 360 (Insta360, Ricoh Theta, GoPro Max, etc.).
- JPG, PNG o WEBP.
- El nombre de la foto es el del archivo. Lo podés cambiar en el panel derecho.

**Calidad** (arriba de la lista de fotos): define el ancho con que se guardan
las fotos nuevas.

| Opción | Ancho máximo | Cuándo usarla |
|---|---|---|
| Normal | 4096 px | Carga rapidísimo en cualquier celular. |
| Alta *(recomendada)* | 6144 px | Buen equilibrio entre nitidez y peso. |
| Máxima | 8192 px | Más nítida; puede no andar en celulares viejos. |

---

## 4. Conectar las fotos (enlaces)

Es el paso más importante para que la caminata se sienta natural.

1. Elegí una foto en la lista de la izquierda.
2. Tocá **+ Enlace**. Queda activado hasta que lo vuelvas a tocar o apretes Esc.
3. Hacé click **en el piso, justo donde estaba parada la cámara cuando sacaste
   la otra foto**.
4. Al lado del disco aparece **¿A qué foto lleva?**: elegí la foto (con el mouse,
   o con las flechas y Enter). Si el tour tiene solo dos fotos, se enlaza directo.
5. Seguí haciendo click para poner más enlaces, también después de cambiar de
   foto en la lista. Si hiciste click en el lugar equivocado, hacé click en
   otro lado y el disco se mueve ahí.
6. Si aparece el aviso amarillo, tocá **"Ir a … y ponerlo"** y hacé lo mismo en
   la otra foto para el **camino de vuelta**.

En el menú, **tiene enlace hacia acá** marca las fotos desde las que ya se llega
a esta: el enlace que falta es el de vuelta, y viene elegido de entrada.
**ya enlazada** marca las fotos a las que esta ya lleva.

> **¿Por qué hace falta el enlace de vuelta?** Cuando caminás de A a B, el visor
> usa el enlace de B hacia A para saber hacia dónde mirar al llegar. Sin vuelta,
> la llegada usa la vista inicial de B y la sensación de "caminar" se pierde.

- **Mover un enlace:** arrastrá el disco.
- **Borrar:** seleccionalo y tocá **Borrar enlace** (o la tecla Suprimir).
- **⚠ en la lista:** esa foto no tiene enlaces o tiene enlaces sin vuelta.
- **Cambiar a qué foto lleva:** seleccioná el enlace y cambiá **Camina hacia**
  en el panel derecho.
- **Esc:** cierra el menú; otro Esc apaga **+ Enlace** o quita la selección.

---

## 5. Detalles opcionales

| Herramienta | Qué hace |
|---|---|
| **+ Info** | Cartel con título y texto. Los saltos de línea se respetan. |
| **Usar esta vista al entrar** | Girá la foto hacia donde querés y tocalo: al abrir el tour o saltar desde la lista se mira hacia ahí. |
| **Arrastrar** en la lista | Cambia el orden: tomá una foto y soltala donde quieras. **La primera foto es donde empieza el tour.** |
| **Giro automático** | La cámara gira sola cuando nadie la toca. |
| **Logo trípode** | Tapa el trípode en todas las fotos: difumina el piso debajo de la cámara y pone encima el logo de la inmobiliaria. Ver abajo. |
| Nombre arriba a la izquierda | El nombre del tour, que aparece en la pestaña del navegador. |

Todo se guarda solo: arriba aparece "Guardado ✓".

### Logo en el trípode

1. Tocá **Logo trípode** (arriba).
2. Elegí el logo. Lo ideal es un PNG cuadrado o redondo, con fondo transparente,
   de 1000 px o más. Si no elegís ninguno, solo se difumina el trípode.
3. Mové **Tamaño** hasta que tape el trípode. La vista redonda muestra el piso
   mirando hacia abajo desde el frente de la foto, así se ve el logo en el tour.
4. Tocá **Aplicar a todas las fotos**.

El logo queda estampado en la foto, así que se ve en el editor, en "Ver tour" y
en el ZIP exportado, en cualquier visor. Las fotos que agregues después lo
reciben solas. Las originales se guardan aparte: podés cambiar el logo o el
tamaño cuando quieras, o tocar **Quitar logo** para dejarlas como estaban.

---

## 6. Probar el tour

**Ver tour ↗** abre el tour tal como lo va a ver cualquier persona.

Dentro del tour:

- Click en los discos del piso para caminar.
- En computadora, un disco sigue al mouse por el piso; si hacés click en la
  dirección de un enlace, camina ahí.
- La lista de fotos (arriba a la izquierda) camina si hay enlace directo; si no,
  hace un fundido.

---

## 7. Compartir la carpeta del tour

Cada tour en `tours/<nombre>/` es independiente y trae sus propios lanzadores:

- **Abrir tour (Mac).command**
- **Abrir tour (Windows).bat**

Podés comprimir esa carpeta y mandarla: quien la reciba hace doble click y se
abre el tour. Tienen que usar el lanzador y no abrir `index.html` directamente,
porque los navegadores no cargan las fotos desde `file://`.

---

## 8. Exportar a ZIP (formato Marzipano Tool)

Tocá **Exportar ZIP** en la barra de arriba.

- Aparece el progreso foto por foto. **No cierres la pestaña** mientras exporta.
- El ZIP se descarga en tu carpeta Descargas con el nombre del tour
  (por ejemplo `casa-palermo.zip`).
- Tiene exactamente la misma estructura que el ZIP del Marzipano Tool, así que
  lo pueden leer los sistemas que ya usan esos ZIP (por ejemplo, un plugin de
  WordPress).

Detalles técnicos en [FORMATO-EXPORT.md](FORMATO-EXPORT.md).

**Tiempos y pesos de referencia:** un tour de 11 fotos de 5376 px tarda unos
10–30 segundos y pesa unos 38 MB. El mismo tour exportado por el Marzipano Tool
pesa unos 46 MB.

---

## Problemas frecuentes

| Problema | Solución |
|---|---|
| "El editor necesita su servidor para poder guardar" | Abriste la página sin el lanzador. Cerrala y usá `Crear tour (Mac).command`. |
| "No se pudo guardar" | Se cerró la ventana de Terminal. Volvé a abrir el lanzador. |
| "no es una foto 360 equirectangular" | La foto no es 2:1. Exportala desde la app de tu cámara como foto 360 (JPG). |
| macOS no deja abrir el `.command` | Click derecho → Abrir → Abrir. |
| Mac sin Node | Instalalo desde [nodejs.org](https://nodejs.org) (versión LTS). |
| Al llegar a una foto mira para cualquier lado | Falta el enlace de vuelta en la foto de destino. |
