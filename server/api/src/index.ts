import { Hono } from "hono";
import { cors } from "hono/cors";
import financien from "./routes/financien";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "https://delogischepartij.nl"],
  })
);

app.route("/api/financien", financien);

app.get("/", (c) => c.json({ status: "ok", service: "DLP Financiën API" }));

export default {
  port: 3001,
  fetch: app.fetch,
};
