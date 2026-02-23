/**
 * Usage Routes — cost tracking API endpoints.
 *
 * GET /api/usage            — filtered usage summary
 * GET /api/usage/providers  — lifetime cost per provider
 */

import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { getProviderLifetimeCost, getUsageSummary } from "../db/usage.ts";
import type { ListProviderCostsResponse, ListUsageResponse } from "../../shared/api-types.ts";

export function createUsageRouter(db: Database) {
  const router = new Hono();

  // ── GET / — filtered usage summary ──
  router.get("/", (c) => {
    const provider = c.req.query("provider");
    const model = c.req.query("model");
    const chatId = c.req.query("chat_id");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");

    const usage = getUsageSummary(db, {
      provider: provider || undefined,
      model: model || undefined,
      chatId: chatId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return c.json({ usage } satisfies ListUsageResponse);
  });

  // ── GET /providers — lifetime cost per provider ──
  router.get("/providers", (c) => {
    const provider = c.req.query("provider");
    const providers = getProviderLifetimeCost(db, provider || undefined);

    return c.json({ providers } satisfies ListProviderCostsResponse);
  });

  return router;
}
