import type { DesignTemplateId } from "../../shared/design-templates.ts";
import type { TemplateModule } from "./types.ts";
import { forgeTemplate } from "./forge/index.ts";
import { discordTemplate } from "./discord/index.ts";
import { chubTemplate } from "./chub/index.ts";

/**
 * Maps every `DesignTemplateId` to its `TemplateModule`.
 *
 * Adding a new template:
 *   1. Create `src/client/templates/{id}/` with components + barrel
 *   2. Import the barrel here
 *   3. Add the entry below
 *   4. Add the id to `DesignTemplateId` in `src/shared/design-templates.ts`
 */
const TEMPLATE_REGISTRY: Record<DesignTemplateId, TemplateModule> = {
  forge: forgeTemplate,
  discord: discordTemplate,
  chub: chubTemplate,
};

export function getTemplate(id: DesignTemplateId): TemplateModule {
  return TEMPLATE_REGISTRY[id];
}

export type { TemplateModule } from "./types.ts";
