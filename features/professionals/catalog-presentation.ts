const presentationKeys = new Map<string, string>([
  ["Physical Therapist (DPT)", "Fisioterapeuta (DPT)"],
  ["Physical Therapy", "Rehabilitación física"],
  ["Occupational Therapy", "Autonomía en actividades diarias"],
  ["Terapia", "Acompañamiento funcional"],
  ["Coordinador/a de atención al paciente.", "Coordinación de la atención de la persona."],
  ["Enfermero/a de práctica avanzada con prescripción.", "Profesional de enfermería de práctica avanzada con facultad para emitir indicaciones."],
  ["Coordinación de cuidados y navegación del paciente.", "Coordinación de cuidados y orientación de la persona."],
  ["Fisiología del ejercicio y prescripción de actividad física.", "Fisiología del ejercicio y recomendaciones de actividad física."],
  ["Tratamiento integral de la obesidad (certificación ABOM).", "Acompañamiento integral en obesidad (certificación ABOM)."],
  ["Terapia ocupacional.", "Apoyo a la autonomía en actividades diarias."],
  ["Coordinación de la atención de la persona.", "Coordinación de la atención de la persona."],
  ["Profesional de enfermería de práctica avanzada con facultad para emitir indicaciones.", "Profesional de enfermería de práctica avanzada con facultad para emitir indicaciones."],
  ["Coordinación de cuidados y orientación de la persona.", "Coordinación de cuidados y orientación de la persona."],
  ["Fisiología del ejercicio y recomendaciones de actividad física.", "Fisiología del ejercicio y recomendaciones de actividad física."],
  ["Acompañamiento integral en obesidad (certificación ABOM).", "Acompañamiento integral en obesidad (certificación ABOM)."],
  ["Apoyo a la autonomía en actividades diarias.", "Apoyo a la autonomía en actividades diarias."],
  ["Nutrición clínica y dietoterapia.", "Orientación nutricional y acompañamiento alimentario."],
  ["Orientación nutricional y acompañamiento alimentario.", "Orientación nutricional y acompañamiento alimentario."],
]);

export function catalogPresentation(
  value: string | null,
  translate: (key: string) => string,
  translateOther?: (key: string) => string,
) {
  if (value === null) return "";
  const key = presentationKeys.get(value);
  return key ? translate(key) : (translateOther?.(value) ?? value);
}
