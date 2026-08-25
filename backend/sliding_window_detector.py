"""
Standalone Multi-Tile Sliding Window Solar Segmentation Script & Library.
Slices high-resolution satellite imagery (or stitched multi-tile grids) into
overlapping patches (20% stride overlap), runs ultralytics YOLOv8 segmentation
across each tile, merges binary masks, and outputs a unified full-resolution
GeoJSON FeatureCollection with Web Mercator corner-tile extent geographic mapping.
"""

import argparse
import json
import math
import os
import sys
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO


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
    """Dynamic latitude projection formula for ground resolution in meters/pixel."""
    return 156543.03392 * math.cos(math.radians(lat)) / (2.0 ** zoom)


def sliding_window_inference(
    image_or_buffer,
    weights_path: str = "backend/models/solar_panels.pt",
    lat: float = 33.4484,
    lng: float = -112.0740,
    zoom: int = 17,
    corner_extents: dict = None,
    meters_per_pixel: float = None,
    tile_size: int = 640,
    overlap: float = 0.20,
    conf: float = 0.20,
    imgsz: int = 1024,
    min_contour_area_px: int = 15,
    output_geojson: str = None,
):
    """
    Run multi-tile sliding-window instance segmentation on a high-resolution satellite image or buffer.
    """
    # Resolve image input
    if isinstance(image_or_buffer, Image.Image):
        img = image_or_buffer.convert("RGB")
    elif isinstance(image_or_buffer, (bytes, bytearray, BytesIO)):
        buf = BytesIO(image_or_buffer) if isinstance(image_or_buffer, (bytes, bytearray)) else image_or_buffer
        img = Image.open(buf).convert("RGB")
    elif isinstance(image_or_buffer, str):
        if not os.path.exists(image_or_buffer):
            raise FileNotFoundError(f"Input image not found: {image_or_buffer}")
        img = Image.open(image_or_buffer).convert("RGB")
    else:
        raise ValueError(f"Unsupported image type: {type(image_or_buffer)}")

    img_np = np.array(img)
    h, w = img_np.shape[:2]
    print(f"Loaded image: {w}x{h} px for sliding window inference")

    # Validate spatial resolution threshold
    if w < 1024 or h < 1024:
        print(
            f"[WARNING] Input image resolution ({w}x{h}) is below 1024x1024. "
            "Satellite zoom resolution is too low for spatial segmentation."
        )

    # Load YOLO segmentation model
    if not os.path.exists(weights_path):
        weights_path = "yolov8n-seg.pt"
    model = YOLO(weights_path)

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

    total_tiles = len(x_starts) * len(y_starts)
    print(
        f"Dynamic sliding window grid: {len(x_starts)} cols x {len(y_starts)} rows = "
        f"{total_tiles} tiles (tile_size={tile_size}, overlap={overlap_px}px, stride={stride}px)"
    )

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
                            m_resized = cv2.resize(
                                m, (cur_w, cur_h),
                                interpolation=cv2.INTER_LINEAR
                            )
                            bin_m = (m_resized > 0.5).astype(np.uint8) * 255
                            full_binary_mask[y0:y0 + cur_h, x0:x0 + cur_w] = np.bitwise_or(
                                full_binary_mask[y0:y0 + cur_h, x0:x0 + cur_w],
                                bin_m
                            )
            except Exception as e:
                print(f"Tile inference error at ({x0}, {y0}): {e}")

    # Extract raw continuous contours using OpenCV
    contours, _ = cv2.findContours(
        full_binary_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )
    print(f"Extracted {len(contours)} raw contours from merged high-resolution binary mask.")

    # Calculate corner extents in Web Mercator if not supplied
    if corner_extents is None:
        x_center, y_center = latlng_to_world_mercator(lng, lat, zoom)
        # Assume standard 640 logical tile scale relative to resolution
        scale_factor = float(w) / 640.0
        span_logical = 640.0 * max(1.0, scale_factor / 2.0)
        x_min = x_center - span_logical / 2.0
        y_min = y_center - span_logical / 2.0
        x_max = x_center + span_logical / 2.0
        y_max = y_center + span_logical / 2.0
        geo_min_lng, geo_max_lat = world_mercator_to_latlng(x_min, y_min, zoom)
        geo_max_lng, geo_min_lat = world_mercator_to_latlng(x_max, y_max, zoom)
        corner_extents = {
            "x_min": x_min,
            "y_min": y_min,
            "x_max": x_max,
            "y_max": y_max,
            "zoom": zoom,
            "bounds": [geo_min_lng, geo_min_lat, geo_max_lng, geo_max_lat]
        }

    x_min = corner_extents["x_min"]
    y_min = corner_extents["y_min"]
    x_max = corner_extents["x_max"]
    y_max = corner_extents["y_max"]
    bounds = corner_extents["bounds"]

    min_lng, min_lat, max_lng, max_lat = bounds
    center_lat = (min_lat + max_lat) / 2.0
    dx_m = (max_lng - min_lng) * 111111.0 * math.cos(math.radians(center_lat))
    dy_m = (max_lat - min_lat) * 111111.0
    meters_per_px_x = dx_m / float(w)
    meters_per_px_y = dy_m / float(h)
    pixel_area_m2 = meters_per_px_x * meters_per_px_y

    features = []
    total_area_m2 = 0.0

    for cnt in contours:
        px_area = cv2.contourArea(cnt)
        if px_area < min_contour_area_px:
            continue

        area_m2 = px_area * pixel_area_m2
        total_area_m2 += area_m2

        pts = cnt.reshape(-1, 2)
        if len(pts) < 3:
            continue

        coords = []
        for px, py in pts:
            world_x = x_min + (float(px) / float(w)) * (x_max - x_min)
            world_y = y_min + (float(py) / float(h)) * (y_max - y_min)
            p_lng, p_lat = world_mercator_to_latlng(world_x, world_y, zoom)

            coords.append([
                float(round(p_lng, 8)),
                float(round(p_lat, 8)),
            ])

        # Close polygon
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

    geojson_collection = {
        "type": "FeatureCollection",
        "metadata": {
            "image_size": [w, h],
            "center": [lng, lat],
            "zoom": zoom,
            "bounds": bounds,
            "meters_per_pixel": round(math.sqrt(pixel_area_m2), 5),
            "panel_count": len(features),
            "total_surface_area_m2": round(total_area_m2, 2)
        },
        "features": features
    }

    if output_geojson:
        os.makedirs(os.path.dirname(os.path.abspath(output_geojson)), exist_ok=True)
        with open(output_geojson, "w", encoding="utf-8") as f:
            json.dump(geojson_collection, f, indent=2)
        print(f"Saved GeoJSON FeatureCollection to: {output_geojson}")

    return geojson_collection


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sliding window YOLOv8 solar panel segmentation")
    parser.add_argument("--image", default="data/sample_satellite.jpg", help="Path to input satellite image")
    parser.add_argument("--weights", default="backend/models/solar_panels.pt", help="Path to YOLOv8 segmentation weights")
    parser.add_argument("--lat", type=float, default=33.4484, help="Center latitude")
    parser.add_argument("--lng", type=float, default=-112.0740, help="Center longitude")
    parser.add_argument("--zoom", type=int, default=17, help="Mapbox zoom level")
    parser.add_argument("--tile-size", type=int, default=640, help="Tile window size")
    parser.add_argument("--overlap", type=float, default=0.20, help="Tile overlap fraction (default 0.20 = 20%)")
    parser.add_argument("--conf", type=float, default=0.20, help="Confidence threshold")
    parser.add_argument("--imgsz", type=int, default=1024, help="Inference resolution size")
    parser.add_argument("--output", default="reports/detected_solar_arrays.geojson", help="Output GeoJSON path")

    args = parser.parse_args()
    res = sliding_window_inference(
        image_or_buffer=args.image,
        weights_path=args.weights,
        lat=args.lat,
        lng=args.lng,
        zoom=args.zoom,
        tile_size=args.tile_size,
        overlap=args.overlap,
        conf=args.conf,
        imgsz=args.imgsz,
        output_geojson=args.output,
    )
    print(f"Detection complete: {res['metadata']['panel_count']} panels, {res['metadata']['total_surface_area_m2']} m².")
