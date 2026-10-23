import express from "express";
import { HttpError } from "./escrow-service.js";

export function createApp(service) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/escrows/:maker/:seed", async (request, response) => {
    response.json(await service.getEscrow(request.params));
  });

  app.post("/escrows/make/transaction", async (request, response) => {
    response.status(201).json(await service.buildMakeTransaction(request.body));
  });

  app.post("/escrows/take/transaction", async (request, response) => {
    response.json(await service.buildTakeTransaction(request.body));
  });

  app.post("/escrows/refund/transaction", async (request, response) => {
    response.json(await service.buildRefundTransaction(request.body));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "Request body must contain valid JSON" });
      return;
    }
    if (error?.type === "entity.too.large") {
      response.status(413).json({ error: "Request body is too large" });
      return;
    }
    console.error("Escrow API request failed", error);
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
