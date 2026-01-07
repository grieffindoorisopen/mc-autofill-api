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
      return res.status(400).send("MC number missing");
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

    /* -------- ADDRESS (SIMPLE & SAFE) -------- */
    const rawAddress = extract("Physical Address");
    let street = "";
    let unit = "";
    let city = "";
    let state = "";
    let zip = "";

    if (rawAddress) {
      // 2251 S FORT APACHE RD APT 1120 LAS VEGAS, NV 89117
      const m = rawAddress.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5})$/);
      if (m) {
        state = m[2];
        zip = m[3];

        const before = m[1];
        const parts = before.split(" ");

        city = parts.splice(-2).join(" ");
        const streetPart = parts.join(" ");

        const unitMatch = streetPart.match(/(.*)\s+(APT|STE|UNIT)\s+(.+)/i);
        if (unitMatch) {
          street = unitMatch[1].trim();
          unit = `${unitMatch[2]} ${unitMatch[3]}`;
        } else {
          street = streetPart.trim();
        }
      }
    }

    /* -------- PREFILL PARAMS (CORRECT JOTFORM FORMAT) -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      // ✅ ADDRESS — THIS IS THE FIX
      "physical_address[addr_line1]": street,
      "physical_address[addr_line2]": unit,
      "physical_address[city]": city,
      "physical_address[state]": state,
      "physical_address[postal]": zip
    });

    const redirectUrl =
      `https://form.jotform.com/${FORM_ID}?` + params.toString();

    return res.redirect(redirectUrl);

  } catch (err) {
    console.error("🔥 PREFILL ERROR:", err);
    return res.status(500).send("Failed to fetch carrier data");
  }
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MC Autofill API running on port ${PORT}`);
});
