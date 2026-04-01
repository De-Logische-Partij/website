import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import financien from "./routes/financien";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "https://delogischepartij.nl"],
  })
);

app.route("/api/financien", financien);

app.use("/*", serveStatic({ root: "../../public" }));

export default {
  port: 3001,
  fetch: app.fetch,
};
