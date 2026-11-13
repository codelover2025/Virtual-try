# END-USER MANUAL

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Audience** | Shoppers using the storefront and try-on studio |
| **Sources** | `README.md`, `docs/TRY_ON_STUDIO.md`, `DOCUMENTATION.md` §9 |

## 1. What You Can Do

- Browse the jewellery catalogue (Necklaces, Earrings, Rings, Bangles).
- Try pieces live on your camera — earrings on your earlobes, necklaces on your neckline, rings on your ring finger, bangles on your wrist.
- Wear multiple pieces at once in the Multi-Jewellery Studio.
- Fine-tune fit and save high-resolution snapshots.
- Everything runs privately in your browser — your video never leaves your device.

## 2. Getting Started

1. Open the studio (e.g. `http://localhost:3000` locally, or the hosted site) and go to **Try On**.
2. When prompted, **Allow** camera access. (If blocked: click the padlock/camera icon in the address bar → Allow → reload.)
3. You'll see yourself in a mirrored viewfinder, like a mirror.

> Good light on your face and a visible shoulder line help necklaces track best. For rings and bangles, show your hand to the camera.

## 3. Trying a Single Piece

1. Pick any jewellery piece from the switcher.
2. The piece appears anchored on you and follows your movement.
3. Pick another piece of the **same type** to swap instantly — no waiting, no restart.
4. Use the **Fine-Tune Fit** card if needed:
 - **Size Ratio**: 80%–120%
 - **Vertical Position**: raises/lowers the piece on your body
5. Prefer a different type of jewellery? Just pick it — you'll be moved straight into the Multi-Jewellery Studio wearing both (see §4).

## 4. Wearing Multiple Pieces (Multi-Jewellery Studio)

Reach it by picking a second piece from a different category, or open `/try-on/multi` directly.

- Mix one Necklace + Earrings + Ring(s) + Bangles simultaneously.
- The **Active Multi-Fitting** bar lists every piece you're wearing; click a pill's **× Remove** to take just that piece off.
- **Fit sliders in this mode control the necklace**:
 - **Necklace Size**: 80%–120% (steps of 2%)
 - **Drape Length**: −30 (tight choker collar) to +30 (longer chest drop)
 - Not wearing a necklace? The panel tells you to add one, with a **Browse Necklaces** shortcut.
- **Exit Multi Mode** returns you to single-piece mode, keeping your main piece.

## 5. Capturing a Look

Click the capture button to save a full-resolution snapshot of the composited try-on (you + jewellery). With the studio backend running, snapshots are also stored server-side and downloadable from the gallery.

## 6. Quick Answers (from the product FAQ)

| Question | Answer |
|---|---|
| Can I try multiple pieces at once? | Yes — `/try-on/multi`, or just pick a different category while trying something on. |
| Why can I only adjust the necklace in multi mode? | Other pieces stay locked to calibrated body tracking for realism; sliders focus on neckline drape so bridal sets fit naturally. |
| Do I need an account or a special app? | No. It runs 100% in your browser with no server-side video processing. |
| Black screen or camera blocked? | Allow camera in the browser's padlock menu; close other apps (Zoom/Teams) using the webcam. |
