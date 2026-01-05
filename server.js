import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


// ---------- SCRAPER ----------
async function scrapeMobile(url) {
  console.log("Starte Scraper…", url);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process"
    ]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  );

  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  const data = await page.evaluate(() => {
    const get = sel => document.querySelector(sel)?.innerText || "";

    return {
      title: get("h1"),
      price: get('[data-testid="prime-price"]'),
      details: get('[data-testid="keyFacts"]'),
      description: get('[data-testid=\"description\"]')
    };
  });

  await browser.close();

  return `
Titel: ${data.title}
Preis: ${data.price}
Details: ${data.details}
Beschreibung: ${data.description}
`;
}



// ---------- AI ----------
async function askLLM(promptText, instruction) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-nano-12b-v2-vl:free",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${instruction}\n\nFAHRZEUGDATEN:\n${promptText}`
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
    const { text, image, question } = req.body;

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "API Key fehlt" });
    }

    let vehicleText = "";

    // ----- mobile.de -----
    if (text && text.includes("mobile.de")) {
      console.log("Mobile.de erkannt — Scraping…");

      try {
        vehicleText = await scrapeMobile(text);
      } catch (e) {
        console.error("SCRAPER ERROR", e);
        vehicleText =
          "SCRAPER FEHLER — ANALYSIERE NUR DIESEN LINK:\n" + text;
      }
    }

    // ----- Beschreibung -----
    else if (text) {
      vehicleText = text;
    }

    // ----- Bild optional -----
    else if (image) {
      vehicleText = "[Bilddaten]";
    }

    else {
      return res.status(400).json({ error: "Kein Input erhalten" });
    }


    const instruction = question || `
Analysiere dieses Fahrzeug.
Gib aus:

1. Kerndaten
2. Zuverlässigkeit
3. Unterhaltskosten
4. Verbrauch
5. Typische Schwachstellen
6. Stärken
7. Schwächen
8. Empfehlung
`;

    const answer = await askLLM(vehicleText, instruction);

    res.json({ answer });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Serverfehler", details: err.toString() });
  }
});



// ---------- HEALTH CHECK ----------
app.get("/", (req, res) => {
  res.send("Backend läuft ✅");
});



// ---------- START ----------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
  console.log("🚀 Backend läuft auf Port", PORT)
);
;
