# Hoja de ruta: funciones para un tour "moderno a 2026"

Investigación de octubre de 2026 sobre qué ofrecen las principales apps de tours
virtuales (Matterport, Kuula, CloudPano, Panoee, 3DVista, Zillow 3D Home,
RICOH360 Tours, Pano2VR, EyeSpy360, SeekBeak, TeliportMe y otras), comparado
con lo que ya tiene este proyecto, para implementarlo más adelante.

---

## Punto de partida (ya implementado)

- Transición **caminar** estilo Matterport: giro, avance con zoom, fundido y
  desenfoque de movimiento (`marzipano-walk/src/walk.js`).
- Enlaces como **discos en el piso**, cursor que sigue al mouse y click en el
  piso para caminar.
- Orientación automática de llegada (usa el enlace de vuelta).
- Visor con estilo moderno: paneles translúcidos, lista numerada, carteles
  tipo tarjeta y hoja inferior en celular.
- **Editor local** sin internet y **exportación a ZIP** con el formato del
  Marzipano Tool (cubos multirresolución, calidad JPEG calibrada).

**Conclusión de la investigación:** en lo esencial el proyecto ya está a la par
de las apps web. Lo que falta son funciones de uso diario que hoy casi todas
traen.

---

## Regla para todo lo que se agregue

Las funciones nuevas tienen que **respetar el formato del ZIP** del Marzipano
Tool, para que el sistema de WordPress que recibe los ZIP los siga leyendo:

- datos nuevos → campos opcionales en `data.js` (dentro de `settings` o de
  cada escena);
- lógica nueva → `kit-para-tours/index.js` (que va como `app-files/index.js`);
- estilos → `marzipano-walk/demo/style.css`;
- archivos nuevos (plano, logo, audio) → dentro de `app-files/`, por ejemplo
  `app-files/media/`.

Un ZIP sin los campos nuevos tiene que seguir funcionando igual.

---

## Prioridad 1: estándar en casi todas, fácil de sumar

| # | Función | Quién la tiene | Cómo encararla acá | Esfuerzo |
|---|---|---|---|---|
| 1 | **Plano interactivo / minimapa**: plano con puntos por foto, tocar para ir, "cono" que muestra hacia dónde se mira | Kuula, CloudPano, Panoee, 3DVista, Zillow (automático), Matterport | En el editor: subir imagen del plano, ubicar cada foto arrastrando un punto y marcar el "norte" de cada foto. En el visor: panel flotante con el plano; el cono usa el yaw actual + norte de la escena. Guardar en `settings.plano` y `scene.plano = {x, y, norte}`. Aprovechar el `north` que ya soporta `index.js`. | Medio |
| 2 | **Giroscopio en celular**: mirar moviendo el teléfono | Prácticamente todas | Marzipano trae `DeviceOrientationControlMethod` (ver `marzipano-walk/demos/device-orientation`). Botón para activarlo; en iOS hay que pedir permiso con `DeviceOrientationEvent.requestPermission()` tras un toque. | Bajo |
| 3 | **Logo en el piso (nadir)**: tapa el trípode | Panoee y la mayoría | Hotspot fijo en `pitch = π/2` con la imagen del logo y perspectiva de piso (como los discos). Logo y tamaño configurables desde el editor. | Bajo |
| 4 | **Botón de contacto / WhatsApp y formulario** | CloudPano, SeekBeak, Kuula Business | Botón flotante configurable (`settings.contacto = {whatsapp, mensaje, email}`). Formulario opcional que arma un mensaje de WhatsApp o `mailto:`, sin servidor. | Bajo |
| 5 | **Compartir vista exacta**: link que abre una foto mirando a un ángulo, QR y vista previa en WhatsApp | Común | Leer/escribir `#foto=<id>&yaw=..&pitch=..&fov=..` en la URL. Botón "Compartir" con `navigator.share` y QR generado en el navegador. Etiquetas Open Graph en `index.html` con una miniatura exportada. | Bajo |
| 6 | **Audio**: música de fondo y narración por foto | Kuula, Panoee ("Tour Guide"), 3DVista, CloudPano | `settings.musica` y `scene.narracion`. Botón de silencio. Respetar que el navegador exige un toque antes de reproducir sonido. | Bajo–medio |

## Prioridad 2: diferencian, medianamente simples

| # | Función | Quién | Cómo encararla | Esfuerzo |
|---|---|---|---|---|
| 7 | **Recorrido automático**: el tour camina solo por una ruta, con narración opcional; se retoma tras unos segundos sin interacción | 3DVista ("Autopilot") | Ruta = orden de fotos o lista en `settings.recorrido`. Usa `walkToScene` existente. Botón "Recorrido" en el visor. | Medio |
| 8 | **Carteles más ricos**: con foto, video, link o área resaltada (polígono) | Panoee (polígono, "eCommerce"), 3DVista, Kuula | Nuevos tipos en `infoHotspots` (`tipo: 'imagen' / 'video' / 'link'`). Polígonos con SVG proyectado (Marzipano no los trae: hay que proyectar cada vértice con `view.coordinatesToScreen`). | Medio |
| 9 | **Precarga de la foto siguiente** | Las que se sienten "instantáneas" | Al llegar a una foto, crear y fijar (`pinFirstLevel`) las escenas enlazadas para que la caminata arranque sin espera. | Bajo |
| 10 | **Estadísticas**: fotos vistas, tiempo, carteles tocados | Kuula Business, SeekBeak | Campo `settings.analytics` con el ID de Google Analytics 4. Eventos al cambiar de foto y al abrir carteles. | Bajo |
| 11 | **Modo VR** (Meta Quest, Apple Vision Pro, Android) | Kuula, 3DVista | WebXR: completo en Chrome/Edge/Quest y en Safari de visionOS; no en Safari de iPhone ni en Firefox. Marzipano no trae WebXR: habría que renderizar la foto en una sesión `immersive-vr` con WebGL propio (o three.js solo para el modo VR). | Medio–alto |

## Prioridad 3: lo más "2026", con más esfuerzo

| # | Función | Situación | Esfuerzo |
|---|---|---|---|
| 12 | **Caminata con profundidad por IA (paralaje real)** | Desde fines de 2025 hay modelos que estiman la profundidad de una foto 360: **DA360** (Depth Anything adaptado a 360°, arXiv 2512.22819), **RePer-360** (arXiv 2603.05999) y **Depth Any Panoramas** (CVPR 2026). Idea: calcular en el editor un mapa de profundidad por foto (por ejemplo con ONNX Runtime Web / transformers.js), exportarlo junto al tour y deformar la imagen durante la caminata. Así los objetos cercanos se moverían más que los lejanos, como en Matterport. **No se encontró ninguna app que lo use para la transición entre fotos: sería un diferencial real.** | Alto |
| 13 | **Visitas guiadas en vivo**: el vendedor maneja el tour, el cliente lo ve en su celular, con voz | CloudPano Live, 3DVista Live Guided Tours, EyeSpy360. Requiere un servidor de señalización y WebRTC. | Alto |
| 14 | **Conexión automática de fotos** | 3DVista 2026 ("Connect Panoramas" con reconocimiento visual). Requiere emparejar puntos entre fotos y estimar posiciones relativas. | Alto |
| 15 | **IA de marketing**: amueblado virtual, descripción automática, video teaser | BrightShot, RICOH360, Zillow. Requiere servicios de IA pagos. **En 2026 varias normas inmobiliarias exigen indicar cuando una imagen fue alterada con IA.** | Medio (con API externa) |
| 16 | **Dollhouse 3D / Gaussian splats** | Zillow SkyTour, Matterport. Necesitan escaneo 3D o video, no fotos 360. Hay análisis que sostienen que a los compradores no les importa tanto (solo el 22% prefiere un escaneo a un recorrido 360 simple). **No recomendado** para este proyecto. | Muy alto |

---

## Plan sugerido

1. **Paquete moderno**: funciones 1 a 6, más 9 (precarga) y 7 (recorrido
   automático). Deja la experiencia a la par de Kuula y CloudPano, sin costo,
   sin internet y compatible con el ZIP del Tool.
2. **Contenido y medición**: 8 (carteles ricos) y 10 (estadísticas).
3. **Inmersión**: 11 (VR).
4. **Diferencial**: 12 (caminata con profundidad por IA).

Para cada función, agregar los controles en el editor (`editor/editor.js`), la
lógica en el visor (`kit-para-tours/index.js`), los estilos y la sección
correspondiente en [GUIA-EDITOR.md](GUIA-EDITOR.md) y
[FORMATO-EXPORT.md](FORMATO-EXPORT.md). Después correr
`bash scripts/actualizar-kit.sh`.

---

## Fuentes

- [Panoee: Best Virtual Tour Software 2026](https://panoee.com/best-virtual-tour-software). Lo escribe Panoee.
- [BrightShot: 12 herramientas comparadas 2026](https://bright-shot.com/blog/best-360-virtual-tour-software/). Lo escribe BrightShot.
- [Matterport: Property Intelligence](https://matterport.com/es/news/matterport-launches-property-intelligence-transforming-real-estate)
- [Matterport: Defurnish / Project Genesis](https://matterport.com/es/blog/all-we-want-is-an-empty-room-how-emptying-your-digital-twin-unlocks-design)
- [AEC Magazine: Matterport y nubes de puntos](https://aecmag.com/reality-capture-modelling/matterport-embraces-point-clouds/)
- [Centex: Matterport en 2026](https://centexmarketing.com/blog/matterport-in-2026/)
- [3DVista: Novedades](https://www.3dvista.com/es/blog/category/actualizaciones/)
- [3DVista: Autopilot](https://www.3dvista.com/en/project/virtual-tour-with-auto-pilot/)
- [3DVista Live Guided Tours](https://marketplace.platform.softwareone.com/product/3dvista-live-guided-tours/PCP-7870-6368)
- [GetApp: Kuula](https://www.getapp.com/marketing-software/a/kuula/)
- [Capterra: CloudPano](https://www.capterra.com/p/186477/CloudPano/)
- [Inman: Zillow SkyTour](https://www.inman.com/2025/11/25/zillows-skytour-uses-compex-3d-tech-to-simplify-home-search/)
- [See3D: Gaussian splatting y tours](https://www.see3d.ai/blog/posts/gaussian-splatting-virtual-tour-uk)
- [HomeJab: Los compradores y los splats](https://homejab.com/real-estate-buyers-dont-care-about-gaussian-splats/)
- [Tendencias de tours virtuales 2026](https://www.coradvisors.net/2026/02/virtual-home-tours-popularity-in-real-estate-2026.html)
- [DA360: Depth Anything en 360° (arXiv)](https://arxiv.org/abs/2512.22819v1)
- [RePer-360 (arXiv, 2026)](https://arxiv.org/abs/2603.05999v1)
- [Depth Any Panoramas (CVPR 2026)](https://cvpr.thecvf.com/virtual/2026/poster/38351)
- [Road to VR: WebXR en Apple Vision Pro](https://roadtovr.com/apple-vision-pro-webxr-support-safari-model/)
- [VR.org: WebXR en 2026](https://vr.org/articles/webxr-interop-2026-cross-browser-standard)

Varias fuentes son de los propios fabricantes o de sitios de reseñas. Antes de
implementar cada función conviene revisar la documentación oficial.
