import type { Plugin } from "vite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { openServiceDatabase } from "./sqlite";
import { createNodeService } from "./node";

export function plannerServicePlugin(): Plugin {
  return {
    name: "room-planner-service",
    apply: "serve",
    configureServer(server) {
      const directory = path.resolve(
        process.env.ROOM_PLANNER_DATA_DIR ||
          path.join(server.config.root, ".room-planner"),
      );
      mkdirSync(directory, { recursive: true });
      const db = openServiceDatabase(path.join(directory, "service.sqlite"));
      const handle = createNodeService(db);
      server.middlewares.use((req, res, next) => {
        if (
          !/^\/api\/(?:shares(?:[/?]|$)|furniture\/import(?:[?]|$)|health(?:[?]|$))/.test(
            req.url ?? "",
          )
        )
          return next();
        void handle(req, res);
      });
      server.httpServer?.once("close", () => db.close());
    },
  };
}
