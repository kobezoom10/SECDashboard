export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const response = await fetch("https://api.sec-api.io/enforcement-actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": process.env.SEC_API_KEY
      },
      body: JSON.stringify(req.body)
    });
    const text = await response.text();
    console.log("SEC API response status:", response.status);
    console.log("SEC API response body:", text);
    res.json(JSON.parse(text));
  } catch (error) {
    console.log("FULL ERROR:", error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
}
