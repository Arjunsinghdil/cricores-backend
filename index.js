require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const cors = require("cors");

// ================= EXPRESS SETUP =================
const app = express();
app.use(cors());
app.use(express.json());

// ================= FIREBASE INIT =================
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ================= CONFIG =================
const PORT = process.env.PORT || 5000;
const CRICKET_API_KEY = process.env.CRICKET_API_KEY;

console.log("Loaded API Key:", CRICKET_API_KEY ? "✅ Loaded" : "❌ NOT LOADED");

if (!CRICKET_API_KEY) {
  console.error("CRICKET_API_KEY is missing in .env file");
  process.exit(1);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// ================= FETCH + CACHE MATCHES =================
app.get("/matches", async (req, res) => {
  try {
    const cacheRef = db.collection("cache").doc("currentMatches");
    const cacheDoc = await cacheRef.get();

    const now = Date.now();
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    if (cacheDoc.exists) {
      const cachedData = cacheDoc.data();

      if (now - cachedData.timestamp < CACHE_DURATION) {
        console.log("Serving matches from cache");
        return res.json(cachedData.data);
      }
    }

    console.log("Fetching matches from CricAPI...");

    const response = await axios.get(
      `https://api.cricapi.com/v1/currentMatches`,
      {
        params: {
          apikey: CRICKET_API_KEY,
          offset: 0,
        },
        timeout: 10000,
      }
    );

    await cacheRef.set({
      data: response.data,
      timestamp: now,
    });

    res.json(response.data);

  } catch (error) {
    console.error("MATCHES ERROR:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch matches",
      details: error.response?.data || error.message,
    });
  }
});

// ================= MATCH INFO =================
app.get("/matchinfo/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const cacheRef = db.collection("cache").doc(`info_${id}`);
    const cacheDoc = await cacheRef.get();
    const now = Date.now();

    if (cacheDoc.exists && now - cacheDoc.data().timestamp < 30000) {
      console.log("Serving match info from cache");
      return res.json(cacheDoc.data().data);
    }

    const response = await axios.get(
      `https://api.cricapi.com/v1/match_info`,
      {
        params: {
          apikey: CRICKET_API_KEY,
          id: id,
        },
      }
    );

    await cacheRef.set({
      data: response.data,
      timestamp: now,
    });

    res.json(response.data);

  } catch (error) {
    console.error("MATCH INFO ERROR:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch match info",
      details: error.response?.data || error.message,
    });
  }
});

// ================= SCORECARD =================
app.get("/scorecard/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const cacheRef = db.collection("cache").doc(`scorecard_${id}`);
    const cacheDoc = await cacheRef.get();
    const now = Date.now();

    if (cacheDoc.exists && now - cacheDoc.data().timestamp < 30000) {
      console.log("Serving scorecard from cache");
      return res.json(cacheDoc.data().data);
    }

    const response = await axios.get(
      `https://api.cricapi.com/v1/match_scorecard`,
      {
        params: {
          apikey: CRICKET_API_KEY,
          id: id,
        },
      }
    );

    await cacheRef.set({
      data: response.data,
      timestamp: now,
    });

    res.json(response.data);

  } catch (error) {
    console.error("SCORECARD ERROR:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch scorecard",
      details: error.response?.data || error.message,
    });
  }
});

// ================= SAVE PREDICTION =================
app.post("/predict", async (req, res) => {
  try {
    const { userId, matchId, predictedWinner } = req.body;

    await db.collection("predictions").add({
      userId,
      matchId,
      predictedWinner,
      createdAt: Date.now(),
    });

    res.json({ message: "Prediction saved successfully" });

  } catch (error) {
    console.error("Prediction Error:", error.message);
    res.status(500).json({ error: "Failed to save prediction" });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
