declare module "../artifacts/api-server/dist/app.mjs" {
  import type { RequestHandler } from "express";

  const app: RequestHandler;
  export default app;
}
