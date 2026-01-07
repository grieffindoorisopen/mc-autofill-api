import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

const FORM_ID = "260056446155051";

/* ---------------- STATE MAP ---------------- */
const STATE_MAP = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia",
  HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa",
  KS:"Kansas", KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland",
  MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire",
  NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina",
  ND:"North Dakota", OH:"Ohio", OK:"Oklahoma", OR:"Oregon",
  PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah",
  VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming"
};

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.send("MC Autofill API running");
});

/* ---------------- PREFILL ---------------- */
app.get("/prefill", async (req, res) => {
  try {
    const mc = req.query.mc;
    if (!mc) return res.send("MC missing");

    const url =
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    const response = await axios.get(url, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(response.data);

    const extract = (label) => {
      const th = $("th")
        .filter((_, el) => $(el).text().replace(":", "").trim() === label)
        .first();
      return th.length ? th.next("td").text().replace(/\s+/g," ").trim() : "";
    };

    /* -------- BASIC DATA -------- */
    const legalName = extract("Legal Name").replace(/\b(USDOT|MC).*$/i,"").trim();
    const authorityStatus = extract("Operating Authority Status")
      .replace(/For Licensing.*$/i,"").trim();

    /* -------- ADDRESS PARSING (CITY-SAFE) -------- */
    const raw = extract("Physical Address");

    let street = "", unit = "", city = "", state = "", zip = "";

    if (raw) {
      // Split off ", STATE ZIP"
      const m = raw.match(/^(.*),\s*([A-Z]{2})\s+(\d{5})$/);
      if (m) {
        let body = m[1];
        state = STATE_MAP[m[2]] || "";
        zip = m[3];

        // Extract unit
        const unitMatch = body.match(/\b(APT|STE|UNIT)\s+([A-Z0-9-]+)/i);
        if (unitMatch) {
          unit = `${unitMatch[1]} ${unitMatch[2]}`;
          body = body.replace(unitMatch[0], "").trim();
        }

        // Street starts with number
        const streetMatch = body.match(/^(\d+\s+[^A-Z]+(?:\s+(?:RD|ST|AVE|BLVD|LN|DR|CT|WAY))?)/i);
        if (streetMatch) {
          street = streetMatch[1].trim();
          city = body.replace(streetMatch[1], "").trim();
        } else {
          // fallback
          street = body;
        }
      }
    }

    /* -------- PREFILL -------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      "physical_address[addr_line1]": street,
      "physical_address[addr_line2]": unit,
      "physical_address[city]": city,
      "physical_address[state]": state,
      "physical_address[postal]": zip
    });

    res.redirect(`https://form.jotform.com/${FORM_ID}?${params.toString()}`);

  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch carrier data");
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server started")
);
