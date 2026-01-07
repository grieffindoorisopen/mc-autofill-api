import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

const FORM_ID = "260056446155051";

/* ---------- STATE MAP ---------- */
const STATE_MAP = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas",
  CA:"California", CO:"Colorado", CT:"Connecticut", DE:"Delaware",
  FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho",
  IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas",
  KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland",
  MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada",
  NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico", NY:"New York",
  NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island",
  SC:"South Carolina", SD:"South Dakota", TN:"Tennessee",
  TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia",
  WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming"
};

/* ---------- HELPERS ---------- */
const clean = (v = "") =>
  v.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

const enc = (v = "") => encodeURIComponent(clean(v));

/* ---------- HEALTH ---------- */
app.get("/", (req, res) => {
  res.send("MC Autofill API running");
});

/* ---------- PREFILL ---------- */
app.get("/prefill", async (req, res) => {
  try {
    /* ===== 1. PULL MC FROM INPUT ===== */
    const rawMc = req.query.mc;
    if (!rawMc) return res.send("MC number missing");

    // Numeric MC for SAFER
    const numericMc = rawMc.replace(/[^0-9]/g, "");
    if (!numericMc) return res.send("Invalid MC number");

    // Formatted MC for form fields
    const formattedMc = `MC-${numericMc}`;

    /* ===== 2. SAFER LOOKUP ===== */
    const saferUrl =
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + numericMc;

    const saferResp = await axios.get(saferUrl, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(saferResp.data);

    const extract = (label) => {
      const th = $("th")
        .filter((_, el) => $(el).text().replace(":", "").trim() === label)
        .first();
      return th.length ? clean(th.next("td").text()) : "";
    };

    const legalName = clean(
      extract("Legal Name").replace(/\b(USDOT|MC).*$/i, "")
    );

    const rawAddress = extract("Physical Address");
    if (!rawAddress) return res.send("No address found for MC");

    /* ===== 3. US CENSUS GEOCODER ===== */
    const censusResp = await axios.get(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
      {
        params: {
          address: rawAddress,
          benchmark: "Public_AR_Current",
          format: "json"
        },
        timeout: 15000
      }
    );

    const match = censusResp.data?.result?.addressMatches?.[0];
    if (!match) return res.send("Address geocoding failed");

    const comp = match.addressComponents || {};

    const city = clean(
      comp.place ||
      comp.city ||
      comp.town ||
      comp.municipality ||
      comp.countySubdivision ||
      ""
    );

    const state = STATE_MAP[comp.state] || "";
    const zip = comp.zip || "";

    let street = clean(match.matchedAddress.split(",")[0]);
    if (city && street.toUpperCase().endsWith(city.toUpperCase())) {
      street = clean(street.slice(0, street.length - city.length));
    }

    /* ===== 4. REDIRECT WITH PREFILL ===== */
    const query =
      `mc_number=${enc(formattedMc)}` +
      `&mc_authority=${enc(numericMc)}` +   // ✅ pulled from mc_number
      `&legal_name=${enc(legalName)}` +
      `&usdot=${enc(extract("USDOT Number"))}` +
      `&office_phone=${enc(extract("Phone"))}` +
      `&power_units=${enc(extract("Power Units"))}` +
      `&drivers=${enc(extract("Drivers"))}` +
      `&physical_address[addr_line1]=${enc(street)}` +
      `&physical_address[city]=${enc(city)}` +
      `&physical_address[state]=${enc(state)}` +
      `&physical_address[postal]=${enc(zip)}` +
      `&physical_address[country]=United%20States`;

    return res.redirect(
      `https://form.jotform.com/${FORM_ID}?${query}`
    );

  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).send("Failed to fetch carrier data");
  }
});

/* ---------- START ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("MC Autofill API running on port", PORT);
});
