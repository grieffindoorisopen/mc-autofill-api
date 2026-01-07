import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("MC Autofill API is running");
});

app.post("/jotform/mc-lookup", async (req, res) => {
  try {
    const mc = req.body.mc_number;
    if (!mc) {
      return res.status(400).json({ error: "MC number missing" });
    }

    const url =
      "https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Normalize full visible text
    const text = $("body")
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // --- Extractors ---
    const usdotMatch = text.match(/USDOT Number\s*:?[\s#]*(\d+)/i);
    const mcMatch = text.match(/MC\/MX Number\s*:?[\s#]*(\d+)/i);

    // Legal name is usually the FIRST all-caps company name after "Company Snapshot"
    let legalName = "";
    const snapshotIndex = text.indexOf("Company Snapshot");
    if (snapshotIndex !== -1) {
      const afterSnapshot = text.slice(snapshotIndex + 16);
      const possibleName = afterSnapshot.match(/[A-Z][A-Z0-9 .,&'-]{3,}/);
      if (possibleName) legalName = possibleName[0].trim();
    }

    // Fallback: first ALL CAPS phrase with LLC / INC
    if (!legalName) {
      const fallback = text.match(/[A-Z][A-Z0-9 .,&'-]+(LLC|INC|CORP|LTD)/);
      if (fallback) legalName = fallback[0].trim();
    }

    const data = {
      legal_name: legalName,
      usdot: usdotMatch ? usdotMatch[1] : "",
      mc_number: mcMatch ? mcMatch[1] : mc,
      authority_status: text.includes("ACTIVE") ? "ACTIVE" : "",
      office_phone:
        (text.match(/Phone\s*:?[\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i) || [])[1] || "",
      power_units:
        (text.match(/Power Units\s*:?[\s]*(\d+)/i) || [])[1] || "",
      drivers:
        (text.match(/Drivers\s*:?[\s]*(\d+)/i) || [])[1] || ""
    };

    return res.json(data);

  } catch (err) {
    console.error("MC lookup failed:", err.message);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MC Autofill API running on port ${PORT}`);
});
