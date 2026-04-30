// Scrape today's events from Eventbrite Pankow and write events.json at repo root.
// Combines JSON-LD ItemList metadata with rendered card text (where the time-of-day lives).

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const URL = "https://www.eventbrite.de/d/germany--berlin--pankow/events--today/?page=1";
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "events.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function berlinDate() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

async function main() {
  console.log("Launching browser…");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();

  console.log("Navigating to", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for the JSON-LD ItemList AND for at least one event card to be rendered.
  await page.waitForSelector('script[type="application/ld+json"]', { state: "attached", timeout: 30000 });
  try {
    await page.waitForSelector("section.discover-vertical-event-card", { timeout: 30000 });
  } catch (e) {
    console.warn("No event cards detected within 30s — page may have served a different layout.");
  }
  // Give cards a moment to fully hydrate (time strings appear after initial render).
  await page.waitForTimeout(2500);

  const events = await page.evaluate(() => {
    // 1) Parse JSON-LD ItemList for canonical event metadata.
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let items = [];
    for (const s of scripts) {
      try {
        const obj = JSON.parse(s.textContent);
        if (obj && obj["@type"] === "ItemList" && Array.isArray(obj.itemListElement)) {
          items = obj.itemListElement.map((x) => x.item).filter(Boolean);
          break;
        }
      } catch (_) {
        // skip malformed
      }
    }

    // 2) Map data-event-id -> visible time string ("heute um HH:MM" / "ab HH:MM" / etc.)
    const timeById = {};
    document.querySelectorAll("section.discover-vertical-event-card").forEach((card) => {
      const link = card.querySelector("a[data-event-id]");
      if (!link) return;
      const id = link.getAttribute("data-event-id");
      if (timeById[id]) return;
      const txt = (card.innerText || "").trim();
      const m = txt.match(/(\d{1,2}):(\d{2})/);
      timeById[id] = m ? m[1].padStart(2, "0") + ":" + m[2] : "";
    });

    // 3) Map data-event-id -> clean URL path.
    const slugById = {};
    document.querySelectorAll("a[data-event-id]").forEach((a) => {
      const id = a.getAttribute("data-event-id");
      if (slugById[id]) return;
      try {
        slugById[id] = new URL(a.href).pathname;
      } catch (_) {}
    });

    // 4) Combine.
    const out = items
      .map((it) => {
        const url = it.url || "";
        const idMatch = url.match(/-(\d+)(?:\?|$)/);
        const id = idMatch ? idMatch[1] : "";
        const loc = it.location || {};
        const addr = loc.address || {};
        return {
          time: timeById[id] || "",
          title: it.name || "",
          venue: loc.name || "",
          address: addr.streetAddress || "",
          path: slugById[id] || "",
          startDate: it.startDate || "",
        };
      })
      .filter((e) => e.title && e.time);

    out.sort((a, b) => a.time.localeCompare(b.time));
    return out;
  });

  await browser.close();

  // Filter to events whose startDate matches today in Berlin (defense-in-depth: the URL says
  // "today" but Eventbrite's interpretation of that depends on the request context).
  const todayBerlin = berlinDate();
  const filtered = events.filter((e) => !e.startDate || e.startDate === todayBerlin);

  if (filtered.length === 0) {
    console.warn("WARNING: scraper found 0 events. Refusing to overwrite events.json with empty list.");
    process.exit(2);
  }

  // Strip startDate from output (already filtered).
  const cleaned = filtered.map(({ startDate, ...rest }) => rest);

  const payload = {
    snapshotDate: todayBerlin,
    fetchedAt: new Date().toISOString(),
    source: URL,
    events: cleaned,
  };

  await mkdir(REPO_ROOT, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${cleaned.length} events for ${todayBerlin} to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
