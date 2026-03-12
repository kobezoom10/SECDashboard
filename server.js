import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { QueryApi } from "sec-api";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const queryApi = new QueryApi(process.env.SEC_API_KEY);

// Enforcement Actions
app.post("/api/enforcement", async (req, res) => {
  try {
    const data = await queryApi.getEnforcementActions(req.body);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch enforcement actions" });
  }
});

// Litigation Releases
app.post("/api/litigation", async (req, res) => {
  try {
    const data = await queryApi.getLitigationReleases(req.body);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch litigation releases" });
  }
});

// Administrative Proceedings
app.post("/api/admin", async (req, res) => {
  try {
    const data = await queryApi.getAdministrativeProceedings(req.body);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch admin proceedings" });
  }
});

// AAERs
app.post("/api/aaer", async (req, res) => {
  try {
    const data = await queryApi.getAAERs(req.body);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch AAERs" });
  }
});

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});