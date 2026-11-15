# 3.20 — recorrido real APP → ERP → APP completado

**Completado el 15-11-2026.** El análisis y la comida originales se conservaron;
la reanudación desde 7683e77 con E2E_320_RESUME completó el recorrido pendiente
sin reanalizar ni duplicar la comida. APP cc093ac; API con fix 1a14083 sobre eb181a8.

## Resultado comprobado

- Foto firmada real y corrección visibles en ERP: 623 kcal, 31 g de proteína.
  La estimación original sigue separada del registro final.
- Coordinación lee la misma comida sin fotos; nutricionista ajeno recibe 404.
  Cuatro identidades reales y audiencias app/erp comprobadas.
- Publicación conjunta real del siguiente plan y mensaje ES/EN: HTTP 200.
  PostgreSQL confirma cierre revisión 7 publicado y plan siguiente aprobado/publicado.
- APP lee la nueva recomendación con una imagen decodificada y conserva el ciclo
  histórico preparado en el historial. No recibe notas internas ni adjuntos privados.
- Playwright MCP posterior: Plan e Historial en ES/EN a 320/390/1440, sin
  pageerrors ni overflow del documento o ion-content. Capturas con transiciones finalizadas.
- MCP ERP posterior confirma de nuevo la foto y la corrección.
- Una sola comida QA y los 33 registros R7 conservados.

## Evidencia y límites

Los JSON de evidence/ contienen el recorrido final (3.20-complete-journey.json),
MCP APP y ERP, SELECT posterior y la recuperación de la foto. El directorio
compartido openspec/changes/organizar-experiencia-bienestar/revision-3.20-real/
conserva resultados.json, README.md y capturas/ (12 capturas MCP APP y dos ERP
de esta validación, además de las capturas históricas).

El análisis inicial devolvió 200 y guardó la comida real. Se detectó después que
LocalImageStorage devolvía el ETag de S3 como image_key. El fix BACK 1a14083
devuelve la clave lógica después del PUT exitoso (imagen y máscara), sin cambiar
el contrato del proveedor genérico. Codex-back recuperó por compare-and-set
una sola referencia del análisis existente tras validar objeto, ETag, propietario
y enlace; no alteró la comida, sus macros ni la revisión. Las evidencias previas
se mantienen como historial; no sustituyen el recorrido final.

No se afirma consola global vacía: hubo refresh 401 inicial sin cookie,
telemedicine 502 del stack mínimo y agents/executions 403 ajeno al recorrido.
La ventana MCP APP no registró fallos HTTP de nutrición y el ERP posterior
solo respuestas correctas en las lecturas observadas; pageerrors: 0.
La prueba no acredita cámara física, iOS ni entrega de notificaciones push.
Impeccable automático no disponible (lanzador 127); revisión visual manual realizada.
Lint, TypeScript, build e i18n (0 claves faltantes) pasan.

## Reproducción con una fixture nueva

**La fixture actual ya está publicada. No volver a ejecutar el recorrido de
escrituras ni E2E_320_RESUME con ella.** Crear otra fixture QA para una ejecución
completa futura. La recomendación histórica de preparación fue sembrada por SQL;
la publicación nueva de este recorrido se ejecutó por UI/API reales.

La configuración playwright.nutrition-real.config.ts no inicia servicios ni
intercepta APIs. El orquestador administra exclusivamente el stack compartido.
E2E_320_FIXTURE apunta a metadata sin secretos; las contraseñas se leen de Windows
Credential Manager exclusivamente en memoria. Trace y vídeo permanecen desactivados;
no exportar cookies, tokens ni capacidades de Storage a logs/HAR.

~~~powershell
$env:E2E_320_FIXTURE='<ruta absoluta a una fixture nueva, sin secretos>'
$env:E2E_BASE_URL='http://127.0.0.1:3056'
$env:E2E_APP_BASE_URL='http://127.0.0.1:5182'
Remove-Item Env:E2E_320_RESUME -ErrorAction SilentlyContinue
corepack yarn e2e --config playwright.nutrition-real.config.ts
~~~

E2E_320_RESUME solo admite evidencia de una ejecución que guardó la comida y aún
no revisó/publicó el cierre: valida paciente/ciclo, etapa e ID de análisis y omite
el registro. Consultar el estado real antes de reanudar cualquier fallo de escrituras.

## Inspección MCP sin secretos

scripts/qa/nutrition-real-open.mjs <metadata> [puerto CDP] [rol] inicia sesión
por UI y deja Nutrición abierta. Roles: patient (defecto), nutritionist o coordinator.
ERP usa E2E_BASE_URL y APP E2E_APP_BASE_URL. Lanzar en background con ventana
oculta, registrar PID y usar un puerto 9200..9299 distinto por rol. El MCP
Playwright puede conectar con browserType().connectOverCDP al puerto local.
No se transmiten contraseñas ni tokens en argumentos de herramientas.

Cerrar navegadores y PIDs propios verificados por ruta/argumentos, nunca procesos
por nombre o por puerto. No reiniciar ni detener el stack compartido.
