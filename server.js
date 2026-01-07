import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


// einfache Wartefunktion (PORTABLE)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ---------- SCRAPER ----------
async function scrapeMobile(url) {
  console.log("Scraping URL:", url);

  let browser;

  try {

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-dev-shm-usage"
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // 🔥 ersetzt waitForTimeout()
    await sleep(4000);

    const data = await page.evaluate(() => {

      const safe = sel =>
        document.querySelector(sel)?.innerText?.trim() || "(leer)";

      return {
        title: safe("h1"),
        price: safe('[data-testid="prime-price"], [data-testid="price"]'),
        facts: safe('[data-testid="keyFacts"]'),
        desc: safe('[data-testid="description"]')
      };
    });

    await browser.close();

    return `
Titel: ${data.title}
Preis: ${data.price}
Fahrzeugdaten: ${data.facts}
Beschreibung: ${data.desc}
`;

  } catch (err) {

    console.error("SCRAPER FAILED:", err);

    try { if (browser) await browser.close(); } catch {}

    throw err;
  }
}



// ---------- AI ----------
async function askLLM(promptText, instruction) {

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-nano-12b-v2-vl:free",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein Fahrzeugexperte. Erwähne niemals, dass du keinen Zugriff auf Links hast. Antworte nur anhand der gelieferten Daten."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${instruction}\n\nNUTZE AUSSCHLIESSLICH DIESE DATEN:\n${promptText}`
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OPENROUTER ERROR", data);
      return "Fehler bei AI-Abfrage — bitte später erneut probieren.";
    }

    return data?.choices?.[0]?.message?.content || "Keine Antwort erhalten.";

  } catch (e) {
    console.error("AI ERROR", e);
    return "AI-System aktuell nicht erreichbar.";
  }
}



// ---------- ROUTE ----------
app.post("/api/analyze", async (req, res) => {
  try {

    const { text, question } = req.body;

    if (!OPENROUTER_API_KEY)
      return res.status(500).json({ error: "API-Key fehlt" });

    if (!text)
      return res.status(400).json({ error: "Kein Input erhalten" });


    let vehicleText = "";


    if (text.includes("mobile.de")) {

      console.log("mobile.de erkannt — Scraping…");

      try {
        vehicleText = await scrapeMobile(text);
      } catch (err) {
        console.error("SCRAPER ERROR", err);

        vehicleText =
          `SCRAPER FEHLER — analysiere nur diesen Text:\n${text}`;
      }

    } else {
      vehicleText = text;
    }


    const instruction = question || `
Analysiere dieses Fahrzeug und gib strukturiert aus:

1️⃣ Fahrzeug-Kerndaten
2️⃣ Typische Zuverlässigkeit & Schwachstellen – inkl. Risiko über 100.000 km
3️⃣ Laufleistungs-Risiko
4️⃣ Stärken
5️⃣ Schwächen
6️⃣ Unterhaltskosten realistisch
7️⃣ Verbrauch & Alltag

Benutze klares, verständliches Deutsch.
`;

    const answer = await askLLM(vehicleText, instruction);

    res.json({ answer });

  } catch (err) {
    console.error("SERVER ERROR", err);
    res.status(500).json({ error: "Serverfehler: " + err.toString() });
  }
});



// ---------- HEALTH ----------
app.get("/", (req, res) => res.send("Backend läuft ✅"));



// ---------- START ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("🚀 Backend läuft auf Port", PORT)
);



