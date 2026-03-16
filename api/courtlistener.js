export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query, cursor, size = 20 } = req.body;

    const baseQuery =
      query ||
      '"securities fraud" OR "accounting fraud" OR "wire fraud" OR "insider trading"';

    const params = new URLSearchParams({
      type: "d", // d = federal cases/dockets
      q: baseQuery,
    });

    // If CourtListener supports page_size on this search route in your usage, keep it.
    // If not, remove it and rely on default pagination.
    params.set("page_size", String(size));

    if (cursor) {
      params.set("cursor", cursor);
    }

    const url = `https://www.courtlistener.com/api/rest/v4/search/?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Token ${process.env.COURTLISTENER_API_KEY}`,
        Accept: "application/json",
      },
    });

    const text = await response.text();
    console.log("CourtListener status:", response.status);
    console.log("CourtListener sample:", text.slice(0, 500));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "CourtListener request failed",
        details: text,
      });
    }

    const data = JSON.parse(text);

    const items = (data.results || []).map((item) => ({
      id: String(item.id || item.docket_id || crypto.randomUUID()),
      title: item.caseName || item.caseNameFull || "Federal Case",
      releasedAt: item.dateFiled || item.dateArgued || null,
      url: item.absolute_url
        ? `https://www.courtlistener.com${item.absolute_url}`
        : null,
      summary: [
        item.court ? `Court: ${item.court}` : null,
        item.docketNumber ? `Docket: ${item.docketNumber}` : null,
        item.cause ? `Cause: ${item.cause}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      tags: extractTags(
        `${item.caseName || ""} ${item.caseNameFull || ""} ${item.cause || ""}`
      ),
      entities: [],
      source: "CourtListener",
    }));

    return res.status(200).json({
      total: { value: data.count || items.length },
      next: data.next || null,
      previous: data.previous || null,
      data: items,
    });
  } catch (error) {
    console.error("CourtListener error:", error);
    return res.status(500).json({ error: error.message });
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
