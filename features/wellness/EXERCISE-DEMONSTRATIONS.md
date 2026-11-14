# Demostración única por ejercicio · 2.20b

Se conserva una sola referencia `mediaId` por ejercicio. El selector compartido 1.20
usa destino `rutinas` (vídeos e imágenes publicados). Subir un archivo o confirmar
un enlace sustituye esa referencia; no se adjuntan dos demostraciones simultáneas.

El enlace se registra por `POST /media` con `source_kind: external`, `external_url`
y `provider`, se publica por `/media/{id}/publish` y después se adjunta. Contrato 1.8,
`ExternalMediaRules`, verificado en el backend. Solo HTTPS YouTube/Vimeo con un ID
de vídeo válido; se rechazan playlists sin vídeo, dominios falsos, credenciales,
fragmentos, puertos no estándar y varios IDs. La URL se canoniza a un vídeo único.
El reproductor incrusta el proveedor y permite abrir el original, sin descargar el
vídeo ni solicitar una firma de storage para él. Los archivos mantienen su flujo.

Un fallo al publicar no cambia la demostración actual. El reintento conserva el ID
del borrador externo. Durante la operación se bloquean envíos repetidos y el guardado
de la rutina; se requieren Media.Create y Media.Publish para registrar el enlace.
El detalle y la vista previa del selector reproducen también los medios externos.

QA sintético: `exercise-demo-link`, `exercise-media`, `exercise-routine-catalog`,
`media-pages`, `media-retirement`; proveedores externos y APIs interceptados.

## Claves nuevas ES/EN

ES coincide con la clave; las etiquetas anteriores se reutilizan.

| ES / clave | EN |
| --- | --- |
| Abrir vídeo original | Open original video |
| No se pudo adjuntar el enlace. Reintenta sin perder la demostración actual. | Unable to attach the link. Retry without losing the current demonstration. |
| Enlace único de YouTube o Vimeo | Single YouTube or Vimeo link |
| Una sola demostración por ejercicio. El enlace sustituye al archivo al confirmarlo. | One demonstration per exercise. The link replaces the file when confirmed. |
| Introduce un enlace HTTPS de un solo vídeo de YouTube o Vimeo. | Enter an HTTPS link to a single YouTube or Vimeo video. |
| Usar este enlace | Use this link |
