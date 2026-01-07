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

    const saferUrl =
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    const response = await axios.get(saferUrl, {
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

    /* -------- BASIC FIELDS -------- */
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

    /* -------- ADDRESS (SAFE & JOTFORM-COMPATIBLE) -------- */
    const rawAddress = extract("Physical Address");

    let street = "";
    let unit = "";
    let city = "";
    let state = "";
    let zip = "";

    if (rawAddress) {
      // Example:
      // 2251 S FORT APACHE RD APT 1120 LAS VEGAS, NV 89117

      // Split state + zip
      const stateZipMatch = rawAddress.match(/,\s*([A-Z]{2})\s+(\d{5})$/);
      if (stateZipMatch) {
        state = stateZipMatch[1];
        zip = stateZipMatch[2];

        const beforeState = rawAddress.replace(/,\s*[A-Z]{2}\s+\d{5}$/, "").trim();

        // City = last word(s) before comma (LAS VEGAS)
        const parts = beforeState.split(" ");
        city = parts.splice(-2).join(" ");

        const streetPart = parts.join(" ");

        // Unit
        const unitMatch = streetPart.match(/(.*)\s+(APT|STE|UNIT)\s+(.+)/i);
        if (unitMatch) {
          street = unitMatch[1].trim();
          unit = `${unitMatch[2]} ${unitMatch[3]}`;
        } else {
          street = streetPart.trim();
        }
      } else {
        street = rawAddress;
      }
    }

    /* -------- PREFILL PARAMS (FIELD IDs) -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      // ✅ Address field (input_17)
      "input_17_addr_line1": street,
      "input_17_addr_line2": unit,
      "input_17_city": city,
      "input_17_state": state,
      "input_17_postal": zip
    });

    const redirectUrl =
      `https://form.jotform.com/${FORM_ID}?` + params.toString();

    return res.redirect(redirectUrl);

  } catch (err) {
    console.error("🔥 PREFILL ERROR:", err);
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
