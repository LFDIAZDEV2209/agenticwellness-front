# Plantillas · pulido 1.27

Hallazgos de `openspec/changes/organizar-experiencia-bienestar/REVISION-UX-CONSTRUIDO.md`:

- H2b: si la carga de edición devuelve un error, aparece un aviso con el nombre de
  la plantilla y un reintento. El aviso recibe foco para quedar visible incluso en
  móvil. La petición pendiente bloquea acciones que podrían abrir otro diálogo.
- H3: el programa de 12 semanas usa la constante de secuencia de 83 días tanto en
  el listado como al inicializar el formulario. La ayuda del formulario muestra los
  días elegidos y las semanas calculadas; guardar conserva `totalDays: 83` y
  `totalWeeks: 12` sin convertirlos a 84 días.
- H4: el nombre permite dos líneas en la tabla y conserva el título completo;
  las tarjetas muestran el nombre con salto de línea natural.
- H5: a menos de 768 px se muestran tarjetas con estado, duración y acciones con
  texto; en escritorio se conserva la tabla. Ambas vistas comparten las acciones,
  permisos y diálogos existentes. Al redimensionar se monta una sola vista.

Prueba focal: `e2e/program-template-ux.spec.ts` (HTTP sintético), junto a la suite
de fase 1, impacto y editor de secuencia. Incluye reproducción previa de H2b,
recuperación sin escribir, guardado de duración, nombre largo, móvil y cambio de ancho.

Solo dos claves ES/EN nuevas; se reutilizan las de acciones y estados:

| ES / clave | EN |
| --- | --- |
| No se pudo abrir la plantilla | Unable to open the template |
| {days} día{daySuffix} · {weeks} semana{weekSuffix} | {days} day{daySuffix} · {weeks} week{weekSuffix} |

Los sufijos valen `s` en plural y cadena vacía en singular.
