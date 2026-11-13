"use client";

import { useT } from "@/providers/i18n-provider";

/** Etiquetas editoriales del catálogo; el contenido lo escribe el equipo. */
export function MediaTags({ tags }: { tags?: string[] }) {
  const t = useT();
  if (!tags?.length) return null;
  return (
    <ul aria-label={t("Etiquetas")} className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag} className="max-w-full rounded-full bg-primary-soft px-2 py-1 text-xs text-primary-soft-foreground [overflow-wrap:anywhere]">
          {tag}
        </li>
      ))}
    </ul>
  );
}
