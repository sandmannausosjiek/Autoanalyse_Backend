import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


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
            "Du bist ein erfahrener Kfz-Experte. Antworte fundiert, sachlich und realistisch."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${instruction}\n\nFAHRZEUGINFORMATIONEN:\n${promptText}`
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
    const { text, question } = req.body;

    if (!OPENROUTER_API_KEY)
      return res.status(500).json({ error: "API-Key fehlt" });

    if (!text)
      return res.status(400).json({ error: "Kein Input erhalten" });

    let vehicleText = text;

    // -------- mobile.de Link erkannt --------
    if (text.includes("mobile.de")) {
      vehicleText = `
Mobile.de Fahrzeuglink erkannt.

Der Link verweist auf ein Fahrzeugangebot.
Nutze dein Fachwissen zu:
- typischen Motorisierungen
- bekannten Schwachstellen
- realistischem Unterhalt
- Zuverlässigkeit über 100.000 km

Link:
${text}
`;
    }

    const instruction = question || `
Analysiere dieses Fahrzeug strukturiert:

1️⃣ Fahrzeug-Kerndaten (geschätzt, falls nötig)
2️⃣ Typische Zuverlässigkeit & bekannte Schwachstellen
3️⃣ Laufleistungs-Risiko über 100.000 km
4️⃣ Stärken
5️⃣ Schwächen
6️⃣ Unterhaltskosten realistisch
7️⃣ Verbrauch & Alltag
8️⃣ Für wen geeignet?

Antworte ehrlich, ohne Zugriff auf externe Webseiten zu erwähnen.
`;

    const answer = await askLLM(vehicleText, instruction);
    res.json({ answer });

  } catch (err) {
    console.error(err);
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




