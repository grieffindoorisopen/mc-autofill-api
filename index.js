import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import addressParse from "address-parse";

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
    if (!mc) return res.send("MC number missing");

    const url =
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 10,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    const $ = cheerio.load(response.data);

    /* -------- SAFER TABLE EXTRACTOR -------- */
    const extract = (label) => {
      const th = $("th")
        .filter((_, el) => $(el).text().replace(":", "").trim() === label)
        .first();

      return th.length
        ? th.next("td").text().replace(/\s+/g, " ").trim()
        : "";
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

    /* -------- ADDRESS PARSING (LIBRARY-BASED) -------- */
    const rawAddress = extract("Physical Address");

    const parsedAddress = addressParse(rawAddress || "");

    const addr1 = parsedAddress.street || "";
    const addr2 = parsedAddress.secondary || "";
    const city = parsedAddress.city || "";
    const state = parsedAddress.state || "";
    const zip = parsedAddress.zip || "";

    /* -------- BUILD PREFILL PARAMS (JOTFORM FIELD IDS) -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      // ✅ Jotform Address (input_17)
      "input_17_addr_line1": addr1,
      "input_17_addr_line2": addr2,
      "input_17_city": city,
      "input_17_state": state,
      "input_17_postal": zip
    });

    const redirectUrl = `https://form.jotform.com/${FORM_ID}?${params.toString()}`;
    return res.redirect(redirectUrl);

  } catch (err) {
    console.error("Prefill failed:", err.message);
    return res.send("Failed to fetch carrier data");
  }
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MC Autofill API running on port ${PORT}`);
});
