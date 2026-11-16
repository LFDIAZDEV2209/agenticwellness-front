# Aviso de impacto al editar rutinas — 2.22

**Frontend preparado; integración del conteo pendiente del SHA/contrato BACK.**
Luis confirmó que F4 e0a9c29 todavía no expone la cifra. 2.11 añade la captura
histórica de las sesiones completadas; no proporciona un conteo de uso.

Al guardar una edición, el diálogo conserva una copia de los cambios y presenta
una revisión antes del PUT existente. Volver a editar conserva todos los campos
y devuelve el foco a Guardar cambios. Confirmar y guardar envía una sola petición;
durante ella se bloquean doble clic, Escape, cierre y vuelta al formulario.
Los errores conservan la revisión y no provocan reintentos automáticos.
Crear una rutina mantiene su flujo anterior. Se exige Wellness.Manage.

## Adaptador preparado

El detalle `ExerciseRoutine` admite `usageCount?: number | null`. Se consume del
GET existente `/api/v1/wellness/exercise-routines/{id}` cuando BACK lo incluya.
Solo un entero seguro no negativo se muestra como cifra; cero es válido.
Ausencia, null, string, negativo o decimal producen **Uso no disponible**.
No se cuentan asignaciones antiguas, no se enumeran pacientes y no se envía
usageCount en el PUT. La cifra se localiza en ES/EN y diferencia un paciente.
El aviso aclara que el uso puede cambiar antes de guardar: no reserva el alcance.

Si BACK entrega `GET /api/v1/program/routines/{id}/usage` en lugar de ampliar el
DTO, adaptar la lectura a esa ruta y su permiso/alcance documentados; no está
inventada ni invocada en este commit. La UI ya acepta la cifra mediante
`onUsageLoaded`; no presupone su semántica global o un alcance distinto del actor.

Pendiente de integración: contrastar contrato, definición de semana activa,
pacientes distintos, sesiones completadas/legado y alcance/permiso con el SHA
entregado; verificar cero y un caso N positivo contra runtime/BD. No cerrar
globalmente 2.22 hasta entonces. La prueba real pendiente figura como fixme.

## Diseño y verificación

Skills **design-taste-frontend (taste)**, **impeccable**,
**modern-web-guidance**, **i18n-translations** y **accessibility** aplicadas.
Modo Operate/Refine: continuidad del editor clínico, tokens y controles Base UI,
aviso textual y acciones claras, sin nuevo sistema visual ni animaciones.
modern-web-guidance se consultó antes de CSS/JS (guía accessibility); no se añaden
container queries, :has ni View Transitions. El path global de esa skill estaba
ausente y se reutilizó la del repositorio. Impeccable context ya había fallado
en esta sesión; se siguieron sus referencias y el código existente, sin repetir
el lanzador. Detector local exit 0, auditoría visual acotada y sin nuevo pulido.

28 pruebas aprobadas: 15 nuevas de la revisión y 13 regresiones de catálogo,
contraindicaciones, duplicación y demostraciones. Una prueba real pendiente.
Valores usageCount, Auth y catálogo sintéticos; cuatro PUT cruzan HTTP Postman
en la ejecución final (200/403/409/503). No acreditan un conteo ni persistencia
reales. El script de coherencia real se adaptó al nuevo paso y solo se comprobó
su sintaxis; no se ejecutó contra DB en esta entrega.

Build, lint completo, TypeScript e i18n verdes, paridad ES/EN y 11 claves nuevas.
Playwright MCP verifica 320/390/1440 px, foco y tema oscuro con tokens reales;
Chrome DevTools inspecciona una fixture de solo lectura. No se declara ensayo
con dispositivo físico, lector de pantalla ni conformidad WCAG exhaustiva.

Evidencia del workspace: `revision-2.22-front/README.md`.
Con preview propio en 3067 y simulación propia en 4556 ya iniciados:

```powershell
corepack yarn exec playwright test --config playwright.routine-edit.config.ts
```

La configuración no inicia servicios. La simulación
`postman/simulations/routine-edit-erp.sim.yaml` debe lanzarse en background con
Start-Process/Hidden. No hay publicación cloud, push ni cambios a tasks.md.
