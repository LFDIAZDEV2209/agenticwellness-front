import type { MediaCategory } from "./index";

/** Contrato ERP 4.6b: ayuda editorial efímera, sin archivo ni publicación. */
export interface PodcastMetadataInput {
  title: string;
  language: "es" | "en";
  context: string;
}

export interface PodcastMetadataDraft {
  description: string;
  category: MediaCategory;
  tags: string[];
}

export type PodcastMetadataResult =
  | { status: "ok"; isEstimate: true; draft: PodcastMetadataDraft; model: string | null; generatedAt: string }
  | { status: "unavailable"; isEstimate: true; draft: null; model: null; generatedAt: null };
