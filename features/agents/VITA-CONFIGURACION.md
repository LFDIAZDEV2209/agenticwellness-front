# Configuración de especialistas para Vita

Entrega ERP de `vita-asistente-integral`, desde `54dfc28`. Se amplían los formularios actuales sin rediseño ni activación remota.

## Recorrido administrativo existente

1. Crear el tipo en `/agents/new`. El estado inicial sigue siendo `Borrador`. Desde `/agents`, edición abre el mismo formulario.
2. Opcionalmente activar **Personalizar selección en Vita**. Introducir temas y palabras clave, un valor por línea (hasta 32 por campo, de 1 a 80 caracteres). Se omiten líneas vacías y se recortan espacios exteriores. Texto y voz empiezan seleccionados al personalizar un agente sin routing. Ningún canal seleccionado produce `channels: []`, no ambos canales.
3. Documentación global: `/agents/knowledge` y `/agents/knowledge/new`. Documentación propia: `/agents/[id]`, tab **Conocimiento**, creación en `/agents/[id]/knowledge/new`. Subir/registrar documentos con los controles existentes y comprobar estado `Listo`.
4. Crear configuración en `/agents/[id]/versions/new`. Activar **Usar conocimiento de documentos** y seleccionar bases globales/propias. Se conservan `knowledge_base_ids` y `top_k`. Subir un `.md/.txt` registra el documento en la KB propia y la vincula al retrieval. Si no existe KB propia, se crea y el upload usa directamente el ID devuelto por el POST, sin esperar un nuevo render ni una lista refrescada. Todo ocurre al guardar esa versión.
5. Elegir las consultas necesarias, todas opcionales:

   | Control | Tool |
   | --- | --- |
   | Mi día | `get_my_day` |
   | Mi nutrición | `get_my_nutrition` |
   | Mis evaluaciones | `get_my_assessments` |
   | Mi podcast | `get_my_podcast` |
   | Mi ejercicio | `get_my_exercise` |
   | Mi progreso | `get_my_progress` |

   Son lecturas del usuario autenticado y del alcance permitido por BACK/AI. La identidad/fecha no se introducen en estos controles. No se añaden citas, completación de tareas ni otras escrituras.
6. Guardar la versión. Son inmutables; la primera se activa automáticamente según el flujo existente y las posteriores se activan en **Versiones**. La activación solicita sincronización al AI Service a través del backend. El guardado y el estado UI no acreditan por sí solos sincronización efectiva, ingestión documental ni disponibilidad móvil.

## Contratos y compatibilidad

- `AgentType.metadata` sigue siendo string JSON o null. Solo se edita `routing.{topics,keywords,channels}`, conservando claves raíz ajenas y opciones desconocidas dentro de routing. Sin cambios de routing se devuelve exactamente el string original, incluso legado.
- Desactivar personalización elimina únicamente `routing`. Sin routing en un objeto metadata válido, BACK proyecta temas/palabras vacíos y canales `text/voice`. Metadata malformada no se sobrescribe al personalizarla: el formulario pide revisión.
- `GetVitaAgentsQueryHandler.Routing` filtra strings de 1..80 caracteres, elimina duplicados sin distinguir mayúsculas y toma hasta 32. Con routing explícito, canales omitidos/vacíos permanecen vacíos.
- JSON → formulario → JSON conserva opciones desconocidas raíz, `retrieval_config` y `memory_config`. Los campos conocidos siguen siendo editables y se pueden vaciar. Abrir JSON avanzado refleja el formulario actual; JSON inválido bloquea guardar/cerrar ese editor para evitar perder la última configuración válida.
- Configuraciones válidas con `tools: []`, sin `tools` o con tools antiguas mantienen su lista. Nuevas versiones conservan defaults previos `calculate/get_current_time`. Las seis lecturas no se autoañaden por ampliar opciones.
- AI documenta un overlay de las seis lecturas para Vita autorizado. Es una decisión independiente del runtime; no interpreta cualquier lista vacía como permiso heredado.

## Publicación, asignación y límites

El catálogo exige paciente activo/consentimiento, instancia activa asignada a su usuario, tipo activo, versión activa coincidente y runtime sincronizado. Temas/tools/retrieval no sustituyen estos requisitos ni conceden permisos. Voz sigue sujeta al adaptador, integración y flags de BACK/AI/APP.

El contrato de asignación quedó desbloqueado por BACK `6c9499405a12247735bda3d91c8a5f08d1a327f5`: `PatientListItemDto` del GET `/api/v1/patients` expone `userId` nullable desde `PatientProfile.UserId`, con los mismos permisos y scope; el POST `/api/v1/agents/instances` exige `Agents.Update`. No se agregan endpoints. El detalle de paciente conserva su contrato anterior. El consumidor extiende localmente el tipo del listado dentro de `features/agents`, sin editar los tipos de otra flota.

### Asignación desde el detalle del agente

1. Abrir `/agents/[id]`. **Asignar agente a un paciente** solo aparece con `Agents.Update` y `Patients.View` o `Patients.ViewOwn` en el contexto actual. El tipo debe estar Activo para operar el control.
2. Buscar y seleccionar al paciente con el selector existente `CatalogSearchSelect` y el servicio `fetchPatients` (página 1, diez resultados, búsqueda server-side). El backend mantiene el filtro de clínica/profesional. No hay consultas a Auth por correo ni sustitución por patientId. Sin `userId`, null o vacío, se explica que falta cuenta vinculada y se bloquean consultas de instancias y el POST.
3. Se consultan `fetchInstances(userId)` al seleccionar y de nuevo antes de confirmar. Una asignación ya existente, activa o inactiva, se informa y bloquea duplicación. Al confirmar, `assignInstance` envía exactamente `{ userId, agentTypeId, metadata: "{}" }`. No asigna a otros pacientes ni modifica instancias existentes. Se vuelve a consultar tras éxito; si esa consulta falla se conserva el resultado creado y se explica que no se pudo refrescar, sin permitir un segundo POST.
4. Un error de consulta bloquea el POST y ofrece reintentar. Un rechazo del POST conserva selección, explica el error y permite un reintento que vuelve a consultar primero. Los controles se bloquean durante el envío, con guard contra doble acción. Cambiar actor/clínica descarta selección y consultas del alcance previo.

Asignar no publica ni sincroniza por sí solo; se mantienen los requisitos de versión activa, consentimiento y runtime. El control no reactiva ni elimina una instancia inactiva previa: informa de ella. El historial del bloqueo y la evidencia del contrato están en `openspec/changes/vita-asistente-integral/handoffs/erp-bloqueo-selector.md` del workspace compartido.

El upload sin KB propia ya está corregido: `useAgentKnowledge.handleCreateBase` devuelve la KB creada y `uploadInstructionsDocument` usa esa respuesta. La prueba sintética acredita crear KB → PUT storage → registrar documento → guardar versión con retrieval habilitado y el ID nuevo, incluso si la lista consultada sigue obsoleta. Si la respuesta de creación carece de ID, se muestra el error existente y se conserva el archivo seleccionado; no hay PUT ni registro ni versión. No se acreditan embeddings/indexación reales.

## Validación reproducible

Con dependencias instaladas (`yarn install --immutable`), iniciar un Next dev propio en background en 3067. No reutilizar ni detener servicios ajenos. Esta configuración de tests no inicia servidor:

```powershell
yarn playwright test --config features/agents/tests/playwright.config.ts
yarn lint
yarn tsc --noEmit
yarn i18n:check
yarn build
git diff --check
```

25 pruebas: ocho de roundtrip/contrato, seis recorridos UI originales/upload y once de asignación. Se prueban selección y userId exacto distinto de patientId, vínculo null/ausente, permisos insuficientes (incluido el falso `Agents.Edit`), lectura propia, asignación existente, 403 y reintento, consulta denegada y mensajes/controles en inglés a 390 px. El arnés HTTP bloquea APIs desconocidas. No hay escrituras en servidores compartidos ni prueba de autorización, persistencia, sincronización o disponibilidad móvil reales.

Revisión visual manual con Playwright MCP a 1440 y 390 px: sin overflow, leyendas/labels explícitos, foco visible y controles existentes. La suite comprueba foco de error, Space para voz y estados accesibles de tools/KBs. Chrome DevTools MCP no abrió contexto porque el perfil estaba ocupado; el navegador ajeno quedó intacto. Detector Impeccable: exit 127 (no disponible); revisión manual acotada sin instalar/reconfigurar el gate. Postman CLI 1.76.0 no ofrece `postman status`; evidencia funcional de Playwright/roundtrip local, sin nuevos recursos remotos.

## Claves nuevas ES/EN

23 claves añadidas al final de ambos diccionarios sin reformatear claves previas. `Canales` y `Texto` ya existían; se conserva el inglés previo `Text:`.

- `Selección del agente en Vita`
- `Orienta la selección por tema y canal. Requiere agente y versión activos, sincronización y asignación autorizada al paciente; no concede permisos.`
- `Personalizar selección en Vita`
- `Sin personalización: conserva la selección existente y admite texto y voz cuando no hay routing.`
- `Un valor por línea. Máximo 32 valores por campo, de 1 a 80 caracteres cada uno. Las líneas vacías se omiten.`
- `Temas`
- `Palabras clave`
- `Voz`
- `Sin canales seleccionados, Vita no seleccionará este agente para texto ni voz.`
- `Revisa los valores: máximo 32 por campo y 80 caracteres por valor.`
- `No se puede modificar la selección de Vita porque los metadatos existentes no son un objeto válido. Conserva la configuración anterior y solicita su revisión.`
- `Mi día`
- `Consulta las tareas y el estado del programa de hoy`
- `Mi nutrición`
- `Consulta el menú vigente de hoy`
- `Mis evaluaciones`
- `Consulta las evaluaciones asignadas sin mostrar respuestas`
- `Mi podcast`
- `Consulta el podcast asignado para hoy`
- `Mi ejercicio`
- `Consulta el ejercicio o descanso de hoy`
- `Mi progreso`
- `Consulta los registros de progreso, XP y racha`

La ampliación de asignación añade otras 13 claves (36 nuevas en total desde `54dfc28`):
- `Asignar agente a un paciente`
- `Selecciona un paciente y confirma la asignación a su cuenta vinculada. La disponibilidad en Vita requiere versión activa, sincronización y consentimiento.`
- `Activa el tipo de agente antes de asignarlo.`
- `Buscar paciente para asignar`
- `No se pudieron buscar pacientes. Reintenta la búsqueda.`
- `Este paciente no tiene una cuenta de usuario vinculada. Vincula su cuenta antes de asignar el agente.`
- `Asignar agente`
- `Consultando asignación`
- `No se pudo consultar la asignación. Reintenta antes de asignar.`
- `Este paciente ya tiene una asignación de este agente.`
- `Agente asignado a la cuenta vinculada del paciente.`
- `No se pudo asignar el agente. Revisa los permisos o si ya está asignado e inténtalo de nuevo.`
- `La asignación se guardó, pero no se pudo actualizar su estado. Vuelve a seleccionar el paciente para consultarlo.`
