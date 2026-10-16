# Formato del ZIP exportado

El botón **Exportar ZIP** del editor genera un ZIP con la **misma estructura de
archivos y carpetas** que el que exporta el [Marzipano Tool](https://www.marzipano.net/tool/).
Cualquier sistema que ya sepa recibir, descomprimir y mostrar esos ZIP
(por ejemplo, un plugin de WordPress) puede usarlo sin cambios.

El código está en [`editor/exportar.js`](../editor/exportar.js).

---

## Estructura

```
<tour>.zip
├── app-files/
│   ├── index.html            Página del visor (mismo HTML que el Tool)
│   ├── data.js               var APP_DATA = { scenes, name, settings }
│   ├── index.js              Visor con la transición caminar
│   ├── style.css             Estilos modernos + estilos de caminar
│   ├── img/                  Íconos (mismos nombres que el Tool)
│   ├── vendor/
│   │   ├── marzipano.js      Marzipano con Viewer#walkTo
│   │   ├── screenfull.min.js
│   │   ├── bowser.min.js
│   │   └── reset.min.css
│   └── tiles/
│       └── <id>/
│           ├── preview.jpg               256 × 1536: 6 caras en orden b d f l r u
│           ├── 1/<cara>/<fila>/<col>.jpg  nivel 512 px    (1 pedazo por cara)
│           ├── 2/<cara>/<fila>/<col>.jpg  nivel 1024 px   (2 × 2)
│           └── 3/<cara>/<fila>/<col>.jpg  nivel 2048 px   (4 × 4)
├── README.txt
└── LICENSE.txt
```

- `<cara>` es una de `f u d l r b` (frente, arriba, abajo, izquierda, derecha, atrás).
- `<fila>` y `<col>` empiezan en 0, desde arriba a la izquierda.
- Los pedazos son JPG de 512 × 512 px.
- El ZIP se guarda **sin compresión**, igual que el del Tool: los JPG ya vienen
  comprimidos.
- Igual que el Tool, hay entradas de carpeta para `app-files/` y `tiles/…`,
  pero no para `img/` ni `vendor/`.

---

## `data.js`

```js
var APP_DATA = {
  "scenes": [
    {
      "id": "0-ingreso",
      "name": "Ingreso",
      "levels": [
        { "tileSize": 256, "size": 256, "fallbackOnly": true },
        { "tileSize": 512, "size": 512 },
        { "tileSize": 512, "size": 1024 },
        { "tileSize": 512, "size": 2048 }
      ],
      "faceSize": 1344,
      "initialViewParameters": { "yaw": 0, "pitch": 0, "fov": 1.57 },
      "linkHotspots": [ { "yaw": 2.94, "pitch": 0.11, "rotation": 0, "target": "1-living" } ],
      "infoHotspots": [ { "yaw": 0.9, "pitch": -0.05, "title": "Cocina", "text": "Renovada" } ]
    }
  ],
  "name": "Casa Palermo",
  "settings": {
    "mouseViewMode": "drag",
    "autorotateEnabled": false,
    "fullscreenButton": true,
    "viewControlButtons": false
  }
};
```

| Campo | Cómo se calcula |
|---|---|
| `id` | `<orden>-<nombre-en-minúsculas>`, igual que el Tool (`0-ingreso`, `1-living`…). Los `target` de los enlaces se actualizan. |
| `levels` | Nivel 0 de 256 px (solo respaldo, usa `preview.jpg`) y luego 512, 1024, … hasta cubrir `faceSize`, con un máximo de 4096. |
| `faceSize` | Ancho de la foto ÷ 4. |
| `north` | Se exporta solo si la escena lo tiene (orientación opcional de llegada). |

---

## Conversión de la foto a cubo

1. Se carga la foto equirectangular guardada por el editor (`tours/<tour>/panos/<id>.jpg`).
2. Para cada una de las 6 caras se calcula, píxel por píxel, la dirección 3D con
   la **misma rotación de caras que Marzipano** (`src/geometries/Cube.js`). Se
   toma el color de la foto con interpolación bilineal.
3. Los niveles más chicos salen de reducir la cara a la mitad cada vez, que da
   mejor calidad que reducir de un salto.
4. Se cortan pedazos de 512 px de a uno, reusando el mismo lienzo para no llenar
   la memoria.

**Verificación:** se comparó píxel por píxel el tour exportado (en cubos) contra
el original (foto entera), mirando hacia 8 direcciones distintas, incluidos el
cenit y el nadir. La diferencia promedio fue menor a 1 sobre 255.

---

## Calidad JPEG y peso

Los pedazos se guardan con **calidad JPEG 82** (el Tool usa 85). La diferencia
no se ve, pero el ZIP pesa menos.

Cada navegador interpreta distinto el valor de calidad de `canvas.toBlob`.
Por ejemplo, en Safari `0.85` produce un JPEG de calidad ~95, casi sin
comprimir. Por eso, antes de exportar, el editor:

1. comprime una imagen de prueba con distintos valores;
2. lee la tabla de cuantización del JPEG resultante para saber la calidad real;
3. elige el valor que da calidad 82 en ese navegador.

| Navegador | Valor de `toBlob` elegido | Calidad real |
|---|---|---|
| Safari / WebKit | ≈ 0,56 | 82 |
| Chrome / Edge / Brave | ≈ 0,82 | 82 |

Para cambiar la calidad, modificá `CALIDAD_OBJETIVO` en `editor/exportar.js`.

**Ejemplo real** (11 fotos de 5376 px):

| Export | Peso |
|---|---|
| Marzipano Tool | ~46 MB |
| Este editor | ~36–38 MB |

---

## Diferencias con el ZIP del Tool

Son solo de contenido, no de formato:

- `index.js` y `vendor/marzipano.js` traen la transición caminar.
- `style.css` trae el estilo moderno del visor.
- Los pedazos se guardan como JPEG *baseline* (el Tool usa *progresivo*). Ambos
  son JPEG estándar y cualquier navegador los muestra igual.
