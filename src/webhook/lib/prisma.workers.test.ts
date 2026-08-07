import { beforeEach, describe, expect, it, vi } from "vitest";

const mockD1Binding = { prepare: vi.fn(), batch: vi.fn(), exec: vi.fn() };
const PrismaD1Mock = vi.fn(function PrismaD1() {
  return { provider: "sqlite", adapterName: "@prisma/adapter-d1" };
});

let lastPrismaClientArgs: unknown;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { DB: mockD1Binding } }),
}));

vi.mock("@prisma/adapter-d1", () => ({
  PrismaD1: PrismaD1Mock,
}));

vi.mock("@prisma/client", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("@prisma/client");
  return {
    ...original,
    PrismaClient: class MockPrismaClient {
      constructor(args: unknown) {
        lastPrismaClientArgs = args;
      }
    },
  };
});

describe("Workers prisma client factory", () => {
  beforeEach(() => {
    vi.resetModules();
    PrismaD1Mock.mockClear();
    lastPrismaClientArgs = undefined;
    delete process.env.NEXT_RUNTIME;
  });

  it("builds a PrismaClient backed by the D1 adapter when a DB binding is present", async () => {
    const { getClient } = await import("./prisma");

    getClient();

    expect(PrismaD1Mock).toHaveBeenCalledTimes(1);
    expect(PrismaD1Mock).toHaveBeenCalledWith(mockD1Binding);
    expect(lastPrismaClientArgs).toEqual({ adapter: expect.objectContaining({ provider: "sqlite" }) });
  });

  it("skips runtime schema provisioning on Workers", async () => {
    const { getClient, ensureSchema } = await import("./prisma");

    const prisma = getClient();
    await expect(ensureSchema(prisma as never)).resolves.not.toThrow();

    // The second call is a no-op because the first call marked schemaEnsured.
    await expect(ensureSchema(prisma as never)).resolves.not.toThrow();
  });
});
