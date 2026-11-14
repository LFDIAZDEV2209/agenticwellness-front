# 3.14 · Lectura profesional de ingestas

## Alcance y base

Rama `org/f3-coppaddresd-front`, worktree `front-f3`, desde `0ab28dd` de Fase 2.
Solo lectura en la pestaña **Registros de comidas** de `/nutrition/{patientId}`.
La entrega 3.14 no incluía filtros ni revisión. La ampliación 3.15 se documenta en
`INTAKE-REVIEW-CONTRACT.md`; el cierre 3.16–3.17 queda fuera.

Fuentes: `NUTRICION-CICLOS.md`, `ARQUITECTURA.md` §10.1 y mockup oficial
`referencia-claude-f3-nutricion/Nutrición · Bandeja de registros del paciente.png`.
Se adapta su tira y comparación al workspace existente, sin modificar el cuerpo humano del ERP.

## Contrato real 3.7 (`92da468`)

Se verificó con CodeGraph y `git show 92da468` del backend el 14/11/2026:
`Features/Nutrition/Queries/PatientIntakeQuery.cs` y `NutritionReadController.cs`.
Contrato confirmado contra el commit entregado por codex-back; los tests HTTP son sintéticos,
no constituyen QA de integración con la API real. El borde está aislado en
`types/nutrition-intake.ts` y `services/nutrition-intake-service.ts`.

`GET /api/v1/nutrition/patients/{id}/intake?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=100`

```ts
type Macros = {
  calories: number | null; proteinG: number | null; carbsG: number | null;
  fatG: number | null; fiberG: number | null;
};
type Response = {
  from: string; through: string; timezone: string;
  page: number; pageSize: number; totalDays: number; totalPages: number;
  days: Array<{
    localDate: string; cycleId: string | null; cycleNumber: number | null;
    continuity: boolean;
    menu: null | {
      prescriptionId: string; version: number; dayNumber: number;
      meals: Array<{ mealCode: string; name: string | null; planned: Macros }>;
    };
    records: Array<{
      id: string; mealCode: string; recorded: Macros; waterMl: number | null;
      origin: 'ai_estimated' | 'patient_confirmed';
      photo: null | { url: string; expiresAt: string };
      analysis: null | {
        analysisId: string; status: string; estimated: Macros;
        items: Array<{
          name: string; confidence: number; portionSize: string | null;
          estimatedGrams: number | null; estimated: Macros;
        }>;
      };
      patientCorrection: boolean;
    }>;
  }>;
};
```

- El back 3.7 admite solo `ai_estimated` y `patient_confirmed`. La decisión de Luis
  reserva el origen clínico para un canal profesional futuro; `clinical` se rechaza
  como contrato inválido, nunca se acredita por un `source` libre de la app.
- `mealCode`: `des`, `alm`, `mer`, `cen`, `agua`; otros se muestran literalmente.
- `through = min(to, hoy del paciente)`; `days` contiene TODOS los días consultados
  hasta hoy, incluso sin registros, en orden descendente. Días futuros omitidos.
  Se verifica cobertura completa, fechas únicas, metadatos de página y forma de cada registro.
  DTO incompleto, fallo HTTP o 404 **nunca** se convierte en una tira vacía.
- Fechas civiles, zona del workspace, sin convertirlas a la zona del navegador.
  La hora de hoy se obtiene en la zona del paciente. No se aceptan metadatos de otra zona.
- Permisos: `Nutrition.View` + `Nutrition.RecordsView` y alcance por paciente en el servidor.
  Fotos: `Nutrition.PhotosView` + alcance. La UI además evita cualquier solicitud de imagen
  sin `PhotosView`, aunque una respuesta defectuosa incluyera una URL.
- Fotos firmadas por el backend. Se utiliza directamente la URL temporal, sin proxy de
  imágenes de Next, sin firma genérica, sin almacenamiento local y con `referrerPolicy=no-referrer`.
  Caducidad o carga fallida → aviso y **Actualizar foto**, que vuelve a leer intake.
  El temporizador retira también la foto que caduque mientras permanece abierta.
- Valores nulos se muestran como **Sin dato**, nunca como cero. La estimación original IA,
  el registro final corregido por paciente y el menú planificado aparecen por separado.
  No se reconstruye un menú histórico usando el borrador actual.

## Ventanas, estados y continuidad

La prescripción seleccionada determina el ciclo si tiene versión publicada. Si es un
borrador de otro ciclo, se consulta el último ciclo publicado que haya empezado.
Sin ciclo publicado se muestran explícitamente los últimos 30 días, sin inventar un ordinal de ciclo.

Primera consulta: las 30 fechas del ciclo, incluidos futuros en la tira (sin inventar registros).
Segunda consulta, solo si procede: una ventana de hasta 30 días de continuidad, empezando
por la más reciente. **Continuidad anterior/siguiente** navega ventanas contiguas hasta el día 31.
La continuidad termina al empezar el siguiente ciclo publicado. No se consulta por `cycle_id`;
no hay una petición por celda ni una descarga ilimitada de fotos/historial.

- Completo: cada comida del menú de ese día tiene al menos un registro.
- Parcial: hay registros y quedan comidas del menú sin registrar.
- Sin datos: hoy sin registros; no equivale a interrupción.
- Interrupción: día pasado sin registros, excluido de adherencia según la especificación.
- Futuro: no transcurrido, nunca interrupción.
- Con registros · sin menú: sin denominador para evaluar completitud.

Estos estados representan cobertura de comidas, **no cumplimiento calórico**. No se calcula
una puntuación clínica, adherencia ni promedios mezclando fuentes.
El tramo de continuidad conserva el ordinal real después del día 30, sin duplicar fechas.
Color + icono + nombre accesible, selección por teclado, hoy marcado y diseño de una columna en móvil.

## Objetivo de publicación futura 3.17 (revisión de las siete láminas paciente)

Se revisaron los siete PNG de `referencia-claude-f3-nutricion-app/` y su README D0014:

| Lámina | Requisito que deberá respetar 3.17 |
|---|---|
| 1 · Plan con recomendación | Texto al paciente, profesional, fecha de publicación y ciclo; imágenes visibles con pie. |
| 2 · Sin recomendaciones aún | No publicar textos ficticios; la ausencia de cierre es un estado válido. |
| 3 · Fuente no disponible | Un error de recomendaciones no rompe el plan ni los registros; reintento independiente. |
| 4 · Ciclos anteriores | Conserva mensaje, autor, fecha y adjuntos del cierre; D0014 excluye «Programa anterior». |
| 5 · Ciclos anteriores vacío | Sin historial publicado se presenta el vacío, sin duplicar la recomendación actual. |
| 6 · Adjuntos y texto largo | Texto completo accesible, pies conservados, renovación de imagen caducada; sin imágenes también válido. |
| 7 · Plan a 320 px | Nombre, fecha, mensaje y pies legibles sin truncar ni desbordar. |

Contrato objetivo ya documentado por el change:
`GET me/nutrition/cycles/recommendations` → `{ current, previous }`;
`RecommendationDto { cycleNumber, startDate, endDate, publishedAt, professionalName,
patientMessage, attachments: [{ url, caption }] }`.
Solo imágenes `visible_to_patient=true`, firmadas. Nunca `professional_notes`, `ai_draft_json`,
`summary_json` ni identificadores internos de revisión. Esta entrega **no implementa** 3.17.

## Evidencia y traducciones

`e2e/nutrition-intake.spec.ts` usa exclusivamente mocks HTTP: menú por versión/fecha,
estados, continuidad larga y límite del siguiente ciclo, carga/error/reintento, DTO incompleto,
alcance denegado, fotos restringidas/caducadas/ampliables, teclado, 320 px e inglés.
Claves nuevas ES/EN: `INTAKE-I18N.md`.

Verificación del 14/11/2026:

- `corepack yarn lint`, `corepack yarn build`, `corepack yarn i18n:check`: salida 0;
  compilación TypeScript correcta, cero claves ausentes.
- Producción (`next start`, puerto propio 3058): `nutrition-intake.spec.ts` **12/12**
  y `nutrition-workspace-layout.spec.ts` **9/9**.
- Desarrollo (`next dev`, `E2E_BASE_URL=http://localhost:3058`): `nutrition-cycles.spec.ts`
  **4/4** y la suite nueva `nutrition-intake.spec.ts` **12/12**, también bajo StrictMode.
  Los dos casos del laboratorio `/nutrition/cycles-preview` exigen Development;
  su 404 en producción es intencionado. Next dev rechaza recursos desde `127.0.0.1`
  sin `allowedDevOrigins`; usar `localhost`, sin ampliar la configuración del proyecto.
- Playwright MCP: escritorio, modo oscuro, 320 px, detalle y ampliar/cerrar foto;
  30 celdas, sin desborde horizontal ni errores `pageerror`. Capturas locales en
  `qa-reports/3.14-{desktop,desktop-detail,mobile,mobile-top,dark}.png`.
- Chrome DevTools: documento HTTP 200; la lectura funcional se verificó con los
  mocks de Playwright, sin autenticar ni usar registros reales.

Las suites prueban el comportamiento del ERP. El aislamiento por paciente y la firma
real de URLs requieren la entrega y QA del backend 3.7; no se acreditan mediante mocks.
