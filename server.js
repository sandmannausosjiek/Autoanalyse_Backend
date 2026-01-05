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

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote"
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

  return data?.choices?.[0]?.message?.content || "Keine Antwort erhalten.";
}



// ---------- ROUTE ----------
app.post("/api/analyze", async (req, res) => {
  try {

    const { text, image, question } = req.body;

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "API Key fehlt" });
    }

    let vehicleText = "";

    if (text && text.includes("mobile.de")) {
      console.log("Scraping mobile.de ...");
      vehicleText = await scrapeMobile(text);
    }

    else if (text) {
      vehicleText = text;
    }

    else if (image) {
      vehicleText = "[Bilddaten]";
    }

    else {
      return res.status(400).json({ error: "Kein Input erhalten" });
    }


    const instruction = question || `
Analysiere dieses Fahrzeug.
`;

    const answer = await askLLM(vehicleText, instruction);

    res.json({ answer });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Serverfehler", details: err.toString() });
  }
});



// ---------- START ----------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
  console.log("Backend läuft auf Port", PORT)
);
