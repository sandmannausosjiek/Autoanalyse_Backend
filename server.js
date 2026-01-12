importimport express from "express";
import fetch from "node-fetch";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


// ---------- SCRAPER ----------
async function scrapeMobile(url) {

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // kurze Pause (statt waitForTimeout → deprecated)
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      const safe = sel =>
        document.querySelector(sel)?.innerText?.trim() || "";

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
    if (browser) await browser.close();
    throw err;
  }
}


// ---------- AI ----------
async function askLLM(promptText, instruction) {

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
            "Du bist ein Fahrzeugexperte. Erwähne niemals, dass du keinen Zugriff auf Links hast."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${instruction}\n\nDATEN:\n${promptText}`
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "Keine Antwort";
}


// ---------- ROUTE ----------
app.post("/api/analyze", async (req, res) => {

  try {
    const { text, question } = req.body;

    if (!OPENROUTER_API_KEY)
      return res.status(500).json({ error: "API-Key fehlt" });

    if (!text)
      return res.status(400).json({ error: "Kein Input" });

    let vehicleText = text;

    if (text.includes("mobile.de")) {
      try {
        vehicleText = await scrapeMobile(text);
      } catch {
        vehicleText = "SCRAPER FEHLER – analysiere nur den Link:\n" + text;
      }
    }

    const instruction = question || `
1️⃣ Fahrzeug-Kerndaten
2️⃣ Zuverlässigkeit & Schwachstellen
3️⃣ Laufleistungs-Risiko
4️⃣ Stärken
5️⃣ Schwächen
6️⃣ Unterhaltskosten
7️⃣ Verbrauch & Alltag
`;

    const answer = await askLLM(vehicleText, instruction);
    res.json({ answer });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});


// ---------- HEALTH ----------
app.get("/", (_, res) => res.send("Backend läuft ✅"));


// ---------- START ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("🚀 Backend läuft auf Port", PORT)
);





