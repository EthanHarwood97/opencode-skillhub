import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"

export const server = setupServer(
  http.get("/api/brief", () => new HttpResponse(null, { status: 404 })),
  http.get("/api/skills", () => HttpResponse.json({ total: 0, page: 1, pageSize: 200, items: [] })),
)
