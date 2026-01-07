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

    const response = await axios.get(url, { timeout: 8000 });
    const html = response.data;

    const $ = cheerio.load(html);

    const extract = (label) =>
      $(`td:contains("${label}")`).next().text().trim();

    return res.json({
      usdot: extract("USDOT Number"),
      legal_name: extract("Legal Name"),
      dba: extract("DBA Name"),
      authority_status: extract("Operating Status"),
      office_phone: extract("Phone"),
      physical_address: extract("Physical Address"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers")
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MC Autofill API running on port ${PORT}`);
});
