"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { rainbowStyle } from "@/lib/ui/rainbow";
import { useT } from "@/providers/i18n-provider";

export function IdentityConflictNotice({
  id,
  owner,
  href,
}: {
  id: string;
  owner?: { firstName?: string | null; lastName?: string | null } | null;
  href?: string;
}) {
  const t = useT();
  const name = href ? [owner?.firstName, owner?.lastName].filter(Boolean).join(" ").trim() : "";

  return (
    <div
      id={id}
      role="status"
      className="flex min-w-0 items-start gap-2 rounded-lg border border-(--rainbow-border) bg-(--rainbow-soft) px-3 py-2 text-[13px] leading-normal text-(--rainbow-fg)"
      style={rainbowStyle("amber")}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 wrap-anywhere">
        {name ? t("En uso por") : t("Ya está en uso.")}
        {href && (
          <>
            {" "}
            <Link href={href} className="rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
              {name || t("Ver perfil")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
