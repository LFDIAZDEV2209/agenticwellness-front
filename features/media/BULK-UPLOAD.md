# Integración de 1.18 / 1.19

La referencia visual es `openspec/changes/organizar-experiencia-bienestar/mockups/referencia-claude-f1-4/`:
`Biblioteca de podcasts.png` (drawer) y `Carga múltiple de podcasts.png`.
Se reutilizan Sheet de Base UI, Button, Input, Skeleton y tokens del ERP.

## Punto de conexión de 1.17

`MediaQuickEditSheet` se exporta desde `components/media-form-fields.tsx`.
Recibe `open`, `onOpenChange`, `media`, `saving`, `serverError?` y `onSubmit`.
`onSubmit(input, file?, thumbnailFile?, onProgress?)` conserva la firma del formulario
actual. El contenedor debe mantener `saving=true` durante toda la operación, resolver
los archivos con `resolveStorageKeys`, actualizar **el mismo id** y cerrar tras guardar.
El drawer conserva estado y metadatos avanzados; no muestra día ni mes. Las referencias
se consultan con `fetchMediaReferences`; se cuentan inscripciones, pues ese contrato no
proporciona un total de pacientes distintos. No se ha editado `media-page.tsx`.

La carga múltiple se abre en `/media/new?mode=bulk`. `/media/new` conserva el formulario
individual. 1.17 puede enlazar a esa ruta con la clave `Subir podcasts`; el formulario
individual ya ofrece el enlace con `Carga múltiple de podcasts`.

## Transporte y dependencias

Contrato confirmado con CodeGraph y el código de `BulkMediaCommands.cs` y
`MediaController.cs` del backend, commit **a96bb57 (1.13)**:

- `POST /api/v1/media/bulk/drafts`, permiso `Media.Create`, cuerpo `{ files: [...] }`.
  Cada fila lleva `nombre`, `storageKey`, `title`, `author`, `category`, `contentType`,
  `fileSizeBytes`, `durationSecs` y `thumbnailKey`. El servidor crea podcasts en borrador;
  no recibe archivos binarios ni asignaciones de día/mes.
- `POST /api/v1/media/bulk/publish`, permiso `Media.Publish`, cuerpo
  `{ files: [{ nombre, mediaId }] }`.
- Ambos responden un array, en el mismo orden, de
  `{ nombre, estado: "borrador" | "publicado" | "error", mediaId?, error? }`.
  Una fila incorrecta no revierte las demás. Cada petición admite de 1 a 100 filas.

`services/media-bulk-service.ts` contiene exclusivamente este transporte, separado
del servicio compartido de medios y de los diálogos de sustitución de 1.23.
`MediaBulkUpload` recibe `createDrafts` y `publishDrafts`; la cola divide cargas grandes
en bloques de 100. Primero se sube cada audio mediante upload-intent y almacenamiento
existentes; después se registra el bloque. Un fallo local de archivo no impide registrar
los demás. Se conserva la clave tras una respuesta perdida y el id tras crear el borrador.
Las filas se correlacionan por posición, conservando identidades distintas aunque el nombre
se repita. Una respuesta incompleta no se presenta como éxito.

La tabla permite guardar cambios de título, autor y categoría sin publicar. GET/PUT
individuales conservan etiquetas, origen, capítulos y calendario. Antes de publicar o
reintentar se consulta el estado: un medio ya publicado no se vuelve a editar ni despublicar.
Los reintentos excluyen los correctos y no repiten sus subidas.
Si se edita una fila después de perder la respuesta de creación, se reconcilian sus
metadatos al recuperar el id: el registro idempotente del backend no los sobrescribe.

La salida por archivo sigue 1.13: `{ nombre, estado: borrador|publicado|error, error? }`.
Los resultados correctos se omiten al reintentar. El autor permanece editable y obligatorio
porque el contrato vigente lo exige. El progreso y la duración vienen del archivo real.

La preparación de `a4d7bc6` / `f4b7957` quedó conectada al contrato 1.13. El drawer de
1.18 y las sustituciones de 1.23 quedan fuera de este cambio. El estado local y las claves
de reintento viven en la página; no se conserva una carga tras cerrar o recargar la pestaña.
Al salir se abortan los lotes pendientes; la utilidad compartida de subida puede terminar
el PUT ya iniciado, pero después no se registra ni publica otro bloque desde esa página.

## Verificación

```powershell
node --test features/media/services/media-bulk-queue.test.mjs
corepack yarn e2e e2e/media-bulk-upload.spec.ts e2e/media-pages.spec.ts e2e/exercise-media.spec.ts
corepack yarn e2e --config=features/media/playwright.config.ts
corepack yarn lint
corepack yarn build
corepack yarn i18n:check
```

La suite HTTP sintética usa las dos rutas y los DTO reales: cinco archivos en una petición
con un fallo, reintento de una sola fila, edición del borrador, respuestas de lote perdidas
tras persistir o publicar, nombres duplicados, permisos de lectura, tabla accesible a 390 px,
traducción y ausencia de día/mes. Genera capturas de escritorio y móvil en el directorio de
resultados de Playwright. Los unitarios cubren además bloques de 100, cancelación y respuestas
incompletas. Esta evidencia valida el cliente contra el contrato y simulaciones HTTP;
no constituye una ejecución del stack backend real ni una prueba de almacenamiento S3.

Validación de 1.19 (14-11-2026): lint, build e i18n correctos (0 claves faltantes),
16/16 E2E compartidos de medios, 5/5 de edición rápida y 6/6 unitarios de cola.
Playwright MCP: dos borradores y publicación conjunta en una petición, foco de teclado,
sin desbordamiento de página a 320/390/768/1440 px ni errores de JavaScript.

## Claves i18n para coordinación

Añadidas a ambos diccionarios, sin cambiar traducciones existentes:

- `Carga múltiple de podcasts`, `Subir podcasts`, `Seleccionar varios archivos`, `Elegir archivos`.
- `Cada archivo queda como borrador con el título tomado del nombre. Complétalos aquí y publícalos juntos.`
- `Arrastra los audios aquí. Cada archivo se guarda como borrador antes de publicarlo.`
- `Suelta aquí más archivos de audio`, `Audio · hasta 200 MB por archivo · {count} en esta carga`.
- `Archivos del lote`, `Título de {name}`, `Autor de {name}`, `Categoría de {name}`.
- `{drafts} borradores · {published} publicados · {errors} con error`, `Procesando...`, `Subida de {name}`.
- `Quitar {name} del lote`, `Crear borradores`, `Guardar borradores`, `Publicar en lote`, `Publicar {count} listos`, `Borrador listo`.
- `Selecciona archivos de audio para la biblioteca de podcasts.`, `El archivo supera 200 MB.`.
- `No se pudo publicar el medio.`, `El medio ya no es un borrador. Actualiza la biblioteca.`.
- `Editar podcast`, `Edición rápida del podcast`, `Actualiza título, categoría y miniatura sin salir de la biblioteca.`.
- `Dónde se usa`, `{count} inscripciones`.
- `Al reemplazar el archivo se conservan las asignaciones. El cambio se aplica al guardar.`
- `Mindfulness` (clave dinámica de categoría).

Las claves adicionales de 1.17 deben llegar del dueño de ese worktree antes de incorporarlas.
