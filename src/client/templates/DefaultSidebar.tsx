import React from "react";
import type { SidebarLayoutProps } from "./types.ts";

/**
 * Default sidebar layout — used by Forge and Chub.
 *
 * Renders the active panel for templates that use the shared sidebar shell.
 *
 * Desktop navigation now lives in the template top bar, so this component only
 * selects which panel render-prop to show.
 */
export default function DefaultSidebar({
  view,
  renderCharacters,
  renderPersonas,
  renderChats,
}: SidebarLayoutProps) {
  return (
    <>
      {view === "characters"
        ? renderCharacters()
        : view === "personas"
          ? renderPersonas()
          : renderChats()}
    </>
  );
}
