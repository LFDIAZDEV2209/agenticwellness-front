# Control de medicamentos en el ERP

Primer circuito: directorio de pacientes y ficha con Hoy, Tratamientos e Historial. El alta manual conserva las indicaciones registradas; no calcula dosis ni prescribe. El acceso está habilitado por defecto para pacientes activos, con restricciones explícitas separadas de los permisos del personal. Una toma/omisión ya registrada se corrige con motivo obligatorio y revisión esperada; el historial conserva ambos eventos.

- `/medications`: búsqueda y paginación del directorio dentro del ámbito autorizado.
- `/medications/[patientId]`: acceso en la app, alta de tratamiento, tomas/omisiones, historial y pausa/reactivación/finalización.
- Entradas desde sidebar/buscador, ficha del paciente y Perfil 360, solo con capacidad y permiso de lectura.

Los contratos están en `coppAddresdBack/docs/modules/medications/contracts.md`. Todos los accesos usan el cliente HTTP del ERP, incluido Bearer, refresh y clínica activa. La API aplica la autorización real.

## Disponibilidad y datos protegidos

`GET /api/v1/me/capabilities` es aditivo. Si no está disponible, el módulo permanece oculto y los demás módulos conservan sus entradas. Se requieren `Medications.View`, `Medications.Manage` y `Medications.ManageAccess` para sus respectivas acciones; gestión no implica habilitar pacientes.

Los recursos y capacidades se separan por usuario/clínica. Un cambio de contexto no reutiliza resultados anteriores. Las capacidades se revalidan al volver a la ventana y cada 30 segundos, conservando formularios durante la comprobación. Los fallos de acceso vuelven a consultar la política y el recurso. No se guardan datos clínicos ni escrituras en localStorage.

Las operaciones de alta y de toma conservan su UUID al reintentar el mismo contenido. Se muestra confirmación solo tras respuesta del servidor; la ficha se vuelve a consultar para reflejar el dato persistido. Las tomas futuras y canceladas no se confirman desde la UI.

## Verificación

```bash
E2E_BASE_URL=http://127.0.0.1:3100 node node_modules/@playwright/test/cli.js test --config=playwright.medications-ui.config.ts
```

Esta suite usa respuestas HTTP sintéticas y prueba la UI, no acredita persistencia PostgreSQL. El primer recorrido falló antes de implementar por ausencia de la ruta/vista Control de medicamentos. Cubre directorio-ficha, habilitación, alta, reintento de toma con la misma operación, correcciones con motivo y revisión, solo lectura, módulo apagado, URL sin permiso, retirada del permiso de gestión, inglés y anchos 390/768/1440.

La suite `playwright.medications-real.config.ts`, mantenida junto al host de integración, verifica aparte el circuito de app, ERP y PostgreSQL reales. No se atribuye a los fixtures sintéticos la entrega de notificaciones, la prueba de iOS físico ni la compatibilidad del binario enviado a Apple.

Seguimiento diario, inventario global/individual, alertas, efectos reportados y auditoría están conectados al backend. Las reglas y límites se documentan en `coppAddresdBack/docs/modules/medications/MONITORING.md`. Recordatorios externos, fotografía e interacciones no se simulan.

## Plan obligatorio y registros personales

El personal con gestión asigna medicamentos/vitaminas desde ERP; se identifican
como **Plan asignado**. Nutracéuticos permanecen adicionales. El paciente puede
registrar productos propios y tomas/omisiones, pero no cambiar el estado del plan.
La ficha muestra `adherence`, calculada por el backend sobre las dosis asignadas
ya programadas del día seleccionado. Registros personales, nutracéuticos, futuras
y canceladas no inflan ni reducen ese porcentaje. Sin dosis evaluables se muestra
`—`. Tomar algo fuera del plan no satisface ninguna dosis asignada.

La prueba `medications-assigned-plan-real.spec.ts` usa ERP/app reales con API/Auth
y PostgreSQL sintéticos aislados. Cubre alta ERP, desvío/toma app, adherencia
compartida, protección del plan y correcciones, sin enviar mensajes externos.


## Secciones del HTML implementadas

La navegación persistente incluye Inicio, Pacientes, Seguimiento diario,
Inventario global, Alertas y Auditoría (requiere Audit.View). La ficha añade
Semana y día, Inventario y Efectos reportados. Exportar seguimiento usa
Medications.Export y registra su finalidad. El usuario de cada fila de auditoría
permite filtrar por actor. Inventario y alertas son paginados y respetan el mismo
ámbito clínico que el directorio. Modo oscuro usa tokens semánticos existentes.
El indicador de acceso es una cifra simple, sin anillo que comprima el texto.

`e2e/medications-monitoring-real.spec.ts` cubre el flujo con API/Auth/PostgreSQL
reales. La bitácora registra consultas/operaciones desde esta entrega; los
registros de escritura anteriores siguen en la auditoría general.
