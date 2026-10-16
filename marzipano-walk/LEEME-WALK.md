# Marzipano "caminar" — kit para tus tours

Qué trae esta carpeta (todo sale del fork `marzipano-walk`):

| Archivo | Va en el export del Tool como |
|---|---|
| `marzipano.js` | `vendor/marzipano.js` (reemplaza el original) |
| `index.js` | `index.js` (reemplaza el original) |
| `walk.css` | `walk.css` + un `<link>` en `index.html` |

## Aplicarlo a un tour

```bash
./aplicar-walk.sh /ruta/al/export-descomprimido
```

Lo mismo puede hacer tu panel admin al subir el ZIP: descomprimir, copiar estos
3 archivos y agregar el `<link rel="stylesheet" href="walk.css">`.

## Qué cambia

- **Caminar entre escenas**: al tocar un enlace la cámara gira hacia el destino,
  avanza (zoom geométricamente consistente entre las dos fotos), funde y llega
  mirando en la dirección en la que caminaste. Con desenfoque de movimiento.
- **Orientación automática**: la dirección de llegada sale del hotspot de vuelta
  del destino. Si una escena no tiene enlace de vuelta, podés agregar en
  `data.js` un `"north": <yaw en radianes>` a cada escena (el yaw donde queda el
  norte / una referencia común en esa foto).
- **Hotspots en el piso**: los enlaces que están por debajo del horizonte se
  dibujan como discos apoyados en el piso, tipo Matterport.
- **Cursor en el piso + click para caminar**: en PC aparece un disco bajo el
  mouse; si hacés click en el piso en la dirección de un enlace, camina ahí.
- La lista de escenas también camina si hay enlace directo; si no, fundido.

## Ajustes

En `data.js`, dentro de `settings`, podés agregar:

```js
"walk": { "zoom": 1.9, "walkDuration": 1100, "motionBlur": 2.5,
          "floorHotspots": true, "floorCursor": true, "clickFloorToWalk": true }
```

Consejo: en el Tool, poné los hotspots de enlace **en el piso, donde estaba
parada la cámara de la otra escena**. Así la dirección de marcha y la llegada
quedan exactas.

## Recompilar la librería

```bash
cd marzipano-walk && npm install && scripts/build   # -> dist/marzipano.js
```

Licencia: Apache 2.0 (Marzipano © Google Inc.; modificaciones © Santiago Lamot).
