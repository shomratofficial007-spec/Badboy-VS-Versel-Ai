import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// The Express API currently accepts only small JSON chat/speech requests.
// Keep its limits aligned with the Cloudflare Worker instead of allowing
// arbitrary 20 MB JSON bodies on every route.
app.use(express.json({ limit: "64kb", strict: true }));
app.use(
  express.urlencoded({
    extended: true,
    limit: "16kb",
    parameterLimit: 100,
  }),
);

app.use("/api", router);

// Normalize parser failures so malformed or oversized bodies never fall
// through to Express' HTML error page or expose internal stack traces.
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const parserError = error as { type?: unknown; status?: unknown } | null;
  const errorType = typeof parserError?.type === "string" ? parserError.type : "";
  if (errorType === "entity.too.large") {
    res.status(413).json({
      code: "REQUEST_BODY_TOO_LARGE",
      error: "Request body exceeds the allowed size.",
    });
    return;
  }
  if (errorType === "entity.parse.failed") {
    res.status(400).json({
      code: "INVALID_JSON_BODY",
      error: "Request body contains invalid JSON.",
    });
    return;
  }
  if (errorType === "charset.unsupported" || errorType === "encoding.unsupported") {
    res.status(415).json({
      code: "UNSUPPORTED_REQUEST_ENCODING",
      error: "Request body encoding is not supported.",
    });
    return;
  }

  req.log.error({ errorType: errorType || "unhandled" }, "API request middleware failed");
  res.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    error: "The server could not process the request.",
  });
});

export default app;
