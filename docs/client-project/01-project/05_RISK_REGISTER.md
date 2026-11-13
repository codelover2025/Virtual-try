# RISK REGISTER

| | |
|---|---|
| **Project** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Basis** | Risks evidenced by the project's own troubleshooting notes, architecture decisions, and commit history |

Scoring: **P** (Probability L/M/H) · **I** (Impact L/M/H) · **Sev** = P×I.

| ID | Risk | P | I | Sev | Mitigation (in product / process) | Status |
|---|---|---|---|---|---|---|
| R-01 | Browser camera permission blocked or black screen (user denies access, or another app like Zoom/Teams holds an exclusive webcam lock) | M | H | High | Documented recovery steps (`DOCUMENTATION.md` Q1, `DEVELOPER_GUIDE.md` §5); on-screen prompts; camera health watchdog in `camera-engine.ts` | Open (operational) |
| R-02 | `getUserMedia` unavailable outside secure context — mobile/LAN testing over plain HTTP fails | M | M | Medium | Documented requirement: `https://` or `http://localhost`; HTTPS reverse proxy guidance (`mkcert`, `ngrok`) in `DEVELOPER_GUIDE.md` | Mitigated |
| R-03 | ML inference cost causing judder on lower-end hardware | M | H | High | Decoupled 15–20 Hz inference + 60 FPS spring interpolation; AdaptiveController lowers detection frequency / resolution under frame-budget pressure | Mitigated (by design) |
| R-04 | Model reload freeze when users swap pieces/categories | M | H | High | Persistent `cachedDetectors` map — models loaded once per session (architecture decision, `docs/ARCHITECTURE.md` §4) | Closed (implemented) |
| R-05 | Slider-drag lag from excessive React re-renders | M | M | Medium | State throttling: FPS updates 500 ms; critical transitions immediate (97% render reduction) | Closed (implemented) |
| R-06 | Gemstone colour washout under dim webcam lighting (3D rings) | H | M | High | Material formula: `transmission=0`, `emissiveIntensity=0.35`, faceted `flatShading`, local point light; resolved through iterations (commits `b884c35`, revert `18bc886`, fix `ef957c5`) | Closed (fixed) |
| R-07 | Necklace chain anchoring artefacts (bead dots on shoulders, disconnected chain ends) | M | M | Medium | Chain ends anchored to neck/shoulder line with catenary drape extension; artificial extension removed (commits `b55589c`, `74b12da`, `2dd63f6`) | Closed (fixed) |
| R-08 | Backend persistence is in-memory/disk only (no database); restart loses session state | H | L | Medium | Backend is optional by design — frontend runs standalone on fallback catalogue; captures persist to `captures/` on disk | Accepted |
| R-09 | CORS wide-open (`allow_origins=["*"]`) acceptable for local dev but not for public hosting | M | M | Medium | Flag in deployment runbook: restrict `allow_origins` to the deployed frontend origin before going live | Open (deployment gate) |
| R-10 | Asset quality variance (non-transparent or misoriented PNGs) breaking overlays | M | M | Medium | Asset spec enforced via Admin Manual (32-bit RGBA, 800–1200 px, orientation rules from `DEVELOPER_GUIDE.md` §3.1) | Mitigated (process) |

## Review Log

| Date | Reviewer | Changes |
|---|---|---|
| ____ | ____ | Initial compilation with this documentation pack |
