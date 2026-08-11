import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const docsDir = resolve(repoRoot, "docs");
const archDocPath = resolve(docsDir, "technical-architecture.md");
const readmePath = resolve(repoRoot, "README.md");

function readDoc(path: string): string {
  return readFileSync(path, "utf-8");
}

function markdownLinks(content: string): Array<{ text: string; target: string }> {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ text: string; target: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    links.push({ text: m[1], target: m[2] });
  }
  return links;
}

describe("README discoverability", () => {
  it("exists", () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  it("links to docs/technical-architecture.md", () => {
    const content = readDoc(readmePath);
    const links = markdownLinks(content);
    const docLink = links.find(
      (l) => l.target === "docs/technical-architecture.md",
    );
    expect(docLink).toBeTruthy();
  });
});

describe("docs/technical-architecture.md", () => {
  const content = readDoc(archDocPath);

  it("exists", () => {
    expect(existsSync(archDocPath)).toBe(true);
  });

  describe("end-to-end capture flow", () => {
    it("describes capture route path", () => {
      expect(content).toMatch(
        /src\/webhook\/app\/\[id\]\/\[\[...path\]\]\/route\.ts/,
      );
    });

    it("describes reading request body up to MAX_BODY_BYTES", () => {
      expect(content).toMatch(/MAX_BODY_BYTES/);
      expect(content).toMatch(/1 MiB/);
      expect(content).toMatch(/readBoundedBody/i);
    });

    it("describes storing captured request via insertCapturedRequest", () => {
      expect(content).toMatch(/insertCapturedRequest/);
    });

    it("describes storage destinations for both hosting modes", () => {
      expect(content).toMatch(/SQLite file/);
      expect(content).toMatch(/Cloudflare D1/);
    });

    it("documents that capture always acknowledges sender even on storage failure", () => {
      expect(content).toMatch(/always returns HTTP 200/);
      expect(content).toMatch(/failure is logged but never surfaced/);
    });

    it("describes 404 for missing or expired webhooks", () => {
      expect(content).toMatch(/404.*missing.*expired/);
    });
  });

  describe("inspector UI and management API flow", () => {
    it("describes the inspector UI component", () => {
      expect(content).toMatch(/inspector\.tsx/);
    });

    it("describes the management API endpoint table", () => {
      expect(content).toMatch(/POST/);
      expect(content).toMatch(/\/api\/webhooks/);
      expect(content).toMatch(/GET.*\/api\/webhooks\/:id\/requests/);
      expect(content).toMatch(/DELETE.*\/api\/webhooks\/:id/);
    });

    it("points to the OpenAPI spec and reference", () => {
      expect(content).toMatch(/\/openapi\.json/);
      expect(content).toMatch(/\/api\/reference/);
    });
  });

  describe("storage layer — both hosting modes", () => {
    it("describes SQLite file-based storage for Node.js/Docker", () => {
      expect(content).toMatch(/File-based SQLite.*DB_PATH/);
    });

    it("describes Cloudflare D1 for Workers", () => {
      expect(content).toMatch(/D1 binding/);
      expect(content).toMatch(/@prisma\/adapter-d1/);
    });

    it("describes runtime detection via Cloudflare context probe", () => {
      expect(content).toMatch(/Cloudflare context.*probe/);
      expect(content).toMatch(/NEXT_RUNTIME/);
    });
  });

  describe("schema provisioning — both hosting modes", () => {
    it("describes runtime provisioning on Node.js/Docker", () => {
      expect(content).toMatch(/At runtime on first use/);
      expect(content).toMatch(/ensureSchema/);
    });

    it("describes deploy-time migration on Cloudflare Workers", () => {
      expect(content).toMatch(/At deploy time/);
      expect(content).toMatch(/wrangler d1 migrations apply/);
    });
  });

  describe("expiry purge — both hosting modes", () => {
    it("describes periodic in-process purge on Node.js/Docker", () => {
      expect(content).toMatch(/In-process periodic timer/);
      expect(content).toMatch(/setInterval/);
    });

    it("describes scheduled purge on Cloudflare Workers", () => {
      expect(content).toMatch(/Cron Trigger/);
      expect(content).toMatch(/scheduled/);
    });

    it("describes 7-day expiry and purgeExpiredWebhooks", () => {
      expect(content).toMatch(/7 days/);
      expect(content).toMatch(/purgeExpiredWebhooks/);
    });
  });

  describe("configuration surface", () => {
    it("covers DB_PATH", () => {
      expect(content).toMatch(/DB_PATH/);
    });

    it("covers rate limiting", () => {
      expect(content).toMatch(/DISABLE_RATE_LIMIT/);
    });

    it("covers per-IP quota", () => {
      expect(content).toMatch(/WEBHOOK_QUOTA/);
      expect(content).toMatch(/DISABLE_WEBHOOK_QUOTA/);
    });
  });

  describe("deployment paths", () => {
    it("describes Docker image and Compose deployment", () => {
      expect(content).toMatch(/Docker image and Compose/);
      expect(content).toMatch(/docker-compose\.yml/);
    });

    it("describes Cloudflare Workers deployment via CI", () => {
      expect(content).toMatch(/Cloudflare Workers via CI/);
      expect(content).toMatch(/deploy-cf\.yml/);
    });
  });

  describe(".NET Testcontainers module pointer", () => {
    it("points to the Testcontainers module documentation", () => {
      expect(content).toMatch(/DKNet\.Tests\.WebsiteHook/);
      expect(content).toMatch(/src\/TestContainer\.Webhook/);
    });
  });

  describe("in-repository link resolution", () => {
    const links = markdownLinks(content);

    it("has at least one link", () => {
      expect(links.length).toBeGreaterThan(0);
    });

    links.forEach((link) => {
      const isExternal = /^https?:/i.test(link.target) || link.target.startsWith("#");
      if (isExternal) return;

      const base = dirname(archDocPath);
      const decoded = decodeURIComponent(link.target);
      const resolved = resolve(base, decoded);

      it(`link "${link.text}" → ${link.target} resolves`, () => {
        expect(
          existsSync(resolved),
          `Expected ${resolved} to exist (from docs/technical-architecture.md link "${link.target}"), but it does not`,
        ).toBe(true);
      });
    });
  });
});
