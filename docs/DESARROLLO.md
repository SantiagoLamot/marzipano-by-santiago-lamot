# Desarrollo

Arquitectura, API del servidor, cómo compilar el motor y cómo probar los cambios.

---

## Arquitectura

```
                 ┌─────────────────────────── navegador ───────────────────────────┐
                 │                                                                 │
 Crear tour ───► │  editor/  (index.html + editor.js + exportar.js)                │
 (.command/.bat) │     │  lee/escribe archivos por la API         genera el ZIP    │
                 │     ▼                                          y lo descarga    │
                 └─────┼───────────────────────────────────────────────────────────┘
                       │ HTTP (localhost)
                 ┌─────▼──────────────────────────┐
                 │ servidor.js  (o servidor.ps1)  │  archivos estáticos + /api/*
                 └─────┬──────────────────────────┘
                       │
                 tours/<tour>/   ← data.js, index.html, panos/*.jpg y el motor
                                   copiado de kit-para-tours/
```

| Pieza | Responsabilidad |
|---|---|
| `marzipano-walk/` | Fork de Marzipano. `src/walk.js` agrega `Viewer#walkTo`. Se compila a `dist/marzipano.js`. |
| `kit-para-tours/index.js` | Visor de cada tour: escenas, hotspots en el piso, cursor, caminar, orientación de llegada. |
| `marzipano-walk/demo/style.css` | Estilos del visor. Es la plantilla que se copia a cada tour nuevo. |
| `editor/editor.js` | Editor: tours, fotos, hotspots, guardado automático, `index.html` de cada tour. |
| `editor/exportar.js` | Conversión equirectangular → cubo, niveles, pedazos, calibración JPEG y ZIP. |
| `editor/nadir.js` | Logo del trípode: difumina el nadir y estampa el logo sobre la foto equirectangular. |
| `servidor.js` / `servidor.ps1` | Servidor estático; con `--editor` / `-Editor` suma la API de archivos. |

Todo el código del editor y del visor es JavaScript sin dependencias ni paso de
compilación: se edita y se recarga la página.

---

## Formato de un tour del editor

```
tours/<tour>/
├── index.html            generado por el editor (lista de fotos incluida)
├── data.js               var APP_DATA = {...}
├── index.js              copia de kit-para-tours/index.js
├── style.css             copia de marzipano-walk/demo/style.css
├── vendor/marzipano.js   copia de kit-para-tours/marzipano.js
├── img/                  íconos
├── panos/<id>.jpg        fotos equirectangulares (con el logo del trípode, si hay)
├── nadir/                solo si se usa el logo del trípode:
│   ├── logo.png          el logo elegido
│   └── originales/<id>.jpg  las fotos sin logo
├── servidor.js, servidor.ps1
└── Abrir tour (Mac).command, Abrir tour (Windows).bat
```

Cada escena del `data.js` de un tour del editor usa `equirect` en lugar de
`levels` (tiles):

```js
{
  "id": "living",
  "name": "Living",
  "equirect": "panos/living.jpg",
  "equirectWidth": 6144,
  "initialViewParameters": { "yaw": 0, "pitch": 0, "fov": 1.5708 },
  "linkHotspots": [ { "yaw": 0.1, "pitch": 0.5, "rotation": 0, "target": "pasillo" } ],
  "infoHotspots": []
}
```

Con el logo del trípode, el tour tiene `"nadir": { "logo": "nadir/logo.png", "tamano": 20 }`
(radio en grados; `logo` es `null` si solo se difumina) y cada escena tiene
`"original": "nadir/originales/<id>.jpg"`. El logo se estampa siempre a partir
de la original. Ninguno de los dos campos pasa al ZIP exportado.

`kit-para-tours/index.js` acepta los dos formatos: `equirect` (una sola imagen)
o tiles del Marzipano Tool (`levels` + `tiles/`).

Ajustes opcionales de la caminata en `settings.walk`:

```js
"walk": { "zoom": 1.9, "walkDuration": 1100, "motionBlur": 2.5,
          "floorHotspots": true, "floorCursor": true, "clickFloorToWalk": true }
```

---

## Servidor local

```bash
node servidor.js [carpeta-raiz] [ruta-a-abrir] [--editor]
```

- Sirve archivos estáticos con `Cache-Control: no-store`.
- Prueba los puertos 8080 a 8100 y abre el navegador.
- Bloquea rutas que salgan de la carpeta raíz.
- `servidor.ps1 [-Ruta /algo/] [-Editor]` hace lo mismo en PowerShell, sin instalar nada.

### API del editor (solo con `--editor`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/listar?ruta=R` | `[{ nombre, carpeta }]` del contenido de `R` (dentro de la raíz). |
| `PUT` | `/api/archivo?ruta=R` | Guarda el cuerpo en `R`. **Solo dentro de `tours/`.** Los `.command` quedan ejecutables. |
| `DELETE` | `/api/archivo?ruta=R` | Borra el archivo o la carpeta `R`. **Solo dentro de `tours/`.** |

Protecciones:

- Solo acepta conexiones desde la propia computadora (127.0.0.1 / ::1).
- Exige `Host: localhost` y que `Origin`, si viene, sea el mismo sitio. Así otra
  página web no puede usar la API.
- Solo usa `PUT` y `DELETE`, que el navegador no permite enviar entre sitios sin
  permiso previo.
- Sin `--editor`, la API no existe: los lanzadores de los tours solo sirven archivos.

---

## Compilar el motor

```bash
bash scripts/actualizar-kit.sh
```

Hace todo junto:

1. `npm install` (la primera vez) y `scripts/build` en `marzipano-walk/`;
2. copia `dist/marzipano.js` a la demo y a `kit-para-tours/`;
3. regenera `kit-para-tours/lanzadores/` a partir de `servidor.js`,
   `servidor.ps1` y los lanzadores de la demo, cambiando la ruta que se abre por `/`.

Con `--sin-build` saltea la compilación (sirve si solo cambiaste el servidor o
los lanzadores).

Los tours que ya existen no se actualizan solos: copiá
`kit-para-tours/marzipano.js` a `tours/<tour>/vendor/marzipano.js` (y lo mismo
con `index.js` o `style.css` si los cambiaste).

---

## Cómo probar

### Servidor

```bash
node servidor.js . /editor/ --editor &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/editor/             # 200
curl -s -X PUT --data-binary x "http://localhost:8080/api/archivo?ruta=servidor.js"  # 403
curl -s -X PUT -H "Origin: http://otro.com" --data-binary x \
  "http://localhost:8080/api/archivo?ruta=tours/a/b.txt"                            # 403
```

### Editor y exportación

Se probaron de punta a punta manejando Chrome y WebKit (el motor de Safari) con
[Puppeteer](https://pptr.dev) / [Playwright](https://playwright.dev):

1. crear un tour con las fotos de `marzipano-walk/demo/panos/`;
2. poner enlaces de ida y vuelta, arrastrarlos, agregar un cartel;
3. abrir el tour y caminar entre fotos;
4. exportar el ZIP y comparar su lista de archivos con la de un ZIP del Marzipano Tool;
5. levantar el ZIP exportado y comparar píxel por píxel contra el tour original
   en varias direcciones.

Para el chequeo de estructura contra un ZIP del Tool:

```bash
norm() { unzip -l "$1" | awk 'NR>3{print $4}' | grep -v '^$' | sed -E \
  's#tiles/[^/]+/#tiles/ID/#; s#tiles/ID/[0-9]+/[a-z]/[0-9]+/[0-9]+\.jpg#tiles/ID/N/F/Y/X.jpg#;
   s#tiles/ID/[0-9]+/[a-z]/[0-9]+/$#tiles/ID/N/F/Y/#; s#tiles/ID/[0-9]+/[a-z]/$#tiles/ID/N/F/#;
   s#tiles/ID/[0-9]+/$#tiles/ID/N/#' | sort -u; }
diff <(norm ejemplo-del-tool.zip) <(norm mi-export.zip) && echo "misma estructura"
```

### Motor (fork)

```bash
cd marzipano-walk
npm test        # suite original de Marzipano (testem)
```

---

## Convenciones

- Código, comentarios y textos de la interfaz en castellano (rioplatense).
- JavaScript ES5 + `Promise` en el visor y el editor, sin dependencias ni compilación.
- `servidor.ps1` y los `.bat` sin tildes (para evitar problemas de codificación
  en Windows) y con saltos de línea CRLF.
