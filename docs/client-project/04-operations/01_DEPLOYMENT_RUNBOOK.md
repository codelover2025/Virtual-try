# DEPLOYMENT RUNBOOK

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Sources** | `README.md`, `docs/DEVELOPER_GUIDE.md`, `run_web.bat`, `requirements.txt`, `server.py`, `frontend/package.json` |

## 1. Prerequisites

| Component | Requirement |
|---|---|
| Node.js | v20.x or higher (minimum v18.18+) |
| Package manager | pnpm v9+ (recommended) or npm |
| Python (backend, optional) | 3.x with pip |
| OS | Windows, macOS, or Linux |
| Hardware | Webcam supporting 720p @ 30 FPS; WebGL-capable GPU for 3D pieces |
| Browser context | `http://localhost` or HTTPS (required for `getUserMedia`) |

## 2. Frontend — Development

```bash
cd frontend
pnpm install
pnpm dev # next dev --port 3000 → http://localhost:3000
```

Windows one-launch: double-click [`run_web.bat`](../../../run_web.bat) in the repository root — it starts the backend API (`python server.py`, port 4000) and the frontend (`pnpm dev`, port 3000) in separate consoles.

## 3. Frontend — Production

```bash
cd frontend
pnpm typecheck # tsc --noEmit — must report 0 errors
pnpm build # next build
pnpm start # next start --port 3000
```

The frontend is **standalone-capable**: MediaPipe models and WASM runtimes ship inside `frontend/public/models/`, catalogue works offline via fallback data. It can be hosted on any Node-capable or static-friendly platform that preserves the `public/` assets.

## 4. Backend API — Optional

```bash
# from repository root
pip install -r requirements.txt # fastapi, uvicorn, pydantic
python server.py
# http://localhost:4000 | Swagger: http://localhost:4000/api/docs
```

The server binds `0.0.0.0:4000`, mounts `/static` (product imagery) and `/captures` (saved snapshots), and creates the `captures/` directory on first run.

## 5. Environment Configuration

| Setting | Default | Where | Production action |
|---|---|---|---|
| Frontend port | 3000 | `package.json` scripts | Adjust script or platform port |
| API port | 4000 | `server.py` `uvicorn.run` | Adjust as needed |
| CORS origins | `["*"]` (dev) | `server.py` `CORSMiddleware` | **Restrict to the deployed frontend origin before going live** (Risk R-09) |
| API base URL | `http://localhost:4000/api/v1` | `frontend/src/api-client/` + `frontend/.env.example` | Set env to deployed API URL |
| Capture mirror file | `captured_image_with_jewelry.png` (repo root) | `server.py` upload handler | Disable/redirect for multi-user hosting |

## 6. Mobile / LAN Testing

Browsers only expose the camera in secure contexts. To test on a phone over the LAN, front the dev server with HTTPS (e.g. `mkcert` local CA or `ngrok` tunnel), then open the tunnel URL and grant camera permission.

## 7. Verification Checklist (post-deploy)

| # | Check | Command / Action | Expected |
|---|---|---|---|
| 1 | Frontend up | Browse `/` | Storefront renders |
| 2 | Studio up | Browse `/try-on`, allow camera | Viewfinder + FPS readout |
| 3 | Backend up | `GET /` on API port | `{"status": "online", "productsCount": 17}` |
| 4 | API docs | `/api/docs` | Swagger UI |
| 5 | Catalogue call | `GET /api/v1/products` | Enveloped product list |
| 6 | Capture flow | Snap a photo in studio | File appears in `captures/` |
| 7 | Standalone mode | Stop backend, reload `/try-on` | Fallback catalogue still works |
| 8 | Privacy | DevTools Network during try-on | No frame/landmark traffic |

## 8. Rollback

Both tiers are stateless aside from files in `captures/`:
- Frontend: redeploy previous build (or previous git tag/commit) and restart.
- Backend: restore previous `server.py` / container and restart; `captures/` remains intact.

## 9. Troubleshooting (documented in product)

| Symptom | Action |
|---|---|
| Black screen / camera blocked | Browser padlock → Allow; close apps (Zoom/Teams) holding the webcam |
| No camera on LAN mobile | Serve over HTTPS (mkcert/ngrok) |
| API unreachable | Frontend degrades automatically to fallback catalogue |
| Full troubleshooting matrix | `DOCUMENTATION.md` §9, `docs/DEVELOPER_GUIDE.md` §5 |
