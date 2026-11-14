/** Espejo de ExternalMediaRules: un vídeo HTTPS, sin credenciales, fragmento ni puerto alternativo. */
export function parseExternalVideo(
  value: string,
): { provider: "youtube" | "vimeo"; url: string; embedUrl: string } | null {
  try {
    if (value.length > 2048 || /\s/.test(value.trim())) return null;
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port
    )
      return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    let provider: "youtube" | "vimeo";
    let id: string | null = null;
    if (host === "youtu.be") {
      provider = "youtube";
      if (parts.length === 1) id = parts[0];
    } else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "www.youtube-nocookie.com",
      ].includes(host)
    ) {
      provider = "youtube";
      if (parts.length === 2 && ["embed", "shorts"].includes(parts[0]))
        id = parts[1];
      else if (
        parts.length === 1 &&
        parts[0] === "watch" &&
        url.searchParams.getAll("v").length === 1
      )
        id = url.searchParams.get("v");
    } else if (
      ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)
    ) {
      provider = "vimeo";
      if (
        host === "player.vimeo.com" &&
        parts.length === 2 &&
        parts[0] === "video"
      )
        id = parts[1];
      else if (host !== "player.vimeo.com" && parts.length === 1) id = parts[0];
    } else return null;
    if (
      !id ||
      !(provider === "youtube"
        ? /^[\w-]{11}$/.test(id)
        : /^[1-9][0-9]{0,19}$/.test(id))
    )
      return null;
    return provider === "youtube"
      ? {
          provider,
          url: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        }
      : {
          provider,
          url: `https://vimeo.com/${id}`,
          embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
        };
  } catch {
    return null;
  }
}
