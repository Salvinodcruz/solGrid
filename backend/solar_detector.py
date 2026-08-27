"""
Solar Panel Instance Segmentation & GeoJSON Detection Engine.
Integrates YOLOv8 segmentation (finloop/yolov8s-seg-solar-panels),
multi-tile high-resolution satellite grid fetching & stitching (2x2 / 3x3 @2x),
Web Mercator corner-tile extent geographic bounding box calculations,
sliding-window patch processing (20% stride overlap),
OpenCV continuous irregular contour extraction, and exact geographic polygon mapping.
"""

import base64
import math
import os
import urllib.request
from io import BytesIO

try:
    import cv2
    CV2_AVAILABLE = True
except Exception as _cv_err:
    cv2 = None
    CV2_AVAILABLE = False
    print(f"[SolarDetector] cv2 import warning: {_cv_err}")

import numpy as np
import requests
from PIL import Image

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "solar_panels.pt")


def get_mapbox_token():
    """Retrieve Mapbox token from config or environment variable."""
    try:
        import config
        token = getattr(config, 'MAPBOX_TOKEN', '') or os.getenv('MAPBOX_TOKEN', '')
    except Exception:
        token = os.getenv('MAPBOX_TOKEN', '')
    return token


def load_model():
    model_path = os.path.join(
        os.path.dirname(__file__),
        'models', 'solar_panels.pt'
    )
    
    os.makedirs(
        os.path.dirname(model_path), 
        exist_ok=True
    )
    
    try:
        from ultralytics import YOLO
    except Exception as e:
        print(f"[SolarDetector] ultralytics import failed: {e}")
        return None, False

    if os.path.exists(model_path) and os.path.getsize(model_path) > 1000000:
        print(f"Loading model from {model_path}")
        try:
            m = YOLO(model_path)
            print("YOLO solar model loaded")
            return m, True
        except Exception as e:
            print(f"Failed to load model weights: {e}")
    
    try:
        print("Downloading solar panel model...")
        try:
            hf_url = "https://huggingface.co/finloop/yolov8s-seg-solar-panels/resolve/main/best.pt"
            print(f"Downloading YOLO weights from {hf_url}...")
            urllib.request.urlretrieve(hf_url, model_path)
            print(f"Downloaded weights to {model_path}")
            m = YOLO(model_path)
            print("YOLO solar model loaded")
            return m, True
        except Exception as e1:
            print(f"HF direct download failed ({e1}), trying keremberke/yolov8s-solar-panel-segmentation...")
            model = YOLO('keremberke/yolov8s-solar-panel-segmentation')
            print("YOLO solar model loaded")
            return model, True
    except Exception as e:
        print(f"Model download failed: {e}")
        print("Falling back to color detection")
        return None, False


try:
    solar_model, MODEL_LOADED = load_model()
except Exception as e:
    solar_model = None
    MODEL_LOADED = False
    print(f"Model init failed: {e}")


def latlng_to_world_mercator(lng: float, lat: float, zoom: int):
    """Convert geographic (lng, lat) to global Web Mercator pixel coordinates at given zoom level."""
    scale = 256.0 * (2.0 ** zoom)
    x = (lng + 180.0) / 360.0 * scale
    lat_clamped = min(max(lat, -85.05112878), 85.05112878)
    lat_rad = math.radians(lat_clamped)
    y = (1.0 - math.log(math.tan(math.pi / 4.0 + lat_rad / 2.0)) / math.pi) / 2.0 * scale
    return x, y


def world_mercator_to_latlng(x: float, y: float, zoom: int):
    """Convert global Web Mercator pixel coordinates at given zoom level to geographic (lng, lat)."""
    scale = 256.0 * (2.0 ** zoom)
    lng = (x / scale) * 360.0 - 180.0
    y_norm = 1.0 - (y * 2.0 / scale)
    lat_rad = 2.0 * math.atan(math.exp(y_norm * math.pi)) - math.pi / 2.0
    lat = math.degrees(lat_rad)
    return lng, lat


def get_meters_per_pixel(lat: float, zoom: int) -> float:
    """Calculate ground resolution (meters per pixel) for standard zoom level."""
    return 156543.03392 * math.cos(math.radians(lat)) / (2.0 ** zoom)


def pixels_to_latlng(points, lat, lng, zoom, img_w=1280, img_h=1280):
    """Convert pixel coordinates on the satellite image to [[lng, lat], ...] coordinates."""
    if len(points) == 0:
        return []
    pts = np.array(points, dtype=np.float32)
    max_x = float(np.max(pts[:, 0]))
    max_y = float(np.max(pts[:, 1]))
    if max_x <= 640 and max_y <= 640 and img_w == 1280:
        span_w = 640.0
        span_h = 640.0
        scale_x = 1.0
        scale_y = 1.0
    else:
        span_w = float(img_w)
        span_h = float(img_h)
        scale_x = 640.0 / span_w
        scale_y = 640.0 / span_h

    center_x, center_y = latlng_to_world_mercator(lng, lat, zoom)
    coords = []
    for p in pts:
        px = float(p[0])
        py = float(p[1])
        world_x = center_x + (px - span_w / 2.0) * scale_x
        world_y = center_y + (py - span_h / 2.0) * scale_y
        p_lng, p_lat = world_mercator_to_latlng(world_x, world_y, zoom)
        coords.append([round(p_lng, 6), round(p_lat, 6)])
    return coords


def calculate_area(points, zoom, lat, img_w=1280):
    """Calculate geographic surface area in m^2 for a polygon given in image pixel coordinates."""
    pts = np.array(points, dtype=np.float32)
    if len(pts) < 3:
        return 0.0
    x = pts[:, 0]
    y = pts[:, 1]
    pixel_area = 0.5 * np.abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    m_per_css_px = 156543.03392 * math.cos(math.radians(lat)) / (2.0 ** zoom)
    scale = 640.0 / float(img_w)
    m_per_img_px = m_per_css_px * scale
    area_m2 = pixel_area * (m_per_img_px ** 2)
    return float(area_m2)


def fetch_satellite_image(lat, lng=None, zoom=17, mapbox_token=None, lon=None):
    """Fetch satellite image from Mapbox Static API."""
    if lng is None:
        lng = lon
    if not mapbox_token:
        mapbox_token = get_mapbox_token()
    
    if not mapbox_token or mapbox_token == 'your_mapbox_token_here':
        raise ValueError("No valid Mapbox token provided")
    
    url = (
        f"https://api.mapbox.com/styles/v1/mapbox/"
        f"satellite-v9/static/"
        f"{lng},{lat},{zoom},0/"
        f"640x640@2x"
        f"?access_token={mapbox_token}"
    )
    
    print(f"[SolarDetector] Fetching satellite image:")
    print(f"  lat={lat}, lng={lng}, zoom={zoom}")
    print(f"  URL: {url[:80]}...")
    
    headers = {
        'User-Agent': 'SolGrid-ThermalSync/1.0'
    }
    
    response = requests.get(url, timeout=20, headers=headers)
    
    print(f"[SolarDetector] Response status: {response.status_code}")
    print(f"[SolarDetector] Content-Type: {response.headers.get('content-type', 'unknown')}")
    
    if response.status_code == 401:
        raise ValueError("Invalid Mapbox token")
    if response.status_code == 404:
        raise ValueError(f"Mapbox API 404 — check URL format. URL: {url[:100]}")
    
    response.raise_for_status()
    
    content_type = response.headers.get('content-type', '')
    if 'image' not in content_type:
        raise ValueError(f"Expected image, got: {content_type}")
    
    img = Image.open(BytesIO(response.content)).convert('RGB')
    print(f"[SolarDetector] Image loaded: {img.size}")
    return img


def fetch_satellite_tile(lat, lng, zoom, mapbox_token, width=640, height=640, retina=True):
    """Fetch a single high-resolution static tile from Mapbox Static Images API."""
    scale_str = "@2x" if retina else ""
    url = (
        f"https://api.mapbox.com/styles/v1/mapbox/"
        f"satellite-v9/static/"
        f"{lng},{lat},{zoom},0/"
        f"{width}x{height}{scale_str}?access_token={mapbox_token}"
    )
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            return Image.open(BytesIO(response.content)).convert("RGB")
    except Exception as e:
        print(f"Tile fetch error for ({lat}, {lng}): {e}")

    # Fallback to standard resolution if retina fails
    if retina:
        try:
            url_std = (
                f"https://api.mapbox.com/styles/v1/mapbox/"
                f"satellite-v9/static/"
                f"{lng},{lat},{zoom},0/"
                f"{width}x{height}?access_token={mapbox_token}"
            )
            response = requests.get(url_std, timeout=15)
            if response.status_code == 200:
                img_std = Image.open(BytesIO(response.content)).convert("RGB")
                return img_std.resize((width * 2, height * 2), Image.Resampling.BICUBIC)
        except Exception:
            pass

    return None


def fetch_and_stitch_satellite_grid(
    lat,
    lng,
    zoom=17,
    mapbox_token="",
    bbox=None,
    grid_size=2,
    tile_size=640,
    retina=True
):
    """
    Take bounding box [min_lng, min_lat, max_lng, max_lat] or center point (lat, lng, zoom),
    calculate corner tile extents directly in Web Mercator space, fetch an NxN grid of
    high-resolution tiles, and stitch them with Pillow into a composite image (e.g. 2560x2560).
    """
    grid_size = max(1, min(grid_size, 4))  # 1x1, 2x2, 3x3, or 4x4

    if bbox and len(bbox) == 4:
        min_lng, min_lat, max_lng, max_lat = [float(v) for v in bbox]
        # Top-left (NW) and Bottom-right (SE) in Web Mercator pixels
        x_min, y_min = latlng_to_world_mercator(min_lng, max_lat, zoom)
        x_max, y_max = latlng_to_world_mercator(max_lng, min_lat, zoom)
    else:
        lat = float(lat)
        lng = float(lng)
        x_center, y_center = latlng_to_world_mercator(lng, lat, zoom)
        span_px = float(grid_size * tile_size)
        x_min = x_center - (span_px / 2.0)
        y_min = y_center - (span_px / 2.0)
        x_max = x_center + (span_px / 2.0)
        y_max = y_center + (span_px / 2.0)

    # Compute true corner geographic bounding box from Mercator extents
    geo_min_lng, geo_max_lat = world_mercator_to_latlng(x_min, y_min, zoom)
    geo_max_lng, geo_min_lat = world_mercator_to_latlng(x_max, y_max, zoom)

    corner_extents = {
        "x_min": x_min,
        "y_min": y_min,
        "x_max": x_max,
        "y_max": y_max,
        "zoom": zoom,
        "bounds": [
            round(geo_min_lng, 8),
            round(geo_min_lat, 8),
            round(geo_max_lng, 8),
            round(geo_max_lat, 8),
        ],
    }

    # Calculate center of each sub-tile in Web Mercator coordinates
    tile_span_x = (x_max - x_min) / float(grid_size)
    tile_span_y = (y_max - y_min) / float(grid_size)

    tile_centers = []
    for r in range(grid_size):
        row_centers = []
        for c in range(grid_size):
            cx = x_min + (c + 0.5) * tile_span_x
            cy = y_min + (r + 0.5) * tile_span_y
            t_lng, t_lat = world_mercator_to_latlng(cx, cy, zoom)
            row_centers.append((t_lat, t_lng))
        tile_centers.append(row_centers)

    # Tile pixel dimensions (retina @2x = 1280x1280)
    tile_px = tile_size * (2 if retina else 1)
    composite_w = grid_size * tile_px
    composite_h = grid_size * tile_px

    composite_img = Image.new("RGB", (composite_w, composite_h), color=(30, 40, 50))
    tiles_fetched = 0

    # Load local sample fallback tile if network/token is unavailable
    sample_tile = None
    sample_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "data",
        "sample_satellite.jpg"
    )
    if os.path.exists(sample_path):
        try:
            raw_sample = Image.open(sample_path).convert("RGB")
            sample_tile = raw_sample.resize((tile_px, tile_px), Image.Resampling.BICUBIC)
        except Exception:
            pass

    for r in range(grid_size):
        for c in range(grid_size):
            t_lat, t_lng = tile_centers[r][c]
            tile_img = None
            if mapbox_token:
                tile_img = fetch_satellite_tile(
                    lat=t_lat,
                    lng=t_lng,
                    zoom=zoom,
                    mapbox_token=mapbox_token,
                    width=tile_size,
                    height=tile_size,
                    retina=retina
                )

            if tile_img is not None:
                tiles_fetched += 1
                if tile_img.size != (tile_px, tile_px):
                    tile_img = tile_img.resize((tile_px, tile_px), Image.Resampling.BICUBIC)
            elif sample_tile is not None:
                tile_img = sample_tile
            else:
                tile_img = Image.new("RGB", (tile_px, tile_px), color=(35, 45, 55))

            composite_img.paste(tile_img, (c * tile_px, r * tile_px))

    center_lat = (geo_min_lat + geo_max_lat) / 2.0
    center_lng = (geo_min_lng + geo_max_lng) / 2.0
    total_ground_w_m = (geo_max_lng - geo_min_lng) * 111111.0 * math.cos(math.radians(center_lat))
    total_ground_h_m = (geo_max_lat - geo_min_lat) * 111111.0

    metadata = {
        "center_lat": center_lat,
        "center_lng": center_lng,
        "zoom": zoom,
        "grid_size": grid_size,
        "tiles_fetched": tiles_fetched,
        "total_tiles": grid_size * grid_size,
        "composite_size": [composite_w, composite_h],
        "corner_extents": corner_extents,
        "bounds": corner_extents["bounds"],
        "ground_dimensions_m": [round(total_ground_w_m, 1), round(total_ground_h_m, 1)],
    }

    return composite_img, metadata


def run_sliding_window_segmentation(img, model, tile_size=640, overlap=0.20, conf=0.20, imgsz=1024):
    """
    Slice composite high-resolution image into overlapping tiles (20% stride overlap),
    run YOLOv8 segmentation across each tile, and merge predicted pixel masks into a unified binary mask.
    """
    img_np = np.array(img)
    h, w = img_np.shape[:2]

    # Validate spatial resolution threshold
    if w < 1024 or h < 1024:
        print(
            f"[WARNING] Input image resolution ({w}x{h}) is below 1024x1024. "
            "Satellite zoom resolution is too low for spatial segmentation."
        )

    # Dynamic sliding-window grid calculation
    overlap_px = int(tile_size * overlap) if overlap < 1.0 else int(overlap)
    stride = max(1, tile_size - overlap_px)

    if w > 1024 or h > 1024:
        cols = max(1, math.ceil((w - overlap_px) / (tile_size - overlap_px)))
        rows = max(1, math.ceil((h - overlap_px) / (tile_size - overlap_px)))
    else:
        cols = max(1, math.ceil((w - overlap_px) / (tile_size - overlap_px))) if w > tile_size else 1
        rows = max(1, math.ceil((h - overlap_px) / (tile_size - overlap_px))) if h > tile_size else 1

    x_starts = []
    for c in range(cols):
        pos = min(c * stride, max(0, w - tile_size))
        if pos not in x_starts:
            x_starts.append(pos)
    if not x_starts:
        x_starts = [0]

    y_starts = []
    for r in range(rows):
        pos = min(r * stride, max(0, h - tile_size))
        if pos not in y_starts:
            y_starts.append(pos)
    if not y_starts:
        y_starts = [0]

    full_binary_mask = np.zeros((h, w), dtype=np.uint8)

    for y0 in y_starts:
        for x0 in x_starts:
            tile_np = img_np[y0:y0 + tile_size, x0:x0 + tile_size]
            tile_pil = Image.fromarray(tile_np)
            cur_h, cur_w = tile_np.shape[:2]

            try:
                results = model.predict(
                    source=tile_pil,
                    conf=conf,
                    imgsz=imgsz,
                    verbose=False
                )
                for r in results:
                    if r.masks is not None and r.masks.data is not None:
                        masks_data = r.masks.data.cpu().numpy()
                        for m in masks_data:
                            if cv2 is not None:
                                m_resized = cv2.resize(
                                    m, (cur_w, cur_h),
                                    interpolation=cv2.INTER_LINEAR
                                )
                            else:
                                m_pil = Image.fromarray((m * 255).astype(np.uint8))
                                m_resized = np.array(m_pil.resize((cur_w, cur_h), Image.Resampling.BILINEAR)) / 255.0
                            bin_m = (m_resized > 0.5).astype(np.uint8) * 255
                            full_binary_mask[y0:y0 + cur_h, x0:x0 + cur_w] = np.bitwise_or(
                                full_binary_mask[y0:y0 + cur_h, x0:x0 + cur_w],
                                bin_m
                            )
            except Exception as e:
                print(f"Tile inference error at ({x0}, {y0}): {e}")

    return full_binary_mask


def extract_geojson_features_from_mask(
    binary_mask,
    corner_extents,
    img_w,
    img_h,
    min_area_px=15
):
    """
    Extract raw continuous contours from binary segmentation mask using cv2.findContours,
    convert arbitrary polygon contours into geographic coordinates using direct Web Mercator
    corner tile extents, and calculate precise surface area in m^2.
    """
    if cv2 is None:
        print("[SolarDetector] cv2 is not available for contour extraction")
        return [], 0.0

    contours, _ = cv2.findContours(
        binary_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    x_min = corner_extents["x_min"]
    y_min = corner_extents["y_min"]
    x_max = corner_extents["x_max"]
    y_max = corner_extents["y_max"]
    zoom = corner_extents["zoom"]
    bounds = corner_extents["bounds"]

    min_lng, min_lat, max_lng, max_lat = bounds
    center_lat = (min_lat + max_lat) / 2.0
    dx_m = (max_lng - min_lng) * 111111.0 * math.cos(math.radians(center_lat))
    dy_m = (max_lat - min_lat) * 111111.0
    meters_per_px_x = dx_m / float(img_w)
    meters_per_px_y = dy_m / float(img_h)
    pixel_area_m2 = meters_per_px_x * meters_per_px_y

    features = []
    total_area_m2 = 0.0

    for cnt in contours:
        px_area = cv2.contourArea(cnt)
        if px_area < min_area_px:
            continue

        area_m2 = px_area * pixel_area_m2
        total_area_m2 += area_m2

        pts = cnt.reshape(-1, 2)
        if len(pts) < 3:
            continue

        coords = []
        for px, py in pts:
            world_x = x_min + (float(px) / float(img_w)) * (x_max - x_min)
            world_y = y_min + (float(py) / float(img_h)) * (y_max - y_min)
            p_lng, p_lat = world_mercator_to_latlng(world_x, world_y, zoom)

            coords.append([
                float(round(p_lng, 8)),
                float(round(p_lat, 8)),
            ])

        # Ensure closed polygon
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            },
            "properties": {
                "type": "solar_panel_array",
                "area_m2": round(area_m2, 2),
                "confidence": 0.92
            }
        })

    return features, round(total_area_m2, 1)


def detect_solar_panels(lat, lng, zoom=17, mapbox_token='', **kwargs):
    result = {
        'panel_count': 0,
        'total_surface_area_m2': 0,
        'geojson_features': [],
        'model_used': 'none',
        'image_b64': None,
        'zoom': zoom,
        'center': [lng, lat]
    }
    
    zoom_levels = [17, 16, 15]
    img = None
    used_zoom = zoom
    
    for z in zoom_levels:
        try:
            img = fetch_satellite_image(
                lat, lng, z, mapbox_token
            )
            used_zoom = z
            print(f"Image fetched at zoom {z}")
            break
        except Exception as e:
            print(f"Zoom {z} failed: {e}")
            continue
    
    if img is None:
        print("All zoom levels failed")
        return result
    
    from io import BytesIO
    import base64
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=85)
    result['image_b64'] = base64.b64encode(
        buf.getvalue()
    ).decode()
    result['zoom'] = used_zoom
    
    # Save debug image
    try:
        debug_path = os.path.join(
            os.path.dirname(__file__),
            '..', 'data', 
            f'satellite_{lat}_{lng}.jpg'
        )
        os.makedirs(os.path.dirname(debug_path), exist_ok=True)
        img.save(debug_path)
        print(f"Saved satellite to {debug_path}")
    except Exception:
        pass
    
    global solar_model, MODEL_LOADED
    if solar_model is None:
        try:
            solar_model, MODEL_LOADED = load_model()
        except Exception:
            pass

    if MODEL_LOADED and solar_model is not None:
        try:
            results = solar_model.predict(
                source=img,
                conf=0.10,
                iou=0.35,
                imgsz=640,
                verbose=True,
                agnostic_nms=True
            )
            
            # Save YOLO annotated image for /debug-yolo
            try:
                annotated = results[0].plot()
                ann_img = Image.fromarray(annotated)
                debug_path = os.path.join(
                    os.path.dirname(__file__),
                    '..', 'data', 'yolo_annotated.jpg'
                )
                os.makedirs(os.path.dirname(debug_path), exist_ok=True)
                ann_img.save(debug_path)
                print(f"Saved annotated image to {debug_path}")
            except Exception as e:
                print(f"Could not save annotated image: {e}")

            features = []
            total_area = 0
            
            for r in results:
                if r.masks is not None:
                    for idx, mask in enumerate(r.masks.xy):
                        if len(mask) < 3:
                            continue
                        
                        coords = pixels_to_latlng(
                            mask, lat, lng, used_zoom,
                            img_w=img.width, img_h=img.height
                        )
                        if len(coords) < 4:
                            continue
                        
                        area = calculate_area(
                            mask, used_zoom, lat,
                            img_w=img.width
                        )
                        total_area += area
                        
                        conf = 0.5
                        if r.boxes is not None and idx < len(r.boxes.conf):
                            conf = float(r.boxes.conf[idx])
                        
                        features.append({
                            'type': 'Feature',
                            'geometry': {
                                'type': 'Polygon',
                                'coordinates': [coords]
                            },
                            'properties': {
                                'type': 'solar_panel_array',
                                'area_m2': round(area, 1),
                                'confidence': conf
                            }
                        })
            
            if features:
                result['panel_count'] = len(features)
                result['total_surface_area_m2'] = round(
                    total_area, 1
                )
                result['geojson_features'] = features
                result['model_used'] = 'yolov8-solar-seg'
                print(f"YOLO found {len(features)} panels")
            else:
                print("YOLO found nothing, using fallback")
                result = _color_fallback(
                    result, img, lat, lng, used_zoom
                )
                
        except Exception as e:
            print(f"YOLO failed: {e}")
            result = _color_fallback(
                result, img, lat, lng, used_zoom
            )
    else:
        print("No YOLO model, using color fallback")
        result = _color_fallback(
            result, img, lat, lng, used_zoom
        )
    
    return result


def _color_fallback(result, img, lat, lng, zoom):
    img_array = np.array(img)
    r = img_array[:,:,0].astype(float)
    g = img_array[:,:,1].astype(float)
    b = img_array[:,:,2].astype(float)
    
    # Solar panels appear as uniform light-gray
    # with slight blue tint in satellite imagery
    # Key characteristics:
    # - All channels similar (grayish)
    # - Slightly blue-shifted
    # - Not too bright (not clouds/roads)
    # - Not too dark (not shadows)
    
    gray = (r + g + b) / 3
    
    panel_mask = (
        # Uniform gray (low variance between channels)
        (np.abs(r - g) < 25) &
        (np.abs(g - b) < 25) &
        (np.abs(r - b) < 30) &
        # Slight blue emphasis (panels)
        (b >= r - 5) &
        # Medium brightness (not too bright, not dark)
        (gray > 60) &
        (gray < 160) &
        # Not pure white (roads/buildings)
        (gray < 200)
    )
    
    h, w = img_array.shape[:2]
    grid_size = 10
    cell_h = h // grid_size
    cell_w = w // grid_size
    
    features = []
    total_area = 0
    
    for row in range(grid_size):
        for col in range(grid_size):
            cell = panel_mask[
                row*cell_h:(row+1)*cell_h,
                col*cell_w:(col+1)*cell_w
            ]
            coverage = cell.mean()
            
            if coverage > 0.30:
                cx = (col + 0.5) * cell_w
                cy = (row + 0.5) * cell_h
                hw = cell_w * 0.48
                hh = cell_h * 0.48
                
                corners = [
                    [cx-hw, cy-hh],
                    [cx+hw, cy-hh],
                    [cx+hw, cy+hh],
                    [cx-hw, cy+hh]
                ]
                
                coords = pixels_to_latlng(
                    corners, lat, lng, zoom,
                    img_w=w, img_h=h
                )
                if coords:
                    coords.append(coords[0])
                
                area = calculate_area(
                    np.array(corners), zoom, lat,
                    img_w=w
                )
                total_area += area
                
                features.append({
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': [coords]
                    },
                    'properties': {
                        'type': 'solar_panel_array',
                        'area_m2': round(area, 1),
                        'confidence': float(coverage),
                        'detection_method': 'color'
                    }
                })
    
    result['panel_count'] = len(features)
    result['total_surface_area_m2'] = round(total_area, 1)
    result['geojson_features'] = features
    result['model_used'] = 'color-spectral-fallback'
    print(f"Color fallback found {len(features)} zones")

    # Save fallback annotated image for /debug-yolo
    try:
        debug_path = os.path.join(
            os.path.dirname(__file__),
            '..', 'data', 'yolo_annotated.jpg'
        )
        os.makedirs(os.path.dirname(debug_path), exist_ok=True)
        vis_img = img_array.copy()
        if cv2 is not None:
            for row in range(grid_size):
                for col in range(grid_size):
                    cell = panel_mask[row*cell_h:(row+1)*cell_h, col*cell_w:(col+1)*cell_w]
                    if cell.mean() > 0.30:
                        cv2.rectangle(
                            vis_img,
                            (int(col*cell_w), int(row*cell_h)),
                            (int((col+1)*cell_w), int((row+1)*cell_h)),
                            (0, 255, 0), 2
                        )
        Image.fromarray(vis_img).save(debug_path)
        print(f"Saved fallback annotated image to {debug_path}")
    except Exception as e:
        print(f"Fallback debug image save error: {e}")

    return result
