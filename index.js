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
      return res.send("MC number missing");
    }

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

    /* -------- CLEAN BASIC FIELDS -------- */
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

    /* -------- SPLIT + NORMALIZE PHYSICAL ADDRESS -------- */
    let rawAddress = extract("Physical Address")
      .replace(/RDAPT/i, "RD APT")
      .replace(/\s+/g, " ")
      .trim();

    let addr1 = "";
    let addr2 = "";
    let city = "";
    let state = "";
    let zip = "";

    if (rawAddress) {
      const match = rawAddress.match(
        /^(.*?)(?:\s+(APT|STE|UNIT)\s+(\S+))?\s+([^,]+),\s+([A-Z]{2})\s+(\d{5})$/i
      );

      if (match) {
        addr1 = match[1].trim();
        addr2 = match[2] ? `${match[2]} ${match[3]}` : "";
        city = match[4].trim();
        state = match[5];
        zip = match[6];
      } else {
        addr1 = rawAddress;
      }
    }

    /* -------- BUILD PREFILL PARAMS (USING FIELD IDS) -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      // ✅ JOTFORM ADDRESS — MUST USE INPUT ID
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
