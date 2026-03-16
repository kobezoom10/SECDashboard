export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { query, from = 0, size = 20 } = req.body;
    const pageNum = Math.floor(from / size) + 1;

    // Filter by Financial Fraud topic UUID
    let url = `https://www.justice.gov/api/v1/press_releases.json?sort=created&direction=DESC&pagesize=100&page=${pageNum}&search=${encodeURIComponent(query || "fraud")}`;

    if (query) {
      url += `&search=${encodeURIComponent(query)}`;
    }

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await response.json();

  const allItems = (data.results || []).map(item => ({
      id: item.uuid,
      title: item.title,
      releasedAt: item.date ? new Date(Number(item.date) * 1000).toISOString() : null,
      url: item.url,
      summary: item.body?.replace(/<[^>]*>/g, "").slice(0, 300) + "…",
      tags: extractTags(item.title + " " + (item.body || "")),
      entities: [],
      source: "DOJ",
    }));

    const FINANCIAL_KEYWORDS = ["fraud", "securities", "accounting", "embezzl", "ponzi", "insider trading", "money laundering", "bribery", "fcpa", "wire fraud", "financial crime", "crypto", "investment scheme"];
    const items = allItems.filter(item =>
      FINANCIAL_KEYWORDS.some(kw =>
        item.title?.toLowerCase().includes(kw) ||
        item.summary?.toLowerCase().includes(kw)
      )
    );

    res.json({
      total: { value: items.length },
      data: items,
    });
  } catch (error) {
    console.error("DOJ error:", error);
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
  ];
  return tagMap.filter(([k]) => lower.includes(k)).map(([, v]) => v).slice(0, 3);
}
