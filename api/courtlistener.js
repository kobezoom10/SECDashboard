export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { query, from = 0, size = 20 } = req.body;
    const page = Math.floor(from / size) + 1;

    // Build query with date filter using Lucene syntax
    const baseQuery = query || "securities fraud OR accounting fraud OR wire fraud OR insider trading";

const url = `https://www.courtlistener.com/api/rest/v4/search/?type=r&q=${encodeURIComponent(baseQuery)}&page_size=${size}&page=${page}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Token ${process.env.COURTLISTENER_API_KEY}`,
        "Accept": "application/json",
      }
    });

    const text = await response.text();
    console.log("Status:", response.status);
    console.log("Sample:", text.slice(0, 300));
    const data = JSON.parse(text);

    const items = (data.results || []).map(item => ({
      id: String(item.docket_id || item.id),
      title: item.caseName || item.caseNameFull || "Federal Case",
      releasedAt: item.dateFiled,
      url: item.absolute_url ? `https://www.courtlistener.com${item.absolute_url}` : null,
      summary: [
        item.court ? `Court: ${item.court}` : null,
        item.docketNumber ? `Docket: ${item.docketNumber}` : null,
        item.suitNature ? `Nature: ${item.suitNature}` : null,
        item.cause ? `Cause: ${item.cause}` : null,
      ].filter(Boolean).join(" · "),
      tags: extractTags((item.caseName || "") + " " + (item.suitNature || "") + " " + (item.cause || "")),
      entities: [],
      source: "CourtListener",
    }));

    res.json({
      total: { value: data.count || items.length },
      data: items,
    });
  } catch (error) {
    console.error("CourtListener error:", error);
    res.status(500).json({ error: error.message });
  }
}

function extractTags(text) {
  const lower = text.toLowerCase();
  const tagMap = [
    ["securities fraud", "securities fraud"],
    ["insider trading", "insider trading"],
    ["ponzi", "ponzi scheme"],
    ["bribery", "bribery"],
    ["fcpa", "FCPA"],
    ["accounting fraud", "accounting fraud"],
    ["wire fraud", "wire fraud"],
    ["money laundering", "money laundering"],
    ["embezzlement", "embezzlement"],
    ["tax fraud", "tax fraud"],
    ["bank fraud", "bank fraud"],
    ["crypto", "crypto"],
    ["investment fraud", "investment fraud"],
    ["financial fraud", "financial fraud"],
    ["white collar", "white collar"],
    ["false statements", "false statements"],
    ["conspiracy", "conspiracy"],
  ];
  return tagMap.filter(([k]) => lower.includes(k)).map(([, v]) => v).slice(0, 3);
}
