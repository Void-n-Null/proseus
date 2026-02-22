import { useEffect, useState } from "react";
import type { DesignTemplateId } from "../../shared/design-templates.ts";
import {
  DESIGN_TEMPLATE_CHANGE_EVENT,
  getActiveDesignTemplateId,
} from "../lib/design-templates.ts";

export function useDesignTemplateId(): DesignTemplateId {
  const [designTemplateId, setDesignTemplateId] = useState<DesignTemplateId>(
    () => getActiveDesignTemplateId(),
  );

  useEffect(() => {
    const sync = () => setDesignTemplateId(getActiveDesignTemplateId());

    sync();

    window.addEventListener(DESIGN_TEMPLATE_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DESIGN_TEMPLATE_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return designTemplateId;
}
