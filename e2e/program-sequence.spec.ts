import { test, expect, type Page } from "@playwright/test";
import { mockPatientsHttp } from "./fixtures/patients-http";
import type {
  ProgramTemplate,
  WeeklyDayTask,
  WeeklyDayTaskInput,
} from "../features/program/types";
import type { MediaItem } from "../features/media/types";

const ids = Array.from({ length: 42 }, (_, index) => `podcast-${index + 1}`);
const media: MediaItem[] = ids.map((id, index) => ({
  id,
  title: `Episodio ${index + 1}`,
  author: "Equipo QA",
  description: null,
  category: "Nutricion",
  mediaType: "Podcast",
  status: "Published",
  storageKey: `media/qa-${index}.mp3`,
  thumbnailKey: null,
  contentType: "audio/mpeg",
  fileSizeBytes: 1024,
  durationSecs: 60,
  sortOrder: index + 1,
  day: 1,
  month: 1,
  publishedAt: "2026-11-13",
  createdAt: "2026-11-13",
  createdBy: null,
  updatedAt: null,
}));
const clinicalRows: WeeklyDayTask[] = [
  {
    id: "routine-row",
    weekday: 6,
    weekNumber: 12,
    taskCode: "ejercicio",
    points: 70,
    sortOrder: 2,
    mediaId: null,
    routineId: "routine-original",
    nutritionPlanId: null,
    createdAt: "2026-11-13",
  },
  {
    id: "nutrition-row",
    weekday: 6,
    weekNumber: 12,
    taskCode: "nut",
    points: 60,
    sortOrder: 3,
    mediaId: null,
    routineId: null,
    nutritionPlanId: "nutrition-original",
    createdAt: "2026-11-13",
  },
];

async function fixture(
  page: Page,
  options: {
    editable?: boolean;
    partialFailure?: boolean;
    count?: number;
    unavailable?: boolean;
    english?: boolean;
  } = {},
) {
  await mockPatientsHttp(page, {
    english: options.english,
    permissions: [
      "Program.View",
      "Program.Profile360View",
      "Media.View",
      ...(options.editable === false ? [] : ["Program.Edit"]),
    ],
  });
  const template: ProgramTemplate = {
    id: "sequence-template",
    code: "sequence-83",
    name: "Programa QA 83 días",
    description: null,
    totalWeeks: 12,
    status: "Draft",
    version: 2,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-11-13",
    updatedAt: null,
    publishedAt: null,
    days: [
      {
        id: "generic",
        weekday: 3,
        taskCode: "podcast",
        mediaId: ids[0],
        points: 95,
        sortOrder: 1,
        createdAt: "2026-11-13",
      },
      ...Array.from({ length: 83 }, (_, index): WeeklyDayTask => ({
        id: `row-${index}`,
        weekday: (index % 7) + 1,
        weekNumber: Math.floor(index / 7) + 1,
        taskCode: "podcast",
        mediaId: index === 23 || index === 59 ? null : ids[index % 42],
        points: 80,
        sortOrder: 1,
        createdAt: "2026-11-13",
      })),
      ...structuredClone(clinicalRows),
    ],
  };
  const writes: { week: number; tasks: WeeklyDayTaskInput[] }[] = [];
  let failOnce = options.partialFailure ?? false;
  const control = { unavailable: options.unavailable ?? false };
  await page.route("**/api/v1/media**", (route) => {
    const url = new URL(route.request().url());
    if (control.unavailable)
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Biblioteca indisponible" }),
      });
    const size = Number(url.searchParams.get("pageSize") ?? 100);
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    const all = media.slice(0, options.count ?? 42);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: all.slice((pageNumber - 1) * size, pageNumber * size),
        totalCount: all.length,
        page: pageNumber,
        pageSize: size,
        totalPages: Math.ceil(all.length / size),
      }),
    });
  });
  await page.route("**/api/v1/program/templates**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (request.method() === "PUT") {
      const week = Number(url.searchParams.get("weekNumber"));
      const tasks = request.postDataJSON() as WeeklyDayTaskInput[];
      writes.push({ week, tasks });
      if (failOnce && week === 9) {
        failOnce = false;
        return reply({ detail: "Fallo controlado semana 9" }, 422);
      }
      expect(week).toBeGreaterThan(0);
      expect(tasks.every((task) => task.taskCode === "podcast")).toBe(true);
      expect(tasks.some((task) => week === 12 && task.weekday === 7)).toBe(
        false,
      );
      template.days = [
        ...template.days.filter(
          (row) => row.weekNumber !== week || row.taskCode !== "podcast",
        ),
        ...tasks.map((task) => ({
          ...task,
          id: `saved-${week}-${task.weekday}`,
          weekNumber: week,
          createdAt: "2026-11-13",
        })),
      ];
      return reply(template.days.filter((row) => row.weekNumber === week));
    }
    if (url.pathname.endsWith("/sequence-template")) return reply(template);
    return reply({
      data: [template],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });
  await page.goto("/program/gestion?view=plantillas");
  await page.getByRole("button", { name: "Ver detalles", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: options.english ? "Program template" : "Plantilla de programa",
    exact: true,
  });
  return { template, writes, control, dialog };
}

test("1.21 · 83 días, huecos, C1 y guardado parcial sin tocar referencias clínicas", async ({
  page,
}) => {
  const http = await fixture(page, { partialFailure: true });
  const { dialog } = http;
  await expect(dialog.locator("[data-sequence-day]")).toHaveCount(83);
  await expect(
    dialog.getByRole("button", { name: "Día 84: no existe", exact: true }),
  ).toBeDisabled();
  const stats = dialog.getByRole("region", { name: "Estado de la secuencia" });
  await expect(stats).toContainText("81 / 83");
  await dialog
    .getByRole("button", { name: "Autocompletar huecos", exact: true })
    .click();
  await expect(stats).toContainText("83 / 83");
  await expect(
    stats
      .locator("div")
      .filter({ has: page.getByText("Días que repiten", { exact: true }) }),
  ).toContainText("41");
  await expect(
    dialog.getByRole("button", { name: "Día 24", exact: true }),
  ).toContainText("Episodio 24");
  await expect(
    dialog.getByRole("button", { name: "Día 60", exact: true }),
  ).toContainText("Episodio 18");
  await dialog
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Fallo controlado semana 9",
  );
  await dialog
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Cambios guardados");
  expect(http.writes.map((write) => write.week)).toEqual([4, 9, 9]);
  expect(
    http.template.days.filter((row) => row.taskCode !== "podcast"),
  ).toEqual(clinicalRows);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Ver detalles", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Día 24", exact: true }),
  ).toContainText("Episodio 24");
});

test("1.21 · arrastrar, intercambiar por teclado y guardar sin día 84", async ({
  page,
}, testInfo) => {
  const http = await fixture(page);
  const { dialog } = http;
  const first = dialog.getByRole("button", { name: "Día 1", exact: true });
  const last = dialog.getByRole("button", { name: "Día 83", exact: true });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await first.dispatchEvent("dragstart", { dataTransfer: transfer });
  await last.dispatchEvent("drop", { dataTransfer: transfer });
  await first.dispatchEvent("dragend", { dataTransfer: transfer });
  await expect(last).toContainText("Episodio 1");
  await expect(first).toContainText("Episodio 41");
  await dialog.getByRole("button", { name: "Día 2", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Intercambiar", exact: true })
    .click();
  const third = dialog.getByRole("button", { name: "Día 3", exact: true });
  await third.focus();
  await page.keyboard.press("Enter");
  await expect(third).toContainText("Episodio 2");
  await dialog
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Cambios guardados");
  expect(http.writes.map((write) => write.week)).toEqual([1, 12]);
  expect(http.writes[1].tasks).toHaveLength(6);
  expect(
    http.template.days.filter((row) => row.taskCode !== "podcast"),
  ).toEqual(clinicalRows);
  await page.screenshot({
    path: testInfo.outputPath("sequence-desktop.png"),
    fullPage: true,
  });
});

test("1.21 · lectura sin escrituras, móvil e inglés", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const http = await fixture(page, { editable: false, english: true });
  await expect(http.dialog.locator("[data-sequence-day]")).toHaveCount(83);
  await expect(
    http.dialog.getByRole("button", { name: "Save draft", exact: true }),
  ).toHaveCount(0);
  await expect(
    http.dialog.getByRole("button", {
      name: "Day 84: does not exist",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    await http.dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const scroll = http.dialog.getByRole("region", {
    name: "Podcast sequence",
    exact: true,
  });
  await scroll.focus();
  await expect(scroll).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("sequence-mobile.png"),
    fullPage: true,
  });
  expect(http.writes).toHaveLength(0);
});

test("1.21 · biblioteca caída recuperable y catálogo insuficiente sin relleno inválido", async ({
  page,
}) => {
  const http = await fixture(page, { count: 41, unavailable: true });
  await expect(http.dialog.getByRole("alert")).toContainText(
    "No pudimos cargar la biblioteca",
  );
  http.control.unavailable = false;
  await http.dialog
    .getByRole("button", { name: "Reintentar", exact: true })
    .click();
  await expect(
    http.dialog.getByRole("button", {
      name: "Autocompletar huecos",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    http.dialog.getByText(
      "Se necesitan al menos 42 podcasts publicados para autocompletar.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(http.writes).toHaveLength(0);
});

test("1.21 · elegir de la biblioteca, quitar y deshacer conserva el borrador local", async ({
  page,
}) => {
  const http = await fixture(page);
  await http.dialog
    .getByRole("button", { name: "Día 24", exact: true })
    .click();
  await http.dialog
    .getByRole("button", { name: "Elegir de la biblioteca", exact: true })
    .click();
  const picker = page
    .getByRole("dialog")
    .filter({
      has: page.getByRole("button", {
        name: "Seleccionar Episodio 1",
        exact: true,
      }),
    });
  await picker
    .getByRole("button", { name: "Seleccionar Episodio 1", exact: true })
    .click();
  await picker.getByRole("button", { name: "Añadir 1", exact: true }).click();
  await expect(
    http.dialog.getByRole("button", { name: "Día 24", exact: true }),
  ).toContainText("Episodio 1");
  await http.dialog
    .getByRole("button", { name: "Quitar", exact: true })
    .click();
  await expect(
    http.dialog.getByRole("button", { name: "Día 24", exact: true }),
  ).toContainText("Vacío");
  await http.dialog
    .getByRole("button", { name: "Deshacer", exact: true })
    .click();
  await expect(
    http.dialog.getByRole("button", { name: "Día 24", exact: true }),
  ).toContainText("Episodio 1");
  expect(http.writes).toHaveLength(0);
});
