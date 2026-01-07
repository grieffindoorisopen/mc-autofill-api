import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("MC Autofill API is running");
});

// MC lookup endpoint
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

    const response = await axios.get(url, { timeout: 10000 });
    const html = response.data;
    const $ = cheerio.load(html);

    // SAFER-safe extractor
    const extract = (label) => {
      const td = $(`td`)
        .filter((_, el) => $(el).text().trim() === label)
        .first();

      return td.length
        ? td.next("td").text().replace(/\s+/g, " ").trim()
        : "";
    };

    const data = {
      usdot: extract("USDOT Number"),
      legal_name: extract("Legal Name"),
      dba: extract("DBA Name"),
      authority_status: extract("Operating Status"),
      office_phone: extract("Phone"),
      physical_address: extract("Physical Address"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers")
    };

    return res.json(data);

  } catch (error) {
    console.error("MC lookup failed:", error.message);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MC Autofill API running on port ${PORT}`);
});
