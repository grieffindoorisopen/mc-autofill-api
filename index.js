import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

const FORM_ID = "260056446155051";

/* ---------------- STATE MAP (REQUIRED FOR JOTFORM DROPDOWN) ---------------- */
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

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.send("MC Autofill API running");
});

/* ---------------- PREFILL ---------------- */
app.get("/prefill", async (req, res) => {
  try {
    const mc = req.query.mc;
    if (!mc) return res.send("MC missing");

    /* ---------- SAFER ---------- */
    const saferUrl =
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    const saferResp = await axios.get(saferUrl, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(saferResp.data);

    const extract = (label) => {
      const th = $("th")
        .filter((_, el) => $(el).text().replace(":", "").trim() === label)
        .first();
      return th.length
        ? th.next("td").text().replace(/\s+/g, " ").trim()
        : "";
    };

    const legalName = extract("Legal Name").replace(/\b(USDOT|MC).*$/i,"").trim();
    const authorityStatus = extract("Operating Authority Status")
      .replace(/For Licensing.*$/i,"")
      .trim();

    const rawAddress = extract("Physical Address");
    if (!rawAddress) return res.send("No address from SAFER");

    /* ---------- US CENSUS GEOCODER ---------- */
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
    if (!match) return res.send("Census geocode failed");

    const comp = match.addressComponents || {};

    /* ---------- CITY (ROBUST) ---------- */
    const city =
      comp.place ||
      comp.city ||
      comp.town ||
      comp.municipality ||
      comp.countySubdivision ||
      "";

    /* ---------- STATE (FULL NAME FOR JOTFORM) ---------- */
    const stateCode = comp.state || "";
    const state = STATE_MAP[stateCode] || "";

    const zip = comp.zip || "";

    /* ---------- STREET ---------- */
    let street = match.matchedAddress.split(",")[0].trim();
    if (city && street.toUpperCase().endsWith(city.toUpperCase())) {
      street = street.slice(0, street.length - city.length).trim();
    }

    /* ---------- PREFILL ---------- */
    const params = new URLSearchParams({
      mc_number: extract("MC/MX/FF Number(s)") || `MC-${mc}`,
      legal_name: legalName,
      usdot: extract("USDOT Number"),
      authority_status: authorityStatus,
      office_phone: extract("Phone"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),

      "physical_address[addr_line1]": street,
      "physical_address[city]": city,
      "physical_address[state]": state,
      "physical_address[postal]": zip
    });

    return res.redirect(
      `https://form.jotform.com/${FORM_ID}?${params.toString()}`
    );

  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).send("Failed to fetch carrier data");
  }
});

/* ---------------- START ---------------- */
app.listen(process.env.PORT || 3000, () =>
  console.log("MC Autofill API running")
);
