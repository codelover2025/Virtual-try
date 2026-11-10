import os
import cv2
import numpy as np
import mediapipe as mp
import tkinter as tk
from tkinter import ttk, messagebox
from collections import deque
from PIL import Image, ImageTk

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def get_asset_path(rel_path):
    """Normalize and resolve path relative to project directory."""
    clean_path = rel_path.replace("\\", os.sep).replace("/", os.sep)
    return os.path.join(BASE_DIR, clean_path)


def overlay_transparent(background, overlay, x_center, y_center, width, height, angle=0):
    """
    Overlays a 4-channel RGBA image onto a 3-channel BGR background image
    at (x_center, y_center), with safety boundary clipping and optional rotation.
    """
    if overlay is None or overlay.size == 0 or width <= 0 or height <= 0:
        return background

    # Ensure overlay has an alpha channel
    if overlay.shape[2] == 3:
        overlay = cv2.cvtColor(overlay, cv2.COLOR_BGR2BGRA)

    # Resize overlay to target dimensions
    resized = cv2.resize(overlay, (int(width), int(height)), interpolation=cv2.INTER_AREA)

    # Apply rotation if specified
    if angle != 0:
        h, w = resized.shape[:2]
        center = (w // 2, h // 2)
        rot_mat = cv2.getRotationMatrix2D(center, angle, 1.0)
        cos_val = np.abs(rot_mat[0, 0])
        sin_val = np.abs(rot_mat[0, 1])
        new_w = int((h * sin_val) + (w * cos_val))
        new_h = int((h * cos_val) + (w * sin_val))
        rot_mat[0, 2] += (new_w / 2) - center[0]
        rot_mat[1, 2] += (new_h / 2) - center[1]
        resized = cv2.warpAffine(
            resized,
            rot_mat,
            (new_w, new_h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0)
        )

    ol_h, ol_w = resized.shape[:2]
    bg_h, bg_w = background.shape[:2]

    # Calculate coordinates
    x1 = int(x_center - ol_w // 2)
    y1 = int(y_center - ol_h // 2)
    x2 = x1 + ol_w
    y2 = y1 + ol_h

    # Clip coordinates to background boundaries
    bg_x1 = max(0, x1)
    bg_y1 = max(0, y1)
    bg_x2 = min(bg_w, x2)
    bg_y2 = min(bg_h, y2)

    # Corresponding region in overlay
    ol_x1 = max(0, bg_x1 - x1)
    ol_y1 = max(0, bg_y1 - y1)
    ol_x2 = ol_x1 + (bg_x2 - bg_x1)
    ol_y2 = ol_y1 + (bg_y2 - bg_y1)

    if bg_x2 <= bg_x1 or bg_y2 <= bg_y1 or ol_x2 <= ol_x1 or ol_y2 <= ol_y1:
        return background

    bg_roi = background[bg_y1:bg_y2, bg_x1:bg_x2]
    ol_crop = resized[ol_y1:ol_y2, ol_x1:ol_x2]

    alpha = (ol_crop[:, :, 3] / 255.0)[:, :, np.newaxis]
    color = ol_crop[:, :, :3]

    blended = (color * alpha + bg_roi * (1.0 - alpha)).astype(np.uint8)
    background[bg_y1:bg_y2, bg_x1:bg_x2] = blended
    return background


def rotate_and_occlude_ring(ring_rgba, width, height, angle_deg):
    """
    Prepares a realistic ring graphic:
    1. Resizes with perspective squashing (simulating a circular band viewed at an angle as an ellipse).
    2. Applies an occlusion alpha gradient to the bottom half of the band so it appears to wrap
       under / behind the finger instead of floating like a flat sticker.
    3. Rotates the ring around its center using cv2.warpAffine with an expanded bounding box,
       keeping the ring center aligned and unclipped.
    """
    if ring_rgba is None or ring_rgba.size == 0 or width <= 0 or height <= 0:
        return ring_rgba

    # Ensure 4-channel BGRA
    if len(ring_rgba.shape) == 2:
        ring_rgba = cv2.cvtColor(ring_rgba, cv2.COLOR_GRAY2BGRA)
    elif ring_rgba.shape[2] == 3:
        ring_rgba = cv2.cvtColor(ring_rgba, cv2.COLOR_BGR2BGRA)

    # 1. Perspective Squashing: Scale to target width and squashed height
    resized = cv2.resize(ring_rgba, (int(width), int(height)), interpolation=cv2.INTER_AREA)

    # 2. Occlusion gradient: The lower half of the band wraps behind the finger,
    # so we fade the alpha of the bottom 45% of the band
    h_r, w_r = resized.shape[:2]
    occ = resized.copy().astype(np.float32)
    cutoff = int(h_r * 0.52)
    for y in range(cutoff, h_r):
        fade = max(0.18, 1.0 - (y - cutoff) / max(1, (h_r - cutoff)) * 0.85)
        occ[y, :, 3] *= fade
    occ = occ.astype(np.uint8)

    # 3. Canvas Expansion & Rotation:
    # Compute expanded canvas to prevent corner clipping during rotation
    (h, w) = occ.shape[:2]
    center = (w // 2, h // 2)
    rot_mat = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos_val = np.abs(rot_mat[0, 0])
    sin_val = np.abs(rot_mat[0, 1])
    new_w = int((h * sin_val) + (w * cos_val))
    new_h = int((h * cos_val) + (w * sin_val))
    rot_mat[0, 2] += (new_w / 2) - center[0]
    rot_mat[1, 2] += (new_h / 2) - center[1]

    rotated = cv2.warpAffine(
        occ, rot_mat, (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0)
    )
    return rotated


def rotate_and_occlude_bangle(bangle_rgba, width, height, angle_deg):
    """
    Prepares a realistic bangle graphic:
    1. Resizes with perspective squashing (spans wrist horizontally, squashed along arm).
    2. Applies an occlusion gradient to the back half of the band so it appears to wrap
       under / behind the wrist instead of floating like a flat sticker.
    3. Rotates perpendicular to the arm axis using cv2.warpAffine with expanded canvas.
    """
    if bangle_rgba is None or bangle_rgba.size == 0 or width <= 0 or height <= 0:
        return bangle_rgba

    if len(bangle_rgba.shape) == 2:
        bangle_rgba = cv2.cvtColor(bangle_rgba, cv2.COLOR_GRAY2BGRA)
    elif bangle_rgba.shape[2] == 3:
        bangle_rgba = cv2.cvtColor(bangle_rgba, cv2.COLOR_BGR2BGRA)

    resized = cv2.resize(bangle_rgba, (int(width), int(height)), interpolation=cv2.INTER_AREA)

    # Occlusion gradient: fade/darken the back arc (top portion of the image)
    # so that the front arc clearly stands out over the wrist
    h_r, w_r = resized.shape[:2]
    occ = resized.copy().astype(np.float32)
    cutoff = int(h_r * 0.48)
    for y in range(0, cutoff):
        fade = max(0.25, (y / max(1, cutoff)) * 0.85 + 0.15)
        occ[y, :, 3] *= fade
        occ[y, :, :3] *= fade
    occ = occ.astype(np.uint8)

    (h, w) = occ.shape[:2]
    center = (w // 2, h // 2)
    rot_mat = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos_val = np.abs(rot_mat[0, 0])
    sin_val = np.abs(rot_mat[0, 1])
    new_w = int((h * sin_val) + (w * cos_val))
    new_h = int((h * cos_val) + (w * sin_val))
    rot_mat[0, 2] += (new_w / 2) - center[0]
    rot_mat[1, 2] += (new_h / 2) - center[1]

    rotated = cv2.warpAffine(
        occ, rot_mat, (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0)
    )
    return rotated


def overlay_rgba(background, overlay_rgba, center_x, center_y):
    """
    Overlays a 4-channel RGBA image onto a 3-channel BGR background at (center_x, center_y).
    Safely clips coordinates to background bounds so it never crashes near frame boundaries.
    """
    if overlay_rgba is None or overlay_rgba.size == 0:
        return background

    ol_h, ol_w = overlay_rgba.shape[:2]
    bg_h, bg_w = background.shape[:2]

    # Calculate bounding box
    x1 = int(center_x - ol_w // 2)
    y1 = int(center_y - ol_h // 2)
    x2 = x1 + ol_w
    y2 = y1 + ol_h

    # Clip to background frame
    bg_x1 = max(0, x1)
    bg_y1 = max(0, y1)
    bg_x2 = min(bg_w, x2)
    bg_y2 = min(bg_h, y2)

    # Corresponding region in the overlay
    ol_x1 = max(0, bg_x1 - x1)
    ol_y1 = max(0, bg_y1 - y1)
    ol_x2 = ol_x1 + (bg_x2 - bg_x1)
    ol_y2 = ol_y1 + (bg_y2 - bg_y1)

    if bg_x2 <= bg_x1 or bg_y2 <= bg_y1 or ol_x2 <= ol_x1 or ol_y2 <= ol_y1:
        return background

    bg_roi = background[bg_y1:bg_y2, bg_x1:bg_x2]
    ol_crop = overlay_rgba[ol_y1:ol_y2, ol_x1:ol_x2]

    alpha = (ol_crop[:, :, 3] / 255.0)[:, :, np.newaxis]
    color = ol_crop[:, :, :3]

    blended = (color * alpha + bg_roi * (1.0 - alpha)).astype(np.uint8)
    background[bg_y1:bg_y2, bg_x1:bg_x2] = blended
    return background


class VirtualTryOnApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Lumière - Virtual Jewellery Try-On")

        # Set application icon safely
        icon_path = get_asset_path("static/vashions_icon.ico")
        if os.path.exists(icon_path):
            try:
                self.root.iconbitmap(icon_path)
            except Exception as e:
                print(f"Could not load icon: {e}")

        self.current_design = None
        self.try_on_window = None
        self.cap = None
        self.is_camera_running = False
        self.after_id = None
        self.face_bbox_buffer = deque(maxlen=10)
        self.ear_r_buffer = deque(maxlen=6)
        self.ear_l_buffer = deque(maxlen=6)
        self.ring_buffer = deque(maxlen=5)
        self.bangle_buffer = deque(maxlen=5)

        # Real-time fine-tuning parameters for earrings
        self.earring_outward_ratio = 0.025  # tuned inward to align directly with earlobes
        self.earring_down_ratio = 0.13
        self.earring_scale = 0.12

        # Real-time fine-tuning parameters for necklace
        self.necklace_down_ratio = 0.08  # raised up to wrap around neck and collarbone
        self.necklace_scale = 1.50

        # Real-time fine-tuning parameters for ring
        self.ring_scale = 1.00
        self.ring_pos_ratio = 0.40
        self.ring_smoothed_state = None  # (x, y, w, h, angle)
        self.hand_lost_counter = 0

        # Real-time fine-tuning parameters for bangle
        self.bangle_scale = 1.00
        self.bangle_pos_ratio = 0.16
        self.bangle_smoothed_state = None  # (x, y, w, h, angle)

        self.toast_text = ""
        self.toast_timer = 0
        self.catalog_boxes = {}

        # Initialize MediaPipe models
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5
        )

        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            min_detection_confidence=0.5, min_tracking_confidence=0.5
        )

        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False, max_num_faces=1, refine_landmarks=True
        )

        # Load default jewellery models
        self.necklace_image_path = "static/Image/Necklace/necklace_1.png"
        self.ring_image_path = "static/Image/Ring/ring_1.png"
        self.earring_image_path = "static/Image/Earring/earring_1.png"
        self.bangle_image_path = "static/Image/Bangle/bangle_1.png"

        self.necklace_image = self.load_image(self.necklace_image_path)
        self.ring_image = self.load_image(self.ring_image_path)
        self.earring_image = self.load_image(self.earring_image_path)
        self.bangle_image = self.load_image(self.bangle_image_path)

        self.create_widgets()

    def load_image(self, rel_path):
        """Loads an image with alpha channel, returning a placeholder if not found."""
        full_path = get_asset_path(rel_path)
        if os.path.exists(full_path):
            img = cv2.imread(full_path, cv2.IMREAD_UNCHANGED)
            if img is not None:
                if len(img.shape) == 2:
                    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
                elif img.shape[2] == 3:
                    img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
                return img
        print(f"[Warning] Asset not found: {full_path}. Creating fallback placeholder.")
        fallback = np.zeros((100, 100, 4), dtype=np.uint8)
        fallback[:, :] = (0, 215, 255, 200)  # Gold square
        return fallback

    def create_widgets(self):
        # Main Frame container
        self.main_frame = tk.Frame(self.root, width=1280, height=720, bg="#1e1e1e")
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # Left control panel
        self.left_frame = tk.Frame(self.main_frame, width=320, height=720, bg="#181818")
        self.left_frame.pack(side=tk.LEFT, fill=tk.Y)
        self.left_frame.pack_propagate(False)

        # App Heading
        self.heading = tk.Label(
            self.left_frame,
            text="✨ Lumière ✨",
            font=("Helvetica", 22, "bold"),
            bg="#181818",
            fg="#e0a96d"
        )
        self.heading.pack(pady=(40, 10))

        subheading = tk.Label(
            self.left_frame,
            text="AI Virtual Jewellery Try-On",
            font=("Helvetica", 11),
            bg="#181818",
            fg="#888888"
        )
        subheading.pack(pady=(0, 30))

        # Buttons with modern styling
        buttons = [
            ("💎 Necklace Try-On", lambda: self.show_necklaces("Necklace")),
            ("💍 Ring Try-On", lambda: self.show_rings("Ring")),
            ("✨ Earring Try-On", lambda: self.show_earring("Earring")),
            ("💫 Bangle Try-On", lambda: self.show_bangle("Bangle"))
        ]

        for text, cmd in buttons:
            btn = tk.Button(
                self.left_frame,
                text=text,
                command=cmd,
                font=("Helvetica", 12, "bold"),
                bg="#2a2a2a",
                fg="#ffffff",
                activebackground="#e0a96d",
                activeforeground="#000000",
                relief=tk.FLAT,
                bd=0,
                padx=15,
                pady=12,
                cursor="hand2"
            )
            btn.pack(fill=tk.X, padx=30, pady=10)

        # Right display area (Hero Banner)
        self.right_frame = tk.Frame(self.main_frame, width=960, height=720, bg="#121212")
        self.right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        profile_path = get_asset_path("static/profile.jpg")
        if os.path.exists(profile_path):
            try:
                raw_image = Image.open(profile_path)
                resized_image = raw_image.resize((960, 720), Image.LANCZOS)
                self.hero_photo = ImageTk.PhotoImage(resized_image)
                hero_label = tk.Label(self.right_frame, image=self.hero_photo, bg="#121212")
                hero_label.pack(fill=tk.BOTH, expand=True)
            except Exception as e:
                print(f"Could not load hero banner: {e}")
        else:
            placeholder = tk.Label(
                self.right_frame,
                text="Select a jewellery category on the left to start Virtual Try-On",
                font=("Helvetica", 16),
                bg="#121212",
                fg="#aaaaaa"
            )
            placeholder.pack(expand=True)

    def show_necklaces(self, design):
        self.current_design = design
        self.show_virtual_try_on([
            "static/Image/Necklace/necklace_1.png",
            "static/Image/Necklace/necklace_20.png",
            "static/Image/Necklace/necklace_24.png",
            "static/Image/Necklace/necklace_28.png",
        ], design)

    def show_rings(self, design):
        self.current_design = design
        self.show_virtual_try_on([
            "static/Image/Ring/ring_1.png",
            "static/Image/Ring/ring_2.png",
            "static/Image/Ring/ring_3.png",
            "static/Image/Ring/ring_4.png",
            "static/Image/Ring/ring_5.png"
        ], design)

    def show_earring(self, design):
        self.current_design = design
        self.show_virtual_try_on([
            "static/Image/Earring/earring_1.png",
            "static/Image/Earring/earring_2.png",
            "static/Image/Earring/earring_3.png",
            "static/Image/Earring/earring_4.png",
            "static/Image/Earring/earring_5.png"
        ], design)

    def show_bangle(self, design):
        self.current_design = design
        self.show_virtual_try_on([
            "static/Image/Bangle/bangle_1.png",
            "static/Image/Bangle/bangle_2.png",
            "static/Image/Bangle/bangle_3.png",
            "static/Image/Bangle/bangle_4.png"
        ], design)

    def change_necklace_image(self, path):
        self.necklace_image_path = path
        self.necklace_image = self.load_image(path)

    def change_ring_image(self, path):
        self.ring_image_path = path
        self.ring_image = self.load_image(path)

    def change_earring_image(self, path):
        self.earring_image_path = path
        self.earring_image = self.load_image(path)

    def change_bangle_image(self, path):
        self.bangle_image_path = path
        self.bangle_image = self.load_image(path)
        self.bangle_smoothed_state = None

    def show_virtual_try_on(self, image_list, design):
        # Close any existing try-on window cleanly before opening a new one
        if self.try_on_window is not None and tk.Toplevel.winfo_exists(self.try_on_window):
            self.close_try_on_window()

        self.try_on_window = tk.Toplevel(self.root)
        self.try_on_window.title(f"Virtual Try On - {design}")
        self.try_on_window.geometry("1024x720")
        self.try_on_window.configure(bg="#202020")
        self.try_on_window.is_fullscreen = False
        self.try_on_window.protocol("WM_DELETE_WINDOW", self.close_try_on_window)

        main_frame = tk.Frame(self.try_on_window, bg="#202020")
        main_frame.pack(fill=tk.BOTH, expand=True)

        left_frame = tk.Frame(main_frame, bg="#202020")
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=15, pady=15)

        right_frame = tk.Frame(main_frame, width=280, bg="#2b2b2b")
        right_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=(0, 15), pady=15)
        right_frame.pack_propagate(False)

        # Webcam display canvas
        self.modal_webcam_canvas = tk.Canvas(left_frame, width=640, height=540, bg="#000000", highlightthickness=0)
        self.modal_webcam_canvas.pack(side=tk.TOP, pady=10)

        # Button toolbar
        button_frame = tk.Frame(left_frame, bg="#202020")
        button_frame.pack(side=tk.TOP, pady=10)

        # Safe icon loader with text fallback
        def get_btn_icon(icon_name):
            p = get_asset_path(f"static/icons/{icon_name}")
            if os.path.exists(p):
                try:
                    return ImageTk.PhotoImage(Image.open(p).resize((28, 28), Image.LANCZOS))
                except Exception:
                    pass
            return None

        self.quit_icon = get_btn_icon("quit_icon.png")
        self.capture_icon = get_btn_icon("capture_icon.png")
        self.fullscreen_icon = get_btn_icon("fullscreen_icon.png")

        btn1 = tk.Button(
            button_frame, text="Close" if not self.quit_icon else "",
            image=self.quit_icon, command=self.close_try_on_window,
            bg="#dc3545", fg="white", cursor="hand2", bd=0, padx=10, pady=5
        )
        btn1.pack(side=tk.LEFT, padx=10)

        btn2 = tk.Button(
            button_frame, text="Capture" if not self.capture_icon else "",
            image=self.capture_icon, command=self.button3_action,
            bg="#0d6efd", fg="white", cursor="hand2", bd=0, padx=10, pady=5
        )
        btn2.pack(side=tk.LEFT, padx=10)

        btn3 = tk.Button(
            button_frame, text="Fullscreen" if not self.fullscreen_icon else "",
            image=self.fullscreen_icon, command=self.button2_action,
            bg="#6c757d", fg="white", cursor="hand2", bd=0, padx=10, pady=5
        )
        btn3.pack(side=tk.LEFT, padx=10)

        # Keyboard control hint
        hint_text = (
            "💡 Tip: Arrow keys (← → ↑ ↓) fine-tune earring position"
            if design == "Earring" else
            "💡 Tip: Arrow keys (↑ ↓) adjust necklace height, (← →) adjust width"
            if design == "Necklace" else
            "💡 Tip: Arrow keys (↑ ↓) adjust ring size, (← →) slide along finger"
            if design == "Ring" else
            "💡 Tip: Arrow keys (↑ ↓) adjust bangle size, (← →) slide along arm"
            if design == "Bangle" else
            "💡 Tip: Live virtual try-on tracking active"
        )
        hint_lbl = tk.Label(
            left_frame, text=hint_text,
            font=("Helvetica", 9), bg="#202020", fg="#aaaaaa"
        )
        hint_lbl.pack(side=tk.TOP, pady=2)

        # Bind arrow keys for real-time calibration
        self.try_on_window.bind("<Left>", self.handle_left_key)
        self.try_on_window.bind("<Right>", self.handle_right_key)
        self.try_on_window.bind("<Up>", self.handle_up_key)
        self.try_on_window.bind("<Down>", self.handle_down_key)

        # Catalog header
        cat_title = tk.Label(
            right_frame, text=f"Select {design}",
            font=("Helvetica", 14, "bold"), bg="#2b2b2b", fg="#e0a96d"
        )
        cat_title.pack(pady=10)

        # Scrollable catalogue list
        canvas = tk.Canvas(right_frame, bg="#2b2b2b", highlightthickness=0)
        scrollbar = tk.Scrollbar(right_frame, orient=tk.VERTICAL, command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        image_frame = tk.Frame(canvas, bg="#2b2b2b")
        canvas.create_window((0, 0), window=image_frame, anchor=tk.NW)

        def update_scroll(event):
            canvas.config(scrollregion=canvas.bbox("all"))

        image_frame.bind("<Configure>", update_scroll)

        # Populate thumbnails
        self.catalog_photos = []
        self.catalog_boxes = {}
        for idx, image_rel_path in enumerate(image_list, start=1):
            is_active = (idx == 1)
            item_box = tk.Frame(image_frame, bg="#e0a96d" if is_active else "#333333", bd=2, relief=tk.RAISED)
            item_box.pack(pady=10, padx=15, fill=tk.X)
            self.catalog_boxes[image_rel_path] = item_box

            item_lbl = tk.Label(item_box, text=f"{design} #{idx}", bg="#333333", fg="#ffffff", font=("Helvetica", 9, "bold"))
            item_lbl.pack(pady=(5, 2))

            full_p = get_asset_path(image_rel_path)
            if os.path.exists(full_p):
                try:
                    pil_img = Image.open(full_p).resize((100, 100), Image.LANCZOS)
                except Exception:
                    pil_img = Image.new("RGBA", (100, 100), (80, 80, 80, 255))
            else:
                pil_img = Image.new("RGBA", (100, 100), (80, 80, 80, 255))

            photo = ImageTk.PhotoImage(pil_img)
            self.catalog_photos.append(photo)

            thumb = tk.Label(item_box, image=photo, bg="#222222", cursor="hand2")
            thumb.image_path = image_rel_path
            thumb.pack(pady=(0, 5), padx=5)
            thumb.bind("<Button-1>", self.on_image_click)

        # Initialize webcam
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            messagebox.showwarning(
                "Camera Warning",
                "Could not access webcam device 0.\nPlease check your camera connection or permissions."
            )
            return

        self.is_camera_running = True
        self.update_frame()

    def button1_action(self):
        """Action for quit button."""
        self.close_try_on_window()

    def button2_action(self):
        """Toggle fullscreen mode."""
        if self.try_on_window:
            self.try_on_window.is_fullscreen = not self.try_on_window.is_fullscreen
            self.try_on_window.attributes("-fullscreen", self.try_on_window.is_fullscreen)

    def button3_action(self):
        """Capture screenshot with jewellery overlay applied."""
        if self.cap is not None and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret:
                frame = cv2.flip(frame, 1)
                frame_with_overlay, _ = self.apply_jewelry_overlay(frame)
                out_path = os.path.join(BASE_DIR, "captured_image_with_jewelry.png")
                cv2.imwrite(out_path, frame_with_overlay)
                print(f"Captured snapshot saved to {out_path}")
                messagebox.showinfo("Saved", f"Snapshot saved successfully!\n{out_path}")

    def handle_up_key(self, event=None):
        if self.current_design == "Necklace":
            self.necklace_down_ratio = max(-0.10, min(0.35, self.necklace_down_ratio - 0.01))
            self.show_toast(f"Necklace Height: {self.necklace_down_ratio:+.2f}")
        elif self.current_design == "Earring":
            self.adjust_earring_height(-0.005)
        elif self.current_design == "Ring":
            self.ring_scale = max(0.6, min(2.5, self.ring_scale + 0.05))
            self.show_toast(f"Ring Size: {self.ring_scale:.2f}")
        elif self.current_design == "Bangle":
            self.bangle_scale = max(0.60, min(1.60, self.bangle_scale + 0.05))
            self.show_toast(f"Bangle Size: {self.bangle_scale:.2f}")

    def handle_down_key(self, event=None):
        if self.current_design == "Necklace":
            self.necklace_down_ratio = max(-0.10, min(0.35, self.necklace_down_ratio + 0.01))
            self.show_toast(f"Necklace Height: {self.necklace_down_ratio:+.2f}")
        elif self.current_design == "Earring":
            self.adjust_earring_height(0.005)
        elif self.current_design == "Ring":
            self.ring_scale = max(0.6, min(2.5, self.ring_scale - 0.05))
            self.show_toast(f"Ring Size: {self.ring_scale:.2f}")
        elif self.current_design == "Bangle":
            self.bangle_scale = max(0.60, min(1.60, self.bangle_scale - 0.05))
            self.show_toast(f"Bangle Size: {self.bangle_scale:.2f}")

    def handle_left_key(self, event=None):
        if self.current_design == "Necklace":
            self.necklace_scale = max(1.0, min(2.5, self.necklace_scale - 0.05))
            self.show_toast(f"Necklace Width: {self.necklace_scale:.2f}")
        elif self.current_design == "Earring":
            self.adjust_earring_spacing(-0.005)
        elif self.current_design == "Ring":
            self.ring_pos_ratio = max(0.2, min(0.8, self.ring_pos_ratio - 0.05))
            self.show_toast(f"Ring Position: {self.ring_pos_ratio:.2f}")
        elif self.current_design == "Bangle":
            self.bangle_pos_ratio = max(0.05, min(0.40, self.bangle_pos_ratio - 0.02))
            self.show_toast(f"Bangle Offset: {self.bangle_pos_ratio:.2f}")

    def handle_right_key(self, event=None):
        if self.current_design == "Necklace":
            self.necklace_scale = max(1.0, min(2.5, self.necklace_scale + 0.05))
            self.show_toast(f"Necklace Width: {self.necklace_scale:.2f}")
        elif self.current_design == "Earring":
            self.adjust_earring_spacing(0.005)
        elif self.current_design == "Ring":
            self.ring_pos_ratio = max(0.2, min(0.8, self.ring_pos_ratio + 0.05))
            self.show_toast(f"Ring Position: {self.ring_pos_ratio:.2f}")
        elif self.current_design == "Bangle":
            self.bangle_pos_ratio = max(0.05, min(0.40, self.bangle_pos_ratio + 0.02))
            self.show_toast(f"Bangle Offset: {self.bangle_pos_ratio:.2f}")

    def adjust_earring_spacing(self, delta):
        self.earring_outward_ratio = max(-0.02, min(0.12, self.earring_outward_ratio + delta))
        self.show_toast(f"Earring Spacing: {self.earring_outward_ratio:+.3f}")

    def adjust_earring_height(self, delta):
        self.earring_down_ratio = max(0.04, min(0.25, self.earring_down_ratio + delta))
        self.show_toast(f"Earring Height: {self.earring_down_ratio:.3f}")

    def show_toast(self, text):
        self.toast_text = text
        self.toast_timer = 40

    def close_try_on_window(self):
        """Safely stops video loop and releases camera resource."""
        self.is_camera_running = False
        if self.after_id:
            try:
                self.root.after_cancel(self.after_id)
            except Exception:
                pass
            self.after_id = None

        if self.cap is not None:
            self.cap.release()
            self.cap = None

        if self.try_on_window is not None:
            try:
                self.try_on_window.destroy()
            except Exception:
                pass
            self.try_on_window = None

    def on_image_click(self, event):
        image_path = event.widget.image_path
        if self.current_design == "Necklace":
            self.change_necklace_image(image_path)
        elif self.current_design == "Ring":
            self.change_ring_image(image_path)
        elif self.current_design == "Earring":
            self.change_earring_image(image_path)
        elif self.current_design == "Bangle":
            self.change_bangle_image(image_path)

        # Highlight active selection
        for p, box in self.catalog_boxes.items():
            if p == image_path:
                box.config(bg="#e0a96d")
            else:
                box.config(bg="#333333")

    # ------------------ Core AI Jewellery Overlay Pipeline ------------------

    def add_necklace_overlay(self, frame):
        """Detects chin position and head orientation to place necklace smoothly in the chest area."""
        h, w, _ = frame.shape
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mesh_results = self.face_mesh.process(frame_rgb)
        detected = False

        if mesh_results.multi_face_landmarks:
            detected = True
            lms = mesh_results.multi_face_landmarks[0].landmark
            # Chin landmark 152
            chin_x = int(lms[152].x * w)
            chin_y = int(lms[152].y * h)

            # Tragus landmarks (234: screen-left, 454: screen-right)
            tr_x, tr_y = lms[234].x * w, lms[234].y * h
            tl_x, tl_y = lms[454].x * w, lms[454].y * h
            face_w = np.hypot(tl_x - tr_x, tl_y - tr_y)
            roll_angle = np.degrees(np.arctan2(tl_y - tr_y, tl_x - tr_x))

            center_x = chin_x
            center_y = chin_y + int(face_w * self.necklace_down_ratio)
            necklace_w = int(face_w * self.necklace_scale)
            necklace_h = int(necklace_w * 0.65)

            self.face_bbox_buffer.append((center_x, center_y, necklace_w, necklace_h, roll_angle))
            cx, cy, nw, nh, rot = np.mean(self.face_bbox_buffer, axis=0)

            frame = overlay_transparent(
                frame, self.necklace_image, int(cx), int(cy), int(nw), int(nh), angle=rot * 0.4
            )
        else:
            self.face_bbox_buffer.clear()
        return frame, detected

    def add_ring_overlay(self, frame):
        """
        Detects hand landmarks and aligns the ring precisely between MCP (13) and PIP (14)
        along the ring finger axis, with realistic perspective squashing, occlusion, and EMA smoothing.
        """
        import math
        h, w, _ = frame.shape
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(frame_rgb)
        detected = False

        if results.multi_hand_landmarks:
            for hand_idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                # Check hand detection / classification confidence (> 0.70)
                hand_score = 1.0
                if results.multi_handedness and hand_idx < len(results.multi_handedness):
                    hand_score = results.multi_handedness[hand_idx].classification[0].score

                if hand_score < 0.70:
                    continue

                lms = hand_landmarks.landmark
                # 1. LANDMARK POSITIONING: Ring finger landmarks
                # MCP = 13, PIP = 14, DIP = 15, TIP = 16
                mcp = lms[13]
                pip = lms[14]
                dip = lms[15]
                tip = lms[16]

                # Convert normalized coordinates to pixel coordinates using frame dimensions
                mcp_x, mcp_y = mcp.x * w, mcp.y * h
                pip_x, pip_y = pip.x * w, pip.y * h
                tip_x, tip_y = tip.x * w, tip.y * h

                # Vector from MCP -> PIP
                dx = pip_x - mcp_x
                dy = pip_y - mcp_y
                seg_len = math.hypot(dx, dy)

                if seg_len < 12:
                    continue

                # Visibility / curl check: if ring finger is clenched into a fist, hide ring
                finger_span = math.hypot(tip_x - mcp_x, tip_y - mcp_y)
                if finger_span < seg_len * 0.75:
                    continue  # Ring finger is curled / occluded

                # Place ring center at point between MCP (13) and PIP (14), about 40% of the way:
                # center = MCP + 0.4 * (PIP - MCP)
                target_x = mcp_x + self.ring_pos_ratio * dx
                target_y = mcp_y + self.ring_pos_ratio * dy

                # 2. ROTATION:
                # Compute finger angle from vector MCP -> PIP:
                # angle = atan2(PIP.y - MCP.y, PIP.x - MCP.x)
                # Rotate ring so it is perpendicular to finger axis (gem points away from palm towards fingertip)
                finger_angle = math.atan2(dy, dx)
                target_angle = -(math.degrees(finger_angle) + 90)

                # 3. SCALING:
                # Ring width scaled dynamically from finger segment length: ~0.58 x distance(MCP, PIP)
                raw_width = seg_len * 0.58 * self.ring_scale
                target_w = float(np.clip(raw_width, 16, 120))
                # 4. REALISM: Squash ring along finger axis by ~0.70 to simulate perspective ellipse
                target_h = target_w * 0.70

                # 5. STABILITY: Exponential Moving Average (EMA) smoothing
                alpha = 0.35  # Smoothing factor (0.3 - 0.5)
                if self.ring_smoothed_state is None:
                    self.ring_smoothed_state = (target_x, target_y, target_w, target_h, target_angle)
                else:
                    prev_x, prev_y, prev_w, prev_h, prev_ang = self.ring_smoothed_state
                    # Angle interpolation handling 360 wrap-around
                    ang_diff = (target_angle - prev_ang + 180) % 360 - 180
                    smooth_ang = prev_ang + alpha * ang_diff
                    smooth_x = prev_x + alpha * (target_x - prev_x)
                    smooth_y = prev_y + alpha * (target_y - prev_y)
                    smooth_w = prev_w + alpha * (target_w - prev_w)
                    smooth_h = prev_h + alpha * (target_h - prev_h)
                    self.ring_smoothed_state = (smooth_x, smooth_y, smooth_w, smooth_h, smooth_ang)

                self.hand_lost_counter = 0
                detected = True

                # Render with perspective squashing & back-band occlusion
                sx, sy, sw, sh, sang = self.ring_smoothed_state
                rotated_ring = rotate_and_occlude_ring(self.ring_image, int(sw), int(sh), sang)
                frame = overlay_rgba(frame, rotated_ring, int(sx), int(sy))
                break  # Primary detected hand overlay applied

        if not detected:
            self.hand_lost_counter += 1
            # Hide ring if hand is lost for more than 5 consecutive frames
            if self.hand_lost_counter > 5:
                self.ring_smoothed_state = None

        return frame, detected

    def add_earring_overlay(self, frame):
        """
        Detects true earlobe positions using facial geometry, tragus landmarks,
        and head roll tilt, hanging earrings naturally from the earlobes.
        """
        import math
        h, w, _ = frame.shape
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(frame_rgb)
        detected = False

        if results.multi_face_landmarks:
            detected = True
            for face_landmarks in results.multi_face_landmarks:
                lms = face_landmarks.landmark

                # Outer eye corners (Landmark 33: Right eye, Landmark 263: Left eye)
                re_x, re_y = lms[33].x * w, lms[33].y * h
                le_x, le_y = lms[263].x * w, lms[263].y * h
                dx = le_x - re_x
                dy = le_y - re_y
                roll_angle = math.atan2(dy, dx)

                # Tragus landmarks (Landmark 234: Screen-left ear, Landmark 454: Screen-right ear)
                tr_x, tr_y = lms[234].x * w, lms[234].y * h
                tl_x, tl_y = lms[454].x * w, lms[454].y * h

                face_width = math.hypot(tl_x - tr_x, tl_y - tr_y)

                # Unit vectors pointing outward from face
                ux_out_r = -math.cos(roll_angle)
                uy_out_r = -math.sin(roll_angle)

                ux_out_l = math.cos(roll_angle)
                uy_out_l = math.sin(roll_angle)

                # Unit vector pointing downward along face
                ux_down = -math.sin(roll_angle)
                uy_down = math.cos(roll_angle)

                # Projected true earlobe coordinates using tuned calibration ratios
                raw_ear_r_x = tr_x + (ux_out_r * self.earring_outward_ratio * face_width) + (ux_down * self.earring_down_ratio * face_width)
                raw_ear_r_y = tr_y + (uy_out_r * self.earring_outward_ratio * face_width) + (uy_down * self.earring_down_ratio * face_width)

                raw_ear_l_x = tl_x + (ux_out_l * self.earring_outward_ratio * face_width) + (ux_down * self.earring_down_ratio * face_width)
                raw_ear_l_y = tl_y + (uy_out_l * self.earring_outward_ratio * face_width) + (uy_down * self.earring_down_ratio * face_width)

                # Smooth with moving-average deque buffer
                self.ear_r_buffer.append((raw_ear_r_x, raw_ear_r_y))
                self.ear_l_buffer.append((raw_ear_l_x, raw_ear_l_y))

                ear_r_x, ear_r_y = np.mean(self.ear_r_buffer, axis=0).astype(int)
                ear_l_x, ear_l_y = np.mean(self.ear_l_buffer, axis=0).astype(int)

                # Earring dimensions proportional to face width
                earring_w = max(14, int(face_width * self.earring_scale))
                earring_h = int(earring_w * 1.7)

                # Anchor: The stud/hook is at the top of the graphic,
                # so the graphic center is positioned below the earlobe
                center_r_y = ear_r_y + int(earring_h * 0.42)
                center_l_y = ear_l_y + int(earring_h * 0.42)

                # Subtle dangle angle (dangling earrings hang mostly straight down due to gravity)
                dangle_angle = math.degrees(roll_angle) * 0.2

                # Screen-Left Earring (Person's right ear)
                frame = overlay_transparent(
                    frame, self.earring_image, ear_r_x, center_r_y, earring_w, earring_h, angle=dangle_angle
                )

                # Screen-Right Earring (Person's left ear)
                frame = overlay_transparent(
                    frame, self.earring_image, ear_l_x, center_l_y, earring_w, earring_h, angle=dangle_angle
                )
        return frame, detected

    def add_bangle_overlay(self, frame):
        """
        Detects wrist and hand landmarks and aligns the bangle perpendicularly across the forearm,
        anchored behind the wrist bone with dynamic palm-width scaling, 3D tilt, occlusion, and EMA smoothing.
        """
        import math
        h, w, _ = frame.shape
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(frame_rgb)
        detected = False

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                lms = hand_landmarks.landmark
                # Landmark 0: Wrist, Landmark 9: Middle finger MCP
                # Landmark 5: Index finger MCP, Landmark 17: Pinky MCP
                wrist = lms[0]
                middle_mcp = lms[9]
                index_mcp = lms[5]
                pinky_mcp = lms[17]

                wx, wy = wrist.x * w, wrist.y * h
                mx, my = middle_mcp.x * w, middle_mcp.y * h
                p5_x, p5_y = index_mcp.x * w, index_mcp.y * h
                p17_x, p17_y = pinky_mcp.x * w, pinky_mcp.y * h

                # Vector from Middle MCP -> Wrist (points down the forearm away from hand)
                arm_dx = wx - mx
                arm_dy = wy - my
                arm_len = math.hypot(arm_dx, arm_dy)
                if arm_len < 12:
                    continue

                ux = arm_dx / arm_len
                uy = arm_dy / arm_len

                # Palm width from Index MCP (5) to Pinky MCP (17)
                palm_w = math.hypot(p5_x - p17_x, p5_y - p17_y)
                if palm_w < 15:
                    palm_w = arm_len * 0.85

                # Major diameter: ~1.15-1.25x palm width (spans across the wrist)
                target_w = float(np.clip(palm_w * 1.22 * self.bangle_scale, 35, 300))

                # Minor radius (perspective thickness): dynamic based on relative depth / tilt
                z_depth = abs(wrist.z - middle_mcp.z) * 1.5
                tilt_factor = float(np.clip(0.30 + z_depth, 0.25, 0.45))
                target_h = target_w * tilt_factor

                # Position: Anchor at wrist and shift along forearm vector by base offset + user ratio
                shift_dist = palm_w * self.bangle_pos_ratio
                target_cx = wx + ux * shift_dist
                target_cy = wy + uy * shift_dist

                # Orientation: Perpendicular to the forearm axis so it wraps around the wrist
                arm_angle = math.degrees(math.atan2(arm_dy, arm_dx))
                target_angle = -(arm_angle + 90)

                # EMA Smoothing (alpha ~ 0.35)
                alpha = 0.35
                if self.bangle_smoothed_state is None:
                    self.bangle_smoothed_state = (target_cx, target_cy, target_w, target_h, target_angle)
                else:
                    prev_x, prev_y, prev_w, prev_h, prev_ang = self.bangle_smoothed_state
                    ang_diff = (target_angle - prev_ang + 180) % 360 - 180
                    smooth_ang = prev_ang + alpha * ang_diff
                    smooth_x = prev_x + alpha * (target_cx - prev_x)
                    smooth_y = prev_y + alpha * (target_cy - prev_y)
                    smooth_w = prev_w + alpha * (target_w - prev_w)
                    smooth_h = prev_h + alpha * (target_h - prev_h)
                    self.bangle_smoothed_state = (smooth_x, smooth_y, smooth_w, smooth_h, smooth_ang)

                sx, sy, sw, sh, sang = self.bangle_smoothed_state
                rotated_bangle = rotate_and_occlude_bangle(self.bangle_image, int(sw), int(sh), sang)
                frame = overlay_rgba(frame, rotated_bangle, int(sx), int(sy))
                detected = True
                break
        else:
            self.bangle_smoothed_state = None

        return frame, detected

    def apply_jewelry_overlay(self, frame):
        """Master dispatch for applying the currently selected jewellery overlay."""
        detected = True
        if self.current_design == "Necklace":
            frame, detected = self.add_necklace_overlay(frame)
        elif self.current_design == "Ring":
            frame, detected = self.add_ring_overlay(frame)
        elif self.current_design == "Earring":
            frame, detected = self.add_earring_overlay(frame)
        elif self.current_design == "Bangle":
            frame, detected = self.add_bangle_overlay(frame)
        return frame, detected

    def update_frame(self):
        """Real-time webcam feed update loop."""
        if not self.is_camera_running or self.cap is None:
            return

        ret, frame = self.cap.read()
        if ret:
            # Mirror frame horizontally for natural user interaction
            frame = cv2.flip(frame, 1)

            # Apply virtual try-on overlay
            frame, detected = self.apply_jewelry_overlay(frame)

            # If landmark is not detected, display subtle guidance text
            if not detected:
                text = "Adjust position to detect"
                cv2.putText(
                    frame, text, (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2, cv2.LINE_AA
                )

            # Display real-time calibration toast if active
            if self.toast_timer > 0 and self.toast_text:
                self.toast_timer -= 1
                cv2.putText(
                    frame, self.toast_text, (20, frame.shape[0] - 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 220, 255), 2, cv2.LINE_AA
                )

            # Resize to fit modal canvas
            display_frame = cv2.resize(frame, (640, 540))
            display_rgb = cv2.cvtColor(display_frame, cv2.COLOR_BGR2RGB)
            image_tk = ImageTk.PhotoImage(image=Image.fromarray(display_rgb))

            if self.modal_webcam_canvas and tk.Toplevel.winfo_exists(self.try_on_window):
                self.modal_webcam_canvas.create_image(0, 0, anchor=tk.NW, image=image_tk)
                self.modal_webcam_canvas.image_tk = image_tk

        if self.is_camera_running:
            self.after_id = self.root.after(15, self.update_frame)


if __name__ == "__main__":
    root = tk.Tk()
    root.geometry("1280x720")
    root.resizable(False, False)
    app = VirtualTryOnApp(root)
    root.mainloop()
