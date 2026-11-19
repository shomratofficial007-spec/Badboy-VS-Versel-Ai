import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isOpenRouterConfigured } from "../services/openrouter";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: isOpenRouterConfigured() ? "ok" : "degraded" });
  res.json(data);
});

export default router;
