import { Hono } from "hono";
import db from "../db";

const supporters = new Hono();

supporters.get("/count", (c) => {
  const row = db.query("SELECT COUNT(*) as count FROM subscribers").get() as { count: number };
  return c.json({ count: row.count });
});

export default supporters;
