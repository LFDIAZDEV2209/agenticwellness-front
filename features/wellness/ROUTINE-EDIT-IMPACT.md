# Aviso de impacto al editar rutinas — 2.22

Integrado con BACK **9b901d7**. El controlador y su documentación declaran
GET /api/v1/program/routines/{id}/usage, con Wellness.View. La ruta citada
inicialmente bajo wellness/exercise-routines no existe en ese commit.
Se conserva el GET de detalle y se consulta el uso por separado al revisar.

## Contrato y comportamiento

RoutineUsageDto contiene routineId, patientCount, enrollmentCount y activeWeekCount.
parseRoutineUsage valida el ID solicitado y tres enteros seguros no negativos.
La UI presenta patientCount; no confunde inscripciones o semanas con pacientes.
No usa el antiguo usageCount opcional del DTO de detalle: se retiró esa suposición.
Cero es un resultado válido del servidor y está limitado al alcance del actor.
El aviso declara ese alcance y que el conteo puede cambiar antes de guardar.

Cada revisión hace una lectura fresca, cancelable al volver/cerrar/cambiar contexto.
Mientras carga muestra skeleton/estado y deshabilita Confirmar y guardar. Red,
403/404/5xx o respuesta inválida muestran Uso no disponible con Reintentar;
no se convierten en cero ni bloquean permanentemente la edición. El fallo de
esta lectura no altera los campos ni dispara un PUT. Reintentar solo consulta.

Guardar cambios conserva una copia local y presenta la revisión. Volver a editar
conserva campos/foco. Confirmar y guardar es la única acción de guardado; bloquea
doble envío/cierre durante el PUT y mantiene la revisión ante errores, sin retry
automático. Crear mantiene su flujo anterior; editar requiere Wellness.Manage.
El PUT conserva su contrato y nunca incluye el DTO de uso ni IDs de pacientes.

## Verificación

- **54/54** adaptador/UI/HTTP Postman, 0 omitidas/fallos/flaky; 38,82 s.
  Incluye 21 casos del adaptador, 20 de revisión y 13 regresiones 2.20a/b/c.
- **3/3** integración con host QA del backend exacto 9b901d7 y PostgreSQL READ ONLY:
  HTTP 401/403/404 y UI con conteo positivo/cero por alcance; 4,40 s.
- Build, lint completo, TypeScript, i18n y detector Impeccable verdes; dos claves
  nuevas en esta integración, paridad ES/EN. Sentinelas 3.20/R7 conservadas por hash.
- La captura real fue 301 pacientes / 301 inscripciones / 979 semanas. Es evidencia
  de esta consulta y actor QA, no un número fijo del producto.

El host usa controlador, MediatR, guard, store, resolver y EF reales. JWT y
ICurrentContext/IPatientScopeActor son adaptadores QA sintéticos; no acredita
login Auth, introspección scoped real ni despliegue a 5122. Catálogo y formulario
son sintéticos en la UI, el GET de uso atraviesa HTTP hasta PostgreSQL real.
No se escribieron rutinas ni datos de negocio reales en esta entrega.
La API compartida e0a9c29 se conserva; el orquestador despliega BACK cuando proceda.

## Diseño y evidencia

Skills aplicadas: **design-taste-frontend (taste)**, **impeccable**,
**modern-web-guidance**, **i18n-translations** y **accessibility**.
Operate/Refine conserva identidad, controles Base UI y tokens. Guidance consultada
antes de JS/CSS, guía dialog, adaptada al componente compartido sin migrar
primitivas fuera de alcance. Sin nuevas container queries, :has ni transiciones.
Impeccable context ya había fallado en esta sesión: referencias/código existente,
detector local 0 y una inspección visual acotada. No nuevo sistema visual.
Playwright MCP: 320/390/1440, oscuro, fallback 403, foco y controles; DevTools:
fixture de lectura sin errores/avisos. No certificación WCAG integral ni prueba AT.

Evidencia: revision-2.22-front/integracion-9b901d7/README.md del workspace.
El histórico a9cde7f se conserva en previous-a9cde7f. La integración elimina el
fixme anterior; no quedan pruebas de conteo silenciadas en la suite.

## Reproducción

Con preview propio 3067 y Postman propio 4556 ya iniciados:

    corepack yarn exec playwright test --config playwright.routine-edit.config.ts

Simulación: postman/simulations/routine-edit-erp.sim.yaml. Lanzar siempre en
background con Start-Process/Hidden; la configuración de pruebas no inicia nada.

Para la integración real, scripts/qa/routine-usage-host/RoutineUsageHost.csproj
referencia un checkout BACK exacto mediante -p:BackendSource=<ruta-9b901d7>.
Compilar con dotnet build a un output QA propio. Antes de arrancar el DLL con
Start-Process/Hidden, definir COP_222_SETTINGS como el appsettings.Development.json
local existente y COP_222_PRIVATE_CONFIG como una ruta privada temporal. El host
solo escucha en 127.0.0.1:5196, fuerza PostgreSQL local READ ONLY y genera el JWT
sintético en ese archivo; nunca imprimirlo ni añadirlo al repo. Esperar /health
y el archivo privado antes de ejecutar:

    corepack yarn exec playwright test --config playwright.routine-usage-real.config.ts

Ese runner exige COP_222_PRIVATE_CONFIG y no tiene skip/fallback silencioso.
El helper routine-usage-snapshot.py compara sentinelas antes/después, solo lectura.
Al terminar cerrar únicamente los PIDs propios comprobados y retirar el archivo
privado. No reiniciar servicios compartidos, publicar, hacer push ni tocar tasks.md.
