import pytest
from unittest.mock import MagicMock, patch, call

from crawl import detect_login_form, try_login, generate_script, crawl_app


def make_page_mock(has_password=False):
    page = MagicMock()
    pw_locator = MagicMock()
    pw_locator.count.return_value = 1 if has_password else 0
    page.locator.return_value = pw_locator
    page.screenshot.return_value = b"\x89PNG\r\n"
    page.title.return_value = "Test App"
    return page


def test_detect_login_form_true_when_password_field():
    page = make_page_mock(has_password=True)
    assert detect_login_form(page) is True


def test_detect_login_form_false_when_no_password_field():
    page = make_page_mock(has_password=False)
    assert detect_login_form(page) is False


def test_try_login_fills_email_and_password():
    page = MagicMock()
    email_input = MagicMock()
    pw_input = MagicMock()
    submit_btn = MagicMock()
    submit_btn.count.return_value = 1

    email_locator = MagicMock()
    email_locator.count.return_value = 1
    email_locator.first = email_input

    pw_locator = MagicMock()
    pw_locator.first = pw_input

    def locator_side_effect(selector):
        if "password" in selector:
            return pw_locator
        if "submit" in selector:
            return submit_btn
        return email_locator

    page.locator.side_effect = locator_side_effect
    try_login(page, "user@example.com", "secret")
    email_input.fill.assert_called_once_with("user@example.com")
    pw_input.fill.assert_called_once_with("secret")


def test_generate_script_calls_claude_with_screenshots():
    mock_client = MagicMock()
    mock_client.messages.create.return_value.content = [
        MagicMock(text="---\nurl: https://app.com\ntheme: saas\n---\n\n1. Go to homepage")
    ]
    page_map = {
        "pages": [
            {"url": "https://app.com", "title": "Home", "screenshot_b64": "abc123", "links": []},
        ]
    }
    result = generate_script(page_map, "https://app.com", mock_client)
    assert "https://app.com" in result
    mock_client.messages.create.assert_called_once()
    # Verify the message included an image block with the screenshot
    call_kwargs = mock_client.messages.create.call_args
    messages = call_kwargs.kwargs.get("messages") or (call_kwargs.args[0] if call_kwargs.args else None)
    assert messages is not None
    content = messages[0]["content"] if isinstance(messages, list) else []
    image_blocks = [c for c in content if isinstance(c, dict) and c.get("type") == "image"]
    assert len(image_blocks) >= 1, "Expected at least one image block in the Claude message"
    assert image_blocks[0]["source"]["data"] == "abc123"


def test_generate_script_returns_string():
    mock_client = MagicMock()
    mock_client.messages.create.return_value.content = [
        MagicMock(text="1. Click something")
    ]
    page_map = {"pages": [{"url": "https://x.com", "title": "X", "screenshot_b64": "x", "links": []}]}
    result = generate_script(page_map, "https://x.com", mock_client)
    assert isinstance(result, str)


def test_crawl_app_filters_links_to_same_domain():
    """crawl_app should only follow links to the same domain."""
    # We test crawl_app's link-filtering and deduplication logic by injecting
    # a mocked Playwright context that returns a controllable page.

    mock_page = MagicMock()
    mock_page.title.return_value = "Home"
    mock_page.screenshot.return_value = b"\x89PNG\r\n"

    # Simulate 3 links: 2 same-domain, 1 external
    same_domain_link = MagicMock()
    same_domain_link.get_attribute.return_value = "/dashboard"

    external_link = MagicMock()
    external_link.get_attribute.return_value = "https://evil.com/page"

    same_domain_link2 = MagicMock()
    same_domain_link2.get_attribute.return_value = "/settings"

    links_locator = MagicMock()
    links_locator.all.return_value = [same_domain_link, external_link, same_domain_link2]

    pw_locator = MagicMock()
    pw_locator.count.return_value = 0  # no login form

    def locator_side_effect(selector):
        if "href" in selector:
            return links_locator
        return pw_locator

    mock_page.locator.side_effect = locator_side_effect

    mock_browser = MagicMock()
    mock_browser.new_page.return_value = mock_page

    mock_p = MagicMock()
    mock_p.chromium.launch.return_value = mock_browser

    mock_playwright_ctx = MagicMock()
    mock_playwright_ctx.__enter__ = MagicMock(return_value=mock_p)
    mock_playwright_ctx.__exit__ = MagicMock(return_value=False)

    with patch("crawl.sync_playwright", return_value=mock_playwright_ctx):
        result = crawl_app("https://app.example.com", max_pages=1)

    assert len(result["pages"]) == 1
    page_data = result["pages"][0]
    # External link should be filtered out; only same-domain links kept
    for link in page_data["links"]:
        assert "app.example.com" in link, f"External domain in links: {link}"
    # External link is not present
    assert not any("evil.com" in link for link in page_data["links"])
