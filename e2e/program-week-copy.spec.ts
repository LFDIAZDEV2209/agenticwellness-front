import { expect, test } from "@playwright/test";
import { mockWeekAgendaEditor } from "./fixtures/week-agenda-editor-http";

test("2.19 · copiar podcasts a varias semanas, omitir iniciada y deshacer sin día 84", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  const agenda = await http.open();
  await agenda
    .getByRole("button", { name: "Copiar a otras semanas", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Copiar la semana 2",
    exact: true,
  });
  await dialog.getByRole("radio", { name: "Podcasts", exact: true }).check();
  for (const week of [1, 3, 12])
    await dialog
      .getByRole("checkbox", { name: `Semana ${week}`, exact: true })
      .check();
  await expect(
    dialog.getByRole("region", {
      name: "Vista previa de la copia",
      exact: true,
    }),
  ).toContainText("Semanas a actualizar: 2");
  await expect(dialog).toContainText("Semanas iniciadas omitidas: 1");
  await dialog
    .getByRole("button", { name: "Copiar a las semanas elegidas", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(dialog.getByRole("status")).toContainText("Semanas aplicadas: 2");
  expect(http.state.writes.map((write) => write.week)).toEqual([3, 12]);
  expect(http.state.writes[0].tasks).toHaveLength(7);
  expect(http.state.writes[1].tasks).toHaveLength(6);
  expect(
    http.state.writes
      .flatMap((write) => write.tasks)
      .every(
        (task) =>
          task.taskCode === "podcast" &&
          task.mediaId === "qa-media" &&
          task.points === 80,
      ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Semanas restauradas: 2",
  );
  expect(http.state.writes).toHaveLength(4);
  expect(
    http.state.writes[2].tasks.every(
      (task) => task.reset === true && task.taskCode === "podcast",
    ),
  ).toBe(true);
});

test("2.19 · resultado parcial identifica fallo y conserva el éxito, cancelar no escribe", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  const agenda = await http.open();
  await agenda
    .getByRole("button", { name: "Copiar a otras semanas", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Copiar la semana 2",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(http.state.writes).toHaveLength(0);
  await agenda
    .getByRole("button", { name: "Copiar a otras semanas", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Copiar la semana 2",
    exact: true,
  });
  for (const week of [3, 12])
    await dialog
      .getByRole("checkbox", { name: `Semana ${week}`, exact: true })
      .check();
  await expect(dialog).toContainText("Semanas a actualizar: 2");
  http.state.failedWeeks = [12];
  await dialog
    .getByRole("button", { name: "Copiar a las semanas elegidas", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Semanas aplicadas: 1");
  await expect(dialog.getByRole("status")).toContainText(
    "No se aplicó en las semanas: 12.",
  );
  expect(http.state.writes).toHaveLength(2);
});

test("2.19 · huecos y descanso deshabilitado no se copian ni se cuentan como contenido", async ({
  page,
}, info) => {
  const http = await mockWeekAgendaEditor(page);
  const source = http.details.get(2)!;
  source.days[0].tasks[0].contentRefId = null;
  source.days[0].tasks[0].source = "missing";
  source.days[1].rest = true;
  source.days[1].tasks = source.days[1].tasks.filter(
    (task) => task.taskCode !== "ejercicio",
  );
  const agenda = await http.open();
  await agenda
    .getByRole("button", { name: "Copiar a otras semanas", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Copiar la semana 2",
    exact: true,
  });
  await dialog.getByRole("radio", { name: "Rutinas", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Semana 3", exact: true }).check();
  await expect(dialog).toContainText("Celdas sin contenido que se omiten: 1");
  await expect(dialog).toContainText(
    "Celdas de descanso que se omiten: 1",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("copy-preview-mobile.png") });
  await dialog
    .getByRole("button", { name: "Copiar a las semanas elegidas", exact: true })
    .click();
  await expect(dialog).toContainText("Semanas aplicadas: 1");
  expect(http.state.writes[0].tasks).toHaveLength(5);
  expect(
    http.state.writes[0].tasks.some(
      (task) => task.weekday === 1 || task.weekday === 2 || task.rest,
    ),
  ).toBe(false);
});

test("2.19 · detecta cambio posterior a la vista previa y no pisa esa semana", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  const agenda = await http.open();
  await agenda
    .getByRole("button", { name: "Copiar a otras semanas", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Copiar la semana 2",
    exact: true,
  });
  await dialog.getByRole("checkbox", { name: "Semana 3", exact: true }).check();
  await expect(dialog).toContainText("Semanas a actualizar: 1");
  http.details.get(3)!.days[0].tasks[0].contentRefId = http.routineB;
  await dialog
    .getByRole("button", { name: "Copiar a las semanas elegidas", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Cambiaron y no se sobrescribieron: 3.",
  );
  expect(http.state.writes).toHaveLength(0);
});
