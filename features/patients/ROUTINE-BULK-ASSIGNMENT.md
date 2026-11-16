# Rutina masiva desde pacientes (2.21)

Desde Estado clínico, la selección existente permite asignar una rutina activa a
un máximo de 100 pacientes y un rango dentro de las 12 semanas/83 días del programa.
Mantiene pacientes de otras páginas/filtros y descarta la selección al cambiar
usuario, clínica o capacidad. La acción, como podcasts, requiere Admin o
ClinicalDirector y Program.Edit efectivos. El catálogo requiere Wellness.View.

Se reutiliza `fetchExerciseRoutines` con status=Active, búsqueda/paginación y
cancelación de lecturas. Revisar es local: el contrato 2.16 no ofrece preview de
rutinas ni reserva semanas. Confirmar envía exactamente
`{patientIds,routineId,semanaDesde,semanaHasta}` por el cliente autenticado a
`POST /api/v1/program/content/bulk-assign-patient-routines`.
No escribe asignaciones antiguas ni usa el endpoint de podcasts para rutinas.

El resultado respeta `{aplicadas,omitidasSemanaIniciada,omitidasSinAlcance}`:
conteos de pacientes distintos, con posible solapamiento aplicadas/iniciadas.
No inventa un desglose individual que el contrato no proporciona. Solo muestra
los IDs enviados en las omisiones por alcance; elimina duplicados/IDs extra.
Cancelar/revisar no escriben, doble confirmación se bloquea, y no hay reintento
automático después de un fallo o respuesta inválida. Error de rutina, programa,
rango, permiso o conflicto conserva el contexto y exige volver a revisar.

## Bloqueo real de integración

**No declarar 2.21 cerrada ni usarla sobre pacientes reales hasta resolver BACK 2.16.**
En API 5122 e0a9c29, sobre dos pacientes QA nuevos con snapshots futuros vacíos,
asignar semanas 1–3 devuelve aplicadas 1/iniciadas 1 y cambia solo semanas 2/3;
el detalle semanal pasa de 6 misiones por día a solo ejercicio. Faltan 70 misiones
no ejercicio entre las dos semanas. No se afirma borrado del catálogo/plantilla.

Punto a revisar: `BulkPatientContentPlanner.Build` materializa únicamente la clase
solicitada cuando el snapshot está vacío; revisar su interacción con la proyección
del detalle semanal. El contrato DAILY-ROUTINES.md promete conservar podcasts,
nutrición y sus metadatos. Esta entrega no modifica BACK ni disimula el fallo.
Prueba y DTO antes/después en `revision-2.21-front/` del workspace de coordinación.

## Verificación y diseño

19/19 E2E sobre build de producción: 14 nuevos y 5 regresiones de Fase 1/podcasts.
Auth, catálogo y pacientes son sintéticos; la asignación atraviesa HTTP Postman
con el contrato BACK inspeccionado. No acreditan la persistencia real.
Lint completo, TypeScript, build e i18n verdes. La comprobación API/BD real tiene
el fallo de conservación anterior, con snapshots protegidos 3.20/R7 intactos.

Playwright MCP verifica 320/390/1440, claro/oscuro, foco/revisión/resultado y teclado.
Chrome DevTools inspecciona el contexto sintético de solo lectura, sin consola
de error/aviso. No son ensayos de proveedor/Auth/DB reales. Radio nativo dentro
de etiqueta táctil, selectores etiquetados, foco al título y retorno al cerrar.

Skills aplicadas: **design-taste-frontend**, **impeccable**,
**modern-web-guidance**, **i18n-translations** y **accessibility**.
Taste fija un flujo clínico sobrio coherente con el ERP, sin nuevo sistema visual;
Impeccable guía auditoría/pulido y alineación móvil; modern-web-guidance se consultó
antes de escribir CSS/JS, con guías de accesibilidad y tablas responsivas.
Se reutilizan tokens/controles Base UI; no se añadieron container queries, :has
ni View Transitions. 17 claves nuevas ES/EN, sin traducciones en tiempo de definición.
El lanzador global de Impeccable no cargó contexto; se siguieron sus referencias
y el código existente. El detector local salió 0; la auditoría visual se documenta
separadamente y no resuelve el bloqueo de integración.

Con frontend y simulación propios ya iniciados:

```powershell
postman simulation run postman/simulations/patient-routines-erp.sim.yaml --port 4554 --output ndjson --no-history
corepack yarn exec playwright test --config playwright.patient-routines.config.ts
```

La simulación debe lanzarse en background con Start-Process/Hidden. La configuración
de pruebas no inicia servicios. No ejecutar la simulación en primer plano durante
un trabajo interactivo. Las capturas/logs temporales están en qa-reports/patient-routines.
2.22 (aviso de uso de rutina en pacientes con semanas activas) queda para la cola
siguiente, conservando estas mismas guías de diseño y QA.
