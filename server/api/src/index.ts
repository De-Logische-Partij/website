import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import financien from "./routes/financien";
import aanmelden from "./routes/aanmelden";
import supporters from "./routes/supporters";
import { standpunten, adminStandpunten } from "./routes/standpunten";
import { vragen, adminVragen } from "./routes/vragen";
import { discussie, adminDiscussie } from "./routes/discussie";
import { inzendingen, adminInzendingen } from "./routes/inzendingen";
import begroting from "./routes/begroting";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "https://delogischepartij.nl"],
  })
);

app.route("/api/financien", financien);
app.route("/api/aanmelden", aanmelden);
app.route("/api/supporters", supporters);
app.route("/api/standpunten", standpunten);
app.route("/api/admin/standpunten", adminStandpunten);
app.route("/api/vragen", vragen);
app.route("/api/admin/vragen", adminVragen);
app.route("/api/discussie", discussie);
app.route("/api/admin/discussie", adminDiscussie);
app.route("/api/inzendingen", inzendingen);
app.route("/api/admin/inzendingen", adminInzendingen);
app.route("/api/begroting", begroting);

app.use("/*", serveStatic({ root: "../../public" }));

export default {
  port: 3001,
  fetch: app.fetch,
};
