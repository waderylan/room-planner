import type { SharingDatabase } from "../sharing/database";
import { handleServiceRequest } from "./router";

interface Environment {
  DB: SharingDatabase;
  ALLOWED_ORIGINS?: string;
}
export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    return handleServiceRequest(request, env.DB, {
      clientAddress: request.headers.get("cf-connecting-ip") ?? "unknown",
      ...(env.ALLOWED_ORIGINS
        ? {
            allowedOrigins: env.ALLOWED_ORIGINS.split(",")
              .map((origin) => origin.trim())
              .filter(Boolean),
          }
        : {}),
    });
  },
};
