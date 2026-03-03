from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import time
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()

app = FastAPI(title="CricOres API", description="Production-grade Cricket Intelligence API")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Firebase initialization
try:
    # In production, use environment variables or a secret manager
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "./serviceAccountKey.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✅ Firebase initialized")
    else:
        print("⚠️ Firebase credentials not found. Firestore features will be disabled.")
        db = None
except Exception as e:
    print(f"❌ Firebase error: {e}")
    db = None

CRICKET_API_KEY = os.getenv("CRICKET_API_KEY")
BASE_URL = "https://api.cricapi.com/v1"

@app.get("/")
async def root():
    return {"status": "online", "message": "CricOres Backend is running 🚀"}

@app.get("/matches")
async def get_matches():
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    cache_ref = db.collection("cache").document("currentMatches")
    cache_doc = cache_ref.get()
    
    now = int(time.time() * 1000)
    CACHE_DURATION = 5 * 60 * 1000  # 5 minutes
    
    if cache_doc.exists:
        cached_data = cache_doc.to_dict()
        if now - cached_data.get("timestamp", 0) < CACHE_DURATION:
            print("Serving matches from cache")
            return cached_data.get("data")
            
    print("Fetching matches from CricAPI...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/currentMatches", params={"apikey": CRICKET_API_KEY, "offset": 0})
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch from external API")
            
        data = response.json()
        
        cache_ref.set({
            "data": data,
            "timestamp": now
        })
        
        return data

@app.get("/matchinfo/{match_id}")
async def get_match_info(match_id: str):
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    cache_ref = db.collection("cache").document(f"info_{match_id}")
    cache_doc = cache_ref.get()
    now = int(time.time() * 1000)
    
    if cache_doc.exists and now - cache_doc.to_dict().get("timestamp", 0) < 30000:
        return cache_doc.to_dict().get("data")
        
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/match_info", params={"apikey": CRICKET_API_KEY, "id": match_id})
        data = response.json()
        cache_ref.set({"data": data, "timestamp": now})
        return data

@app.get("/scorecard/{match_id}")
async def get_scorecard(match_id: str):
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    cache_ref = db.collection("cache").document(f"scorecard_{match_id}")
    cache_doc = cache_ref.get()
    now = int(time.time() * 1000)
    
    if cache_doc.exists and now - cache_doc.to_dict().get("timestamp", 0) < 30000:
        return cache_doc.to_dict().get("data")
        
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/match_scorecard", params={"apikey": CRICKET_API_KEY, "id": match_id})
        data = response.json()
        cache_ref.set({"data": data, "timestamp": now})
        return data

@app.post("/predict")
async def save_prediction(prediction: dict):
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    try:
        db.collection("predictions").add({
            **prediction,
            "createdAt": int(time.time() * 1000)
        })
        return {"message": "Prediction saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
