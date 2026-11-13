# QA de edición rápida (1.18)

Ejecutar con el servidor de este worktree ya iniciado:

```powershell
$env:E2E_BASE_URL='http://localhost:3038'
corepack yarn e2e --config=features/media/playwright.config.ts
```

La suite usa HTTP simulado basado en los DTO reales: no escribe datos de negocio.
Cubre título, categoría, miniatura, etiquetas, continuidad del audio, conservación de
capítulos/puntos clave/calendario heredado, error y reintento, origen externo, inglés y
anchos de 320 a 1440 px. Los enlaces externos se conservan al editar metadatos;
reemplazar contenido por un archivo cambia el origen a `file` y limpia URL/proveedor.

Regresión compartida ejecutada: `media-pages`, `exercise-media` y `media-bulk-upload`
(solo verificación de lo ya preparado; no implementación de 1.19): 12/14 pasan.
Los dos primeros casos de `e2e/media-pages.spec.ts` dependen de que el video de
`e2e/fixtures/media-pages-http.ts` aparezca en `/media`. Desde 1.17 la biblioteca
solo admite podcasts. Es necesario adaptar esos casos/fixture en el carril dueño de
`e2e`; se mantienen intactos aquí por la propiedad de carpetas acordada.
