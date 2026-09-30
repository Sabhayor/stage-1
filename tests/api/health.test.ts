import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { get, readJson } from "@/tests/helpers/api";

describe("GET /api/health", () => {
  it("reports the storage driver and a database timestamp", async () => {
    const response = await GET(get("/api/health"));

    expect(response.status).toBe(200);
    const payload = await readJson<{
      status: string;
      storage: { driver: string; persistent: boolean; configured: boolean };
      databaseTime: string;
    }>(response);

    expect(payload.status).toBe("ok");
    expect(payload.storage.driver).toBe("pglite");
    // The injected test database is in-memory.
    expect(payload.storage.persistent).toBe(false);
    expect(Number.isNaN(Date.parse(payload.databaseTime))).toBe(false);
  });

  it("returns JSON content type", async () => {
    const response = await GET(get("/api/health"));
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
