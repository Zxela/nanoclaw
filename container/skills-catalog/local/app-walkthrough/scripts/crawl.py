#!/usr/bin/env python3
"""Auto-discover a web app and generate a walkthrough script using Claude vision.

Usage:
    python crawl.py --url https://app.com
    python crawl.py --url https://app.com --max-pages 8

Credentials (optional):
    LOGIN_EMAIL=user@example.com LOGIN_PASSWORD=secret python crawl.py --url https://app.com

Output: prose walkthrough markdown script to stdout.
"""
import argparse
import base64
import os
import sys
from urllib.parse import urljoin, urlparse

from anthropic import Anthropic
from playwright.sync_api import sync_playwright

MAX_PAGES_DEFAULT = 10
VIEWPORT = {"width": 1280, "height": 800}


def detect_login_form(page) -> bool:
    """Return True if the page has a password input field."""
    return bool(
        page.locator("input[type='password']").count()
        or page.locator("input[name='password']").count()
    )


def try_login(page, email: str, password: str):
    """Attempt to fill and submit login form with provided credentials."""
    try:
        # Find email/username field
        for selector in [
            "input[type='email']", "input[name='email']",
            "input[name='username']", "input[placeholder*='email' i]",
        ]:
            el = page.locator(selector)
            if el.count() > 0:
                el.first.fill(email)
                break

        # Fill password
        page.locator("input[type='password']").first.fill(password)

        # Submit
        for selector in [
            "button[type='submit']",
            "button:has-text('Sign in')", "button:has-text('Sign In')",
            "button:has-text('Log in')", "button:has-text('Login')",
            "input[type='submit']",
        ]:
            btn = page.locator(selector)
            if btn.count() > 0:
                btn.first.click()
                page.wait_for_load_state("networkidle", timeout=8000)
                return
    except Exception as e:
        print(f"Login attempt error: {e}", file=sys.stderr)


def crawl_app(url: str, max_pages: int = MAX_PAGES_DEFAULT) -> dict:
    """Crawl app homepage + 1 level of links. Returns {pages: [{url, title, screenshot_b64, links}]}."""
    login_email = os.environ.get("LOGIN_EMAIL", "")
    login_password = os.environ.get("LOGIN_PASSWORD", "")
    base_domain = urlparse(url).netloc
    visited: set = set()
    pages: list = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)

        to_visit = [url]
        while to_visit and len(pages) < max_pages:
            current_url = to_visit.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            try:
                page.goto(current_url, wait_until="networkidle", timeout=12000)
            except Exception as e:
                print(f"Skip {current_url}: {e}", file=sys.stderr)
                continue

            if detect_login_form(page) and login_email:
                try_login(page, login_email, login_password)
                try:
                    page.wait_for_load_state("networkidle", timeout=5000)
                except Exception:
                    pass

            screenshot_b64 = base64.standard_b64encode(page.screenshot()).decode()
            title = page.title()

            links = []
            for el in page.locator("a[href]").all()[:40]:
                try:
                    href = el.get_attribute("href")
                    if href:
                        full = urljoin(current_url, href)
                        parsed = urlparse(full)
                        if parsed.netloc == base_domain and full not in visited:
                            links.append(full)
                except Exception:
                    pass

            pages.append({
                "url": current_url,
                "title": title,
                "screenshot_b64": screenshot_b64,
                "links": links[:5],
            })

            # Follow links 1 level deep from the start URL only
            if current_url == url:
                to_visit.extend(links[:5])

        browser.close()

    return {"pages": pages}


def generate_script(page_map: dict, base_url: str, client: Anthropic) -> str:
    """Analyze screenshots with Claude vision and generate a prose walkthrough script."""
    content = []
    for i, pg in enumerate(page_map["pages"][:8]):
        content.append({"type": "text", "text": f"\nPage {i + 1}: {pg['title']} ({pg['url']})"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": pg["screenshot_b64"],
            },
        })

    content.append({
        "type": "text",
        "text": f"""Based on these {len(page_map['pages'])} screenshots from {base_url}, \
write a prose walkthrough that demonstrates the 3-5 most important user flows.

Format as a markdown script with YAML front matter:

---
url: {base_url}
theme: saas
---

1. [step in plain English]
2. [step in plain English]
...

Guidelines:
- Use exact button/link text visible in the screenshots
- Include authentication if a login page was found
- Show navigation between sections
- End with a meaningful user action (creating, saving, or completing something)
- Write for a general audience — no technical jargon

Return ONLY the markdown script. No explanation.""",
    })

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )
    return response.content[0].text.strip()


def main():
    parser = argparse.ArgumentParser(description="Auto-discover app and generate walkthrough script")
    parser.add_argument("--url", required=True, help="App URL to crawl")
    parser.add_argument("--max-pages", type=int, default=MAX_PAGES_DEFAULT)
    args = parser.parse_args()

    client = Anthropic()
    print(f"Crawling {args.url} (max {args.max_pages} pages)...", file=sys.stderr)
    page_map = crawl_app(args.url, args.max_pages)
    print(f"Visited {len(page_map['pages'])} pages", file=sys.stderr)

    script = generate_script(page_map, args.url, client)
    print(script)  # stdout → pipe to file or parse_script.py


if __name__ == "__main__":
    main()
