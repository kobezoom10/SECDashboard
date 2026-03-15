export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { query, from = 0, size = 20 } = req.body;
    const pageNum = Math.floor(from / size) + 1;

    // Use topic filter for Financial Fraud (topic ID 1201) from USAO press releases
    let url;
    if (query) {
      url = `https://www.justice.gov/api/v1/press_releases.json?parameters[title]=${encodeURIComponent(query)}&pagesize=${size}&page=${pageNum}&sort=date&direction=DESC`;
    } else {
      // Default: financial fraud topic
      url = `https://www.justice.gov/api/v1/press_releases.json?parameters[topic]=financial-fraud&pagesize=${size}&page=${pageNum}&sort=date&direction=DESC`;
    }

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await response.json();
    console.log("DOJ URL:", url);
    console.log("DOJ count:", data.metadata?.resultset?.count);

    const items = (data.results || []).map(item => ({
      id: item.uuid,
      title: item.title,
      releasedAt: item.date,
      url: item.url,
      summary: item.body?.replace(/<[^>]*>/g, "").slice(0, 300) + "…",
      tags: extractTags(item.title + " " + (item.body || "")),
      entities: [],
      source: "DOJ",
    }));

    res.json({
      total: { value: Number(data.metadata?.resultset?.count) || items.length },
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
