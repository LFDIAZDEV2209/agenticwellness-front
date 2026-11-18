# Control de medicamentos en el ERP

Primer circuito: directorio de pacientes y ficha con Hoy, Tratamientos e Historial. El alta manual conserva las indicaciones registradas; no calcula dosis ni prescribe. Se habilita el acceso del paciente por separado de los permisos del personal. Una toma/omisión ya registrada se corrige con motivo obligatorio y revisión esperada; el historial conserva ambos eventos.

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

Existencias, síntomas, recordatorios, fotografía e interacciones no se ofrecen como controles simulados; corresponden a las siguientes entregas del plan.
