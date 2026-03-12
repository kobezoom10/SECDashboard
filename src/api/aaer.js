import { QueryApi } from "sec-api";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const queryApi = new QueryApi(process.env.SEC_API_KEY);
    const data = await queryApi.getAAERs(req.body);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch AAERs" });
  }
}
