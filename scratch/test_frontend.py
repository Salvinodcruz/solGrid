import os
import sys
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\jjdcr\.gemini\antigravity-cli\brain\bbc202f4-0bbc-439d-a7ae-d4057362389a"
SCREENSHOT_PATH = os.path.join(ARTIFACT_DIR, "solgrid_dashboard.png")

def run():
    console_logs = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: errors.append(str(err)))

        print("Navigating to http://localhost:8080...")
        page.goto("http://localhost:8080")
        page.wait_for_timeout(2000)

        # Check title
        title = page.title()
        print("Page title:", title)

        # Check markers
        markers = page.locator(".custom-marker").all()
        print(f"Found {len(markers)} markers on map")

        # Check initial selected building
        building_name = page.locator("#building-name").inner_text()
        print("Initial building name:", building_name)

        monthly_loss = page.locator("#monthly-loss-display").inner_text()
        print("Initial monthly loss:", monthly_loss)

        # Click the 2nd marker
        if len(markers) > 1:
            print("Clicking 2nd marker...")
            markers[1].click()
            page.wait_for_timeout(1000)
            print("Updated building name:", page.locator("#building-name").inner_text())
            print("Updated monthly loss:", page.locator("#monthly-loss-display").inner_text())

        # Move sliders
        print("Adjusting misting slider...")
        page.fill("#slider-misting", "0.5")
        page.dispatch_event("#slider-misting", "input")
        page.wait_for_timeout(800)

        recovered = page.locator("#sim-recovered-usd").inner_text()
        print("Recovered USD after slider move:", recovered)

        # Take screenshot
        os.makedirs(ARTIFACT_DIR, exist_ok=True)
        page.screenshot(path=SCREENSHOT_PATH, full_page=True)
        print(f"Screenshot saved to {SCREENSHOT_PATH}")

        browser.close()

    print("\n--- CONSOLE LOGS ---")
    for log in console_logs:
        # Ignore mapbox tile 401s if token is placeholder
        if "mapbox.com" in log or "401" in log:
            continue
        print(log)

    print("\n--- PAGE ERRORS ---")
    print(errors if errors else "None!")

if __name__ == "__main__":
    run()
