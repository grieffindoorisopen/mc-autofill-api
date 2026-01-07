import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

const FORM_ID = "260056446155051";

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("MC Autofill API is running");
});

/* ---------------- PREFILL REDIRECT ---------------- */
app.get("/prefill", async (req, res) => {
  try {
    const mc = req.query.mc;
    if (!mc) {
      return res.status(400).json({ error: "MC number missing" });
    }

    console.log("➡️ Prefill request for MC:", mc);

    const saferUrl =
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    console.log("🌐 Fetching SAFER URL:", saferUrl);

    const response = await axios.get(saferUrl, {
      timeout: 15000,
      maxRedirects: 10,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    console.log("✅ SAFER response received");

    const $ = cheerio.load(response.data);

    /* -------- SAFER TABLE EXTRACTOR -------- */
    const extract = (label) => {
      const th = $("th")
        .filter((_, el) => $(el).text().replace(":", "").trim() === label)
        .first();

      const value = th.length
        ? th.next("td").text().replace(/\s+/g, " ").trim()
        : "";

      console.log(`📌 ${label}:`, value);
      return value;
    };

    /* -------- BASIC FIELD CLEANUP -------- */
    let legalName = extract("Legal Name");
    if (legalName) {
      legalName = legalName.replace(/\b(USDOT|MC).*$/i, "").trim();
    }

    let authorityStatus = extract("Operating Authority Status");
    if (authorityStatus) {
      authorityStatus = authorityStatus
        .replace(/For Licensing.*$/i, "")
        .trim();
    }

    const rawAddress = extract("Physical Address");

    console.log("🏠 Raw Address:", rawAddress);

    /* -------- TEMPORARY ADDRESS HANDLING (NO PARSING) -------- */
    const addr1 = rawAddress || "";
    const addr2 = "";
    const city = "";
    const state = "";
    const zip = "";

    /* -------- BUILD PREFILL PARAMS -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      // Address (input_17)
      "input_17_addr_line1": addr1,
      "input_17_addr_line2": addr2,
      "input_17_city": city,
      "input_17_state": state,
      "input_17_postal": zip
    });

    const redirectUrl =
      `https://form.jotform.com/${FORM_ID}?` + params.toString();

    console.log("➡️ Redirecting to:", redirectUrl);

    return res.redirect(redirectUrl);

  } catch (err) {
    console.error("🔥 PREFILL ERROR STACK:");
    console.error(err?.stack || err);

    return res.status(500).json({
      error: "Prefill failed",
      message: err?.message || String(err)
    });
  }
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MC Autofill API running on port ${PORT}`);
});
