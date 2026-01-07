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

    /* -------- ROBUST ADDRESS PARSER (FINAL) -------- */
    let rawAddress = extract("Physical Address")
      .replace(/RDAPT/i, "RD APT")
      .replace(/\s+/g, " ")
      .trim();

    let addr1 = "";
    let addr2 = "";
    let city = "";
    let state = "";
    let zip = "";

    // Example:
    // 2251 S FORT APACHE RD APT 1120 LAS VEGAS, NV 89117
    if (rawAddress) {
      const stateZip = rawAddress.match(/,\s*([A-Z]{2})\s+(\d{5})$/);
      if (stateZip) {
        state = stateZip[1];
        zip = stateZip[2];

        const beforeState = rawAddress.replace(/,\s*[A-Z]{2}\s+\d{5}$/, "").trim();

        // City is last two words before comma (LAS VEGAS)
        const tokens = beforeState.split(" ");
        city = tokens.splice(-2).join(" ").trim();

        const streetAndApt = tokens.join(" ").trim();

        const aptMatch = streetAndApt.match(/^(.*?)(?:\s+(APT|STE|UNIT)\s+(.+))?$/i);
        if (aptMatch) {
          addr1 = aptMatch[1].trim();
          addr2 = aptMatch[2] ? `${aptMatch[2]} ${aptMatch[3]}` : "";
        } else {
          addr1 = streetAndApt;
        }
      } else {
        addr1 = rawAddress;
      }
    }

    /* -------- BUILD PREFILL PARAMS (JOTFORM FIELD IDS) -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      // Jotform Address field (input_17)
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
