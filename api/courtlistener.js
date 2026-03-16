export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { query, from = 0, size = 20 } = req.body;
    const page = Math.floor(from / size) + 1;

    // Default to financial crime related searches
    const searchTerm = query || "securities fraud financial fraud accounting fraud wire fraud";

    const url = `https://www.courtlistener.com/api/rest/v4/dockets/?search=${encodeURIComponent(searchTerm)}&order_by=-date_filed&page_size=${size}&page=${page}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Token ${process.env.COURTLISTENER_API_KEY}`,
        "Accept": "application/json",
      }
    });

    const data = await response.json();
    console.log("CourtListener count:", data.count);

    const items = (data.results || []).map(item => ({
      id: String(item.id),
      title: item.case_name || item.case_name_short || "Federal Case",
      releasedAt: item.date_filed,
      url: `https://www.courtlistener.com${item.absolute_url}`,
      summary: [
        item.court_id ? `Court: ${item.court_id.toUpperCase()}` : null,
        item.docket_number ? `Docket: ${item.docket_number}` : null,
        item.nature_of_suit ? `Nature: ${item.nature_of_suit}` : null,
        item.cause ? `Cause: ${item.cause}` : null,
      ].filter(Boolean).join(" · "),
      tags: extractTags(
        (item.case_name || "") + " " +
        (item.nature_of_suit || "") + " " +
        (item.cause || "")
      ),
      entities: item.parties ? item.parties.slice(0, 4).map(p => ({ name: p.name, ticker: null })) : [],
      source: "CourtListener",
      docketNumber: item.docket_number,
      court: item.court_id?.toUpperCase(),
      cause: item.cause,
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
