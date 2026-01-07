import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

// Health check
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
      maxRedirects: 10,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    const $ = cheerio.load(response.data);

    // SAFER table extractor: <th>LABEL</th><td>VALUE</td>
    const extract = (label) => {
      const th = $("th")
        .filter((_, el) => $(el).text().replace(":", "").trim() === label)
        .first();

      return th.length
        ? th.next("td").text().replace(/\s+/g, " ").trim()
        : "";
    };

    const data = {
      legal_name: extract("Legal Name"),
      usdot: extract("USDOT Number"),
      mc_number: extract("MC/MX/FF Number(s)") || mc,
      authority_status: extract("Operating Authority Status") || "ACTIVE",
      office_phone: extract("Phone"),
      physical_address: extract("Physical Address"),
      mailing_address: extract("Mailing Address"),
      power_units: extract("Power Units"),
      drivers: extract("Drivers")
    };

    // ✅ CLEANUP: remove accidental USDOT text from legal name
    if (data.legal_name) {
      data.legal_name = data.legal_name
        .replace(/USDOT.*/i, "")
        .trim();
    }

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
