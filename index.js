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
      "https://safer.fmcsa.dot.gov/query.asp" +
      "?searchtype=ANY" +
      "&query_type=queryCarrierSnapshot" +
      "&query_param=MC_MX" +
      "&query_string=" + mc;

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const $ = cheerio.load(response.data);

    // Exact SAFER table extractor
    const extract = (label) => {
      const cell = $("td")
        .filter((_, el) => $(el).text().trim() === label)
        .first();

      return cell.length
        ? cell.next("td").text().replace(/\s+/g, " ").trim()
        : "";
    };

    const data = {
      usdot: extract("USDOT Number"),
      legal_name: extract("Legal Name"),
      dba: extract("DBA Name"),
      authority_status: extract("Operating Authority Status"),
      office_phone: extract("Phone"),
      physical_address: extract("Physical Address"),
      mailing_address: extract("Mailing Address"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers"),
      mc_number: extract("MC/MX/FF Number(s)") || mc
    };

    return res.json(data);

  } catch (err) {
    console.error("MC lookup failed:", err.message);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MC Autofill API running on port ${PORT}`);
});
