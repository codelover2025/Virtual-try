"""
=============================================================================
Lumière Virtual Try-On - Backend API Server (FastAPI)
=============================================================================
Connects the Lumière Virtual Try-On Engine & Jewellery Assets to the
Lumière Next.js 15 Frontend on http://localhost:4000/api/v1.

Features:
- REST API matching frontend/src/api-client contract (/categories, /products, /settings).
- Virtual Try-On session lifecycle (/try-on/sessions, /heartbeat, /assets).
- Webcam capture upload & photo saving pipeline (/uploads, /captures).
- Static assets serving (/static/Image/...) directly from the project root.
- Full CORS support for http://localhost:3000.
=============================================================================
"""

import os
import uuid
import time
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
CAPTURES_DIR = os.path.join(BASE_DIR, "captures")
os.makedirs(CAPTURES_DIR, exist_ok=True)

app = FastAPI(
    title="Lumière Virtual Try-On Backend API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# Enable CORS for Next.js frontend running on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helper: Standard Envelope Response Generator
# ---------------------------------------------------------------------------
def api_envelope(data: Any, pagination: Optional[Dict[str, Any]] = None):
    meta = {
        "requestId": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    if pagination is not None:
        meta["pagination"] = pagination
    return {
        "success": True,
        "data": data,
        "meta": meta
    }

# ---------------------------------------------------------------------------
# Catalogue Data Definitions (Sourced from static/Image/ assets)
# ---------------------------------------------------------------------------
CATEGORIES = [
    {
        "id": "cat-necklaces",
        "name": "Necklaces",
        "slug": "necklaces",
        "parentId": None,
        "description": "Royal chokers, diamond collars, and torque necklaces.",
        "sortOrder": 1,
        "isActive": True
    },
    {
        "id": "cat-earrings",
        "name": "Earrings",
        "slug": "earrings",
        "parentId": None,
        "description": "Dual earlobe teardrops, solitaires, and chandelier dangles.",
        "sortOrder": 2,
        "isActive": True
    },
    {
        "id": "cat-rings",
        "name": "Rings",
        "slug": "rings",
        "parentId": None,
        "description": "Solitaire diamonds, pavé bands, and sovereign gemstone rings.",
        "sortOrder": 3,
        "isActive": True
    },
    {
        "id": "cat-bangles",
        "name": "Bangles",
        "slug": "bangles",
        "parentId": None,
        "description": "Anatomically aligned kada cuffs and pavé diamond bangles.",
        "sortOrder": 4,
        "isActive": True
    }
]

PRODUCTS_MASTER = [
    # ── Necklaces ─────────────────────────────────────────────────────────────
    {
        "id": "prod-neck-001",
        "sku": "VJ-NECK-001",
        "name": "Royal Empress Emerald Choker",
        "slug": "royal-empress-emerald-choker",
        "jewelleryKind": "NECKLACE",
        "status": "PUBLISHED",
        "categoryId": "cat-necklaces",
        "image": "/static/Image/Necklace/necklace_1.png",
        "description": "Grand royal choker with graduated gold torque bands and a central faceted emerald drop.",
        "priceCents": 3499900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "SUPRASTERNAL_NOTCH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },
    {
        "id": "prod-neck-020",
        "sku": "VJ-NECK-020",
        "name": "Heritage Solitaire Collar",
        "slug": "heritage-solitaire-collar",
        "jewelleryKind": "NECKLACE",
        "status": "PUBLISHED",
        "categoryId": "cat-necklaces",
        "image": "/static/Image/Necklace/necklace_20.png",
        "description": "Delicate 22k gold chain suspending a brilliant teardrop solitaire pendant.",
        "priceCents": 2899900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "SUPRASTERNAL_NOTCH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },
    {
        "id": "prod-neck-024",
        "sku": "VJ-NECK-024",
        "name": "Empress Golden Torque Choker",
        "slug": "empress-golden-torque-choker",
        "jewelleryKind": "NECKLACE",
        "status": "PUBLISHED",
        "categoryId": "cat-necklaces",
        "image": "/static/Image/Necklace/necklace_24.png",
        "description": "Solid polished gold torque necklace adorned with intricate filigree motifs.",
        "priceCents": 3899900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "SUPRASTERNAL_NOTCH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },
    {
        "id": "prod-neck-028",
        "sku": "VJ-NECK-028",
        "name": "Aura Diamond Festoon Necklace",
        "slug": "aura-diamond-festoon-necklace",
        "jewelleryKind": "NECKLACE",
        "status": "PUBLISHED",
        "categoryId": "cat-necklaces",
        "image": "/static/Image/Necklace/necklace_28.png",
        "description": "Grand festoon style royal necklace embellished with luminous diamond drops.",
        "priceCents": 4499900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "SUPRASTERNAL_NOTCH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },

    # ── Earrings ──────────────────────────────────────────────────────────────
    {
        "id": "prod-ear-001",
        "sku": "VJ-EAR-001",
        "name": "Celestial Solitaire Drop Earrings",
        "slug": "celestial-solitaire-drop-earrings",
        "jewelleryKind": "EARRINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-earrings",
        "image": "/static/Image/Earring/earring_1.png",
        "description": "Handcrafted 22k yellow gold drop earrings crowned with bezel-set teardrop pearls.",
        "priceCents": 1299900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "EAR_LOBE", "earSide": "BOTH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": True,
        "fingerIndex": None
    },
    {
        "id": "prod-ear-002",
        "sku": "VJ-EAR-002",
        "name": "Royal Ruby Solitaire Studs",
        "slug": "royal-ruby-solitaire-studs",
        "jewelleryKind": "EARRINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-earrings",
        "image": "/static/Image/Earring/earring_2.png",
        "description": "Lustrous round-cut pigeon blood ruby studs set in polished yellow gold.",
        "priceCents": 1499900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "EAR_LOBE", "earSide": "BOTH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": True,
        "fingerIndex": None
    },
    {
        "id": "prod-ear-003",
        "sku": "VJ-EAR-003",
        "name": "Sapphire Halo Dangle Earrings",
        "slug": "sapphire-halo-dangle-earrings",
        "jewelleryKind": "EARRINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-earrings",
        "image": "/static/Image/Earring/earring_3.png",
        "description": "Deep blue sapphire teardrop earrings enveloped in brilliant pavé diamond halos.",
        "priceCents": 1699900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "EAR_LOBE", "earSide": "BOTH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": True,
        "fingerIndex": None
    },
    {
        "id": "prod-ear-004",
        "sku": "VJ-EAR-004",
        "name": "Emerald Blossom Drop Earrings",
        "slug": "emerald-blossom-drop-earrings",
        "jewelleryKind": "EARRINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-earrings",
        "image": "/static/Image/Earring/earring_4.png",
        "description": "Vibrant Zambian emerald gemstones dangling from four-prong gold hooks.",
        "priceCents": 1899900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "EAR_LOBE", "earSide": "BOTH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": True,
        "fingerIndex": None
    },
    {
        "id": "prod-ear-005",
        "sku": "VJ-EAR-005",
        "name": "Heritage Amethyst Chandelier Earrings",
        "slug": "heritage-amethyst-chandelier-earrings",
        "jewelleryKind": "EARRINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-earrings",
        "image": "/static/Image/Earring/earring_5.png",
        "description": "Regal violet amethyst drops encased in textured gold crowns.",
        "priceCents": 1799900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "EAR_LOBE", "earSide": "BOTH"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": True,
        "fingerIndex": None
    },

    # ── Rings ─────────────────────────────────────────────────────────────────
    {
        "id": "prod-ring-001",
        "sku": "VJ-RING-001",
        "name": "Brilliant Solitaire Diamond Ring",
        "slug": "brilliant-solitaire-diamond-ring",
        "jewelleryKind": "RINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-rings",
        "image": "/static/Image/Ring/ring_1.png",
        "description": "Certified 2.0-carat round brilliant diamond perched on an 18k solid gold band.",
        "priceCents": 2199900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "FINGER_BASE", "fingerIndex": 3},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": 3
    },
    {
        "id": "prod-ring-002",
        "sku": "VJ-RING-002",
        "name": "Royal Ruby Pavé Crown Ring",
        "slug": "royal-ruby-pave-crown-ring",
        "jewelleryKind": "RINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-rings",
        "image": "/static/Image/Ring/ring_2.png",
        "description": "Deep crimson Burmese ruby gemstone hugged by four sculpted gold prongs.",
        "priceCents": 2399900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "FINGER_BASE", "fingerIndex": 3},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": 3
    },
    {
        "id": "prod-ring-003",
        "sku": "VJ-RING-003",
        "name": "Sapphire Halo Luxury Ring",
        "slug": "sapphire-halo-luxury-ring",
        "jewelleryKind": "RINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-rings",
        "image": "/static/Image/Ring/ring_3.png",
        "description": "Oval Ceylon sapphire crowned with micro-pavé diamonds on a metallic shank.",
        "priceCents": 2599900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "FINGER_BASE", "fingerIndex": 3},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": 3
    },
    {
        "id": "prod-ring-004",
        "sku": "VJ-RING-004",
        "name": "Imperial Emerald Cut Gold Ring",
        "slug": "imperial-emerald-cut-gold-ring",
        "jewelleryKind": "RINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-rings",
        "image": "/static/Image/Ring/ring_4.png",
        "description": "Octagonal Colombian emerald set into a heavy yellow gold sovereign band.",
        "priceCents": 2799900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "FINGER_BASE", "fingerIndex": 3},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": 3
    },
    {
        "id": "prod-ring-005",
        "sku": "VJ-RING-005",
        "name": "Amethyst Sovereign Gold Ring",
        "slug": "amethyst-sovereign-gold-ring",
        "jewelleryKind": "RINGS",
        "status": "PUBLISHED",
        "categoryId": "cat-rings",
        "image": "/static/Image/Ring/ring_5.png",
        "description": "Rich purple faceted amethyst gemstone mounted in royal 22k gold prongs.",
        "priceCents": 1999900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "FINGER_BASE", "fingerIndex": 3},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": 3
    },

    # ── Bangles ───────────────────────────────────────────────────────────────
    {
        "id": "prod-bangle-001",
        "sku": "VJ-BANGLE-001",
        "name": "Dynasty 22k Imperial Gold Kada",
        "slug": "dynasty-22k-imperial-gold-kada",
        "jewelleryKind": "BANGLES",
        "status": "PUBLISHED",
        "categoryId": "cat-bangles",
        "image": "/static/Image/Bangle/bangle_1.png",
        "description": "Hand-chased 22k solid gold kada with pavé diamond studs along the circumference.",
        "priceCents": 4599900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "WRIST"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },
    {
        "id": "prod-bangle-002",
        "sku": "VJ-BANGLE-002",
        "name": "Platinum Pavé Diamond Bangle",
        "slug": "platinum-pave-diamond-bangle",
        "jewelleryKind": "BANGLES",
        "status": "PUBLISHED",
        "categoryId": "cat-bangles",
        "image": "/static/Image/Bangle/bangle_2.png",
        "description": "Polished platinum wrist bangle accented with brilliant pavé diamonds.",
        "priceCents": 4999900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "WRIST"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },
    {
        "id": "prod-bangle-003",
        "sku": "VJ-BANGLE-003",
        "name": "Royal Ruby Accented Gold Cuff",
        "slug": "royal-ruby-accented-gold-cuff",
        "jewelleryKind": "BANGLES",
        "status": "PUBLISHED",
        "categoryId": "cat-bangles",
        "image": "/static/Image/Bangle/bangle_3.png",
        "description": "Luxurious rose gold cuff featuring bezel-set round rubies along the outer rim.",
        "priceCents": 5299900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "WRIST"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    },
    {
        "id": "prod-bangle-004",
        "sku": "VJ-BANGLE-004",
        "name": "Emerald Crown Filigree Bangle",
        "slug": "emerald-crown-filigree-bangle",
        "jewelleryKind": "BANGLES",
        "status": "PUBLISHED",
        "categoryId": "cat-bangles",
        "image": "/static/Image/Bangle/bangle_4.png",
        "description": "Intricate openwork gold filigree bangle crowned with deep green emerald stones.",
        "priceCents": 4899900,
        "currency": "INR",
        "anchorProfile": {"anchorType": "WRIST"},
        "defaultScale": 1.0,
        "mirrorForOppositeEar": False,
        "fingerIndex": None
    }
]

# Build product DTO helper
def build_product_dto(p: Dict[str, Any], detailed: bool = True) -> Dict[str, Any]:
    cat = next((c for c in CATEGORIES if c["id"] == p["categoryId"]), CATEGORIES[0])
    img_dto = {
        "id": f"img-{p['id']}",
        "url": p["image"],
        "altText": p["name"],
        "sortOrder": 0,
        "isPrimary": True
    }
    base = {
        "id": p["id"],
        "name": p["name"],
        "slug": p["slug"],
        "sku": p["sku"],
        "jewelleryKind": p["jewelleryKind"],
        "status": p["status"],
        "category": {"id": cat["id"], "name": cat["name"], "slug": cat["slug"]},
        "primaryImage": img_dto,
        "priceCents": p["priceCents"],
        "currency": p["currency"]
    }
    if detailed:
        base.update({
            "description": p["description"],
            "images": [img_dto],
            "tryOnAsset": {
                "id": f"asset-{p['id']}",
                "assetType": "IMAGE_OVERLAY",
                "url": p["image"],
                "anchorProfile": p["anchorProfile"],
                "defaultScale": p["defaultScale"],
                "defaultRotationZ": 0,
                "mirrorForOppositeEar": p["mirrorForOppositeEar"],
                "fingerIndex": p["fingerIndex"],
                "isActive": True
            },
            "metadata": {}
        })
    return base

# Active in-memory sessions & captures store
SESSIONS: Dict[str, Dict[str, Any]] = {}
CAPTURES: List[Dict[str, Any]] = []

# ---------------------------------------------------------------------------
# API Endpoints (/api/v1/...)
# ---------------------------------------------------------------------------

@app.get("/api/v1/categories")
def list_categories(flat: Optional[bool] = False, isActive: Optional[bool] = None):
    results = CATEGORIES
    if isActive is not None:
        results = [c for c in results if c["isActive"] == isActive]
    return api_envelope(results)

@app.get("/api/v1/categories/{id_or_slug}")
def get_category(id_or_slug: str):
    cat = next((c for c in CATEGORIES if c["id"] == id_or_slug or c["slug"] == id_or_slug), None)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return api_envelope(cat)

@app.get("/api/v1/products")
def list_products(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    categoryId: Optional[str] = None,
    jewelleryKind: Optional[str] = None,
    q: Optional[str] = None
):
    filtered = PRODUCTS_MASTER
    if categoryId:
        filtered = [p for p in filtered if p["categoryId"] == categoryId]
    if jewelleryKind:
        filtered = [p for p in filtered if p["jewelleryKind"].upper() == jewelleryKind.upper()]
    if q:
        query_str = q.strip().lower()
        filtered = [p for p in filtered if query_str in p["name"].lower() or query_str in p["sku"].lower()]

    total = len(filtered)
    start_idx = (page - 1) * pageSize
    end_idx = start_idx + pageSize
    items = [build_product_dto(p, detailed=False) for p in filtered[start_idx:end_idx]]

    pagination = {
        "page": page,
        "pageSize": pageSize,
        "total": total,
        "totalPages": max(1, (total + pageSize - 1) // pageSize)
    }
    return api_envelope(items, pagination=pagination)

@app.get("/api/v1/products/{id_or_slug}")
def get_product(id_or_slug: str):
    p = next((item for item in PRODUCTS_MASTER if item["id"] == id_or_slug or item["slug"] == id_or_slug or item["sku"] == id_or_slug), None)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return api_envelope(build_product_dto(p, detailed=True))

@app.get("/api/v1/settings/public")
def get_public_settings():
    return api_envelope({
        "guestTryOnEnabled": True,
        "brandName": "Lumière",
        "supportEmail": "support@lumiere.com"
    })

# ---------------------------------------------------------------------------
# Virtual Try-On Session Management
# ---------------------------------------------------------------------------

class SessionStartRequest(BaseModel):
    productId: str
    clientInfo: Optional[Dict[str, Any]] = None

@app.post("/api/v1/try-on/sessions")
def start_session(body: SessionStartRequest):
    p = next((item for item in PRODUCTS_MASTER if item["id"] == body.productId or item["slug"] == body.productId), PRODUCTS_MASTER[0])
    dto = build_product_dto(p, detailed=True)
    sess_id = f"sess_{uuid.uuid4().hex[:12]}"
    sess_data = {
        "sessionId": sess_id,
        "productId": p["id"],
        "jewelleryKind": p["jewelleryKind"],
        "asset": dto["tryOnAsset"],
        "status": "ACTIVE",
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "lastHeartbeat": time.time()
    }
    SESSIONS[sess_id] = sess_data
    return api_envelope(sess_data)

@app.get("/api/v1/try-on/sessions/{sessionId}")
def get_session(sessionId: str):
    sess = SESSIONS.get(sessionId)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return api_envelope(sess)

@app.patch("/api/v1/try-on/sessions/{sessionId}")
def patch_session(sessionId: str, body: Dict[str, Any]):
    sess = SESSIONS.get(sessionId)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if "status" in body:
        sess["status"] = body["status"]
    sess["lastHeartbeat"] = time.time()
    return api_envelope(sess)

@app.post("/api/v1/try-on/sessions/{sessionId}/heartbeat")
def session_heartbeat(sessionId: str):
    sess = SESSIONS.get(sessionId)
    if not sess:
        return api_envelope({"ok": True, "status": "ACTIVE"})
    sess["lastHeartbeat"] = time.time()
    return api_envelope({"ok": True, "status": sess["status"]})

@app.post("/api/v1/try-on/sessions/{sessionId}/events/batch")
def record_events(sessionId: str, body: Dict[str, Any]):
    return api_envelope({"ok": True})

@app.get("/api/v1/try-on/products/{productId}/asset")
def get_product_asset(productId: str):
    p = next((item for item in PRODUCTS_MASTER if item["id"] == productId or item["slug"] == productId), None)
    if not p:
        return api_envelope(None)
    dto = build_product_dto(p, detailed=True)
    return api_envelope({
        "productId": p["id"],
        "jewelleryKind": p["jewelleryKind"],
        "asset": dto["tryOnAsset"]
    })

class MultiAssetRequest(BaseModel):
    productIds: List[str]

@app.post("/api/v1/try-on/products/assets")
def get_multiple_product_assets(body: MultiAssetRequest):
    results = []
    for pid in body.productIds:
        p = next((item for item in PRODUCTS_MASTER if item["id"] == pid or item["slug"] == pid), None)
        if p:
            dto = build_product_dto(p, detailed=True)
            results.append({
                "productId": p["id"],
                "jewelleryKind": p["jewelleryKind"],
                "asset": dto["tryOnAsset"]
            })
    return api_envelope(results)

# ---------------------------------------------------------------------------
# Capture & Photo Download Pipeline
# ---------------------------------------------------------------------------

class UploadUrlRequest(BaseModel):
    mimeType: str
    fileSize: int

@app.post("/api/v1/try-on/sessions/{sessionId}/upload-url")
def request_upload_url(sessionId: str, body: UploadUrlRequest):
    storage_key = f"cap_{uuid.uuid4().hex[:14]}"
    return api_envelope({
        "uploadUrl": f"http://localhost:4000/api/v1/uploads/{storage_key}",
        "storageKey": storage_key,
        "headers": {"Content-Type": body.mimeType},
        "expiresIn": 3600
    })

@app.put("/api/v1/uploads/{storageKey}")
async def upload_capture_binary(storageKey: str, request: Request):
    content = await request.body()
    out_file = os.path.join(CAPTURES_DIR, f"{storageKey}.jpg")
    with open(out_file, "wb") as f:
        f.write(content)

    # Also mirror latest snapshot as captured_image_with_jewelry.png in root
    root_snap = os.path.join(BASE_DIR, "captured_image_with_jewelry.png")
    with open(root_snap, "wb") as f:
        f.write(content)

    return Response(status_code=200)

class RegisterCaptureRequest(BaseModel):
    storageKey: str
    width: int
    height: int
    mimeType: str
    fileSizeBytes: int

@app.post("/api/v1/try-on/sessions/{sessionId}/captures")
def register_capture(sessionId: str, body: RegisterCaptureRequest):
    cap_id = f"cap_{uuid.uuid4().hex[:8]}"
    img_url = f"http://localhost:4000/captures/{body.storageKey}.jpg"
    cap_record = {
        "id": cap_id,
        "sessionId": sessionId,
        "status": "READY",
        "url": img_url,
        "thumbUrl": img_url,
        "createdAt": datetime.utcnow().isoformat() + "Z"
    }
    CAPTURES.insert(0, cap_record)
    return api_envelope(cap_record)

@app.get("/api/v1/try-on/captures")
def list_captures(page: int = Query(1, ge=1)):
    return api_envelope(CAPTURES, pagination={"page": page, "pageSize": 20, "total": len(CAPTURES), "totalPages": 1})

@app.get("/api/v1/try-on/captures/{captureId}")
def get_capture(captureId: str):
    cap = next((c for c in CAPTURES if c["id"] == captureId), None)
    if not cap:
        raise HTTPException(status_code=404, detail="Capture not found")
    return api_envelope(cap)

@app.get("/api/v1/try-on/captures/{captureId}/download")
def download_capture(captureId: str):
    cap = next((c for c in CAPTURES if c["id"] == captureId), None)
    if not cap:
        raise HTTPException(status_code=404, detail="Capture not found")
    return api_envelope({
        "downloadUrl": cap["url"],
        "fileName": f"lumiere_tryon_{captureId}.jpg",
        "expiresIn": 3600
    })

# ---------------------------------------------------------------------------
# Auth Stubs (Guest / Demo Support)
# ---------------------------------------------------------------------------

@app.post("/api/v1/auth/login")
def auth_login(body: Dict[str, Any]):
    return api_envelope({
        "user": {"id": "user-guest", "email": body.get("email", "guest@lumiere.com"), "fullName": "Guest User", "role": "USER"},
        "tokens": {"accessToken": "lumiere_guest_token", "refreshToken": "lumiere_refresh_token", "expiresIn": 86400}
    })

@app.post("/api/v1/auth/register")
def auth_register(body: Dict[str, Any]):
    return api_envelope({
        "user": {"id": "user-guest", "email": body.get("email", "guest@lumiere.com"), "fullName": body.get("fullName", "Guest User"), "role": "USER"},
        "tokens": {"accessToken": "lumiere_guest_token", "refreshToken": "lumiere_refresh_token", "expiresIn": 86400}
    })

@app.post("/api/v1/auth/refresh")
def auth_refresh(body: Dict[str, Any]):
    return api_envelope({
        "tokens": {"accessToken": "lumiere_guest_token", "refreshToken": "lumiere_refresh_token", "expiresIn": 86400}
    })

@app.get("/api/v1/auth/me")
def auth_me():
    return api_envelope({
        "id": "user-guest",
        "email": "guest@lumiere.com",
        "fullName": "Guest User",
        "role": "USER"
    })

# ---------------------------------------------------------------------------
# Static Mounts (Images & Captures)
# ---------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/captures", StaticFiles(directory=CAPTURES_DIR), name="captures")

@app.get("/")
def root():
    return {
        "service": "Lumière Virtual Try-On API",
        "status": "online",
        "endpoints": "/api/docs",
        "productsCount": len(PRODUCTS_MASTER)
    }

if __name__ == "__main__":
    import uvicorn
    print("\n✨ Starting Lumière Virtual Try-On Backend on http://localhost:4000 ✨")
    print("👉 API Documentation: http://localhost:4000/api/docs")
    print("👉 Frontend Connected: http://localhost:3000\n")
    uvicorn.run(app, host="0.0.0.0", port=4000)

