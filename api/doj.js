export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  try {
    const { query, from = 0, size = 20 } = req.body;
    
    // DOJ News API - free, no key needed
    const pageNum = Math.floor(from / size) + 1;
    const searchTerm = query || "securities fraud financial fraud accounting fraud";
    
    const url = `https://www.justice.gov/api/v1/press_releases.json?s=${encodeURIComponent(searchTerm)}&pagesize=${size}&page=${pageNum}&sort_by=field_pr_date&sort_order=DESC`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json" }
    });
    
    const text = await response.text();
    const data = JSON.parse(text);
    
    // Normalize to match our existing data structure
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
      total: { value: data.count || items.length },
      data: items,
    });
  } catch (error) {
    console.error(error);
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
  ];
  return tagMap.filter(([k]) => lower.includes(k)).map(([, v]) => v).slice(0, 3);
}
