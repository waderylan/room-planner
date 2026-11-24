import { createServer } from "node:http";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { openServiceDatabase } from "./sqlite";
import { createNodeService } from "./node";

const directory = path.resolve(
  process.env.ROOM_PLANNER_DATA_DIR || ".room-planner",
);
mkdirSync(directory, { recursive: true });
const db = openServiceDatabase(path.join(directory, "service.sqlite"));
const port = Number(process.env.PORT || 8788);
const server = createServer((req, res) => {
  void createNodeService(db)(req, res);
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Room Planner service: http://127.0.0.1:${port}\n`),
);
const stop = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
