import { afterEach, describe, expect, it } from "vitest";
import { GET as vapidKey } from "@/app/api/push/vapid-public-key/route";
import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as unsubscribe } from "@/app/api/push/unsubscribe/route";
import { get, post, readJson } from "@/tests/helpers/api";

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

const subscription = {
  endpoint: "https://push.example.com/abc",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

describe("GET /api/push/vapid-public-key", () => {
  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("reports that push is unavailable when no keys are configured", async () => {
    const payload = await readJson<{
      configured: boolean;
      publicKey: string | null;
      subscriptions: number;
    }>(await vapidKey(get("/api/push/vapid-public-key", { workspaceId: WORKSPACE })));

    expect(payload).toMatchObject({ configured: false, publicKey: null, subscriptions: 0 });
  });

  it("exposes the public key and the subscription count once configured", async () => {
    process.env.VAPID_PUBLIC_KEY = "public-key-value";
    process.env.VAPID_PRIVATE_KEY = "private-key-value";
    await subscribe(
      post("/api/push/subscribe", { workspaceId: WORKSPACE, body: subscription }),
    );

    const payload = await readJson<{
      configured: boolean;
      publicKey: string | null;
      subscriptions: number;
    }>(await vapidKey(get("/api/push/vapid-public-key", { workspaceId: WORKSPACE })));

    expect(payload).toMatchObject({
      configured: true,
      publicKey: "public-key-value",
      subscriptions: 1,
    });
  });
});

describe("POST /api/push/subscribe", () => {
  it("stores a subscription and counts it", async () => {
    const response = await subscribe(
      post("/api/push/subscribe", { workspaceId: WORKSPACE, body: subscription }),
    );
    const payload = await readJson<{
      subscription: { id: string; endpoint: string };
      subscriptions: number;
    }>(response);

    expect(response.status).toBe(201);
    expect(payload.subscription.endpoint).toBe(subscription.endpoint);
    expect(payload.subscriptions).toBe(1);
  });

  it("is idempotent for the same endpoint and moves it between workspaces", async () => {
    await subscribe(post("/api/push/subscribe", { workspaceId: WORKSPACE, body: subscription }));
    const second = await subscribe(
      post("/api/push/subscribe", { workspaceId: OTHER, body: subscription }),
    );
    expect((await readJson<{ subscriptions: number }>(second)).subscriptions).toBe(1);

    const other = await readJson<{ subscriptions: number }>(
      await vapidKey(get("/api/push/vapid-public-key", { workspaceId: OTHER })),
    );
    expect(other.subscriptions).toBe(1);

    const mine = await readJson<{ subscriptions: number }>(
      await vapidKey(get("/api/push/vapid-public-key", { workspaceId: WORKSPACE })),
    );
    expect(mine.subscriptions).toBe(0);
  });

  it("rejects a malformed subscription payload", async () => {
    const missingKeys = await subscribe(
      post("/api/push/subscribe", {
        workspaceId: WORKSPACE,
        body: { endpoint: "https://push.example.com/abc" },
      }),
    );
    expect(missingKeys.status).toBe(400);

    const badEndpoint = await subscribe(
      post("/api/push/subscribe", {
        workspaceId: WORKSPACE,
        body: { endpoint: "not-a-url", keys: subscription.keys },
      }),
    );
    expect(badEndpoint.status).toBe(400);
  });
});

describe("POST /api/push/unsubscribe", () => {
  it("removes a stored subscription", async () => {
    await subscribe(post("/api/push/subscribe", { workspaceId: WORKSPACE, body: subscription }));

    const removed = await unsubscribe(
      post("/api/push/unsubscribe", {
        workspaceId: WORKSPACE,
        body: { endpoint: subscription.endpoint },
      }),
    );
    expect(removed.status).toBe(200);
    expect(await readJson(removed)).toEqual({ deleted: true });

    const after = await readJson<{ subscriptions: number }>(
      await vapidKey(get("/api/push/vapid-public-key", { workspaceId: WORKSPACE })),
    );
    expect(after.subscriptions).toBe(0);
  });

  it("404s for an unknown endpoint and validates the body", async () => {
    const missing = await unsubscribe(
      post("/api/push/unsubscribe", {
        workspaceId: WORKSPACE,
        body: { endpoint: "https://push.example.com/unknown" },
      }),
    );
    expect(missing.status).toBe(404);

    const invalid = await unsubscribe(
      post("/api/push/unsubscribe", { workspaceId: WORKSPACE, body: {} }),
    );
    expect(invalid.status).toBe(400);
  });

  it("cannot remove a subscription owned by another workspace", async () => {
    await subscribe(post("/api/push/subscribe", { workspaceId: OTHER, body: subscription }));

    const response = await unsubscribe(
      post("/api/push/unsubscribe", {
        workspaceId: WORKSPACE,
        body: { endpoint: subscription.endpoint },
      }),
    );
    expect(response.status).toBe(404);
  });
});
