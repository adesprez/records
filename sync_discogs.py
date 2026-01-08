import os
import json
import sys
from typing import Any, Dict, List

import requests

DISCOGS_API_BASE = "https://api.discogs.com"


def _fetch_paginated(
    url: str, headers: Dict[str, str], key: str
) -> List[Dict[str, Any]]:
    per_page = 100
    page = 1
    pages_total = 1
    items: List[Dict[str, Any]] = []

    while page <= pages_total:
        params = {"per_page": per_page, "page": page}
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(
                f"Discogs API error on page {page}: {resp.status_code} {resp.text}"
            )
        data = resp.json()
        if "pagination" in data:
            pages_total = data["pagination"].get("pages", pages_total)
        items.extend(data.get(key, []))
        page += 1

    return items


def fetch_collection(username: str, token: str) -> List[Dict[str, Any]]:
    headers = {
        "User-Agent": "discogs-collection-sync-python/1.0",
        "Authorization": f"Discogs token={token}",
    }
    url = f"{DISCOGS_API_BASE}/users/{username}/collection/folders/0/releases"
    all_releases = _fetch_paginated(url, headers, "releases")

    simplified: List[Dict[str, Any]] = []
    for entry in all_releases:
        info = entry.get("basic_information", {})
        artists = info.get("artists", []) or []
        artist_names = ", ".join(a.get("name", "") for a in artists if a.get("name"))
        simplified.append(
            {
                "artist": artist_names,
                "album": info.get("title", ""),
                "year": info.get("year", "") or None,
            }
        )

    simplified.sort(key=lambda x: (x["artist"].lower(), x["album"].lower()))

    return simplified


def fetch_wantlist(username: str, token: str) -> List[Dict[str, Any]]:
    headers = {
        "User-Agent": "discogs-collection-sync-python/1.0",
        "Authorization": f"Discogs token={token}",
    }
    url = f"{DISCOGS_API_BASE}/users/{username}/wants"
    all_items = _fetch_paginated(url, headers, "wants")

    simplified: List[Dict[str, Any]] = []
    for entry in all_items:
        info = entry.get("basic_information", {})
        artists = info.get("artists", []) or []
        artist_names = ", ".join(a.get("name", "") for a in artists if a.get("name"))
        simplified.append(
            {
                "artist": artist_names,
                "album": info.get("title", ""),
                "year": info.get("year", "") or None,
            }
        )

    simplified.sort(key=lambda x: (x["artist"].lower(), x["album"].lower()))

    return simplified


def main() -> int:
    username = os.getenv("DISCOGS_USER")
    token = os.getenv("DISCOGS_TOKEN")

    if not username or not token:
        print(
            "Error: DISCOGS_USER and DISCOGS_TOKEN environment variables must be set."
        )
        return 1

    try:
        collection = fetch_collection(username, token)
        wantlist = fetch_wantlist(username, token)
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Failed to fetch data from Discogs: {exc}")
        return 1

    payload = {
        "updated_at": __import__("datetime")
        .datetime.now(__import__("datetime").timezone.utc)
        .isoformat(),
        "items": collection,
    }
    want_payload = {
        "updated_at": __import__("datetime")
        .datetime.now(__import__("datetime").timezone.utc)
        .isoformat(),
        "items": wantlist,
    }

    base_dir = os.path.dirname(__file__)
    collection_path = os.path.join(base_dir, "collection.json")
    wantlist_path = os.path.join(base_dir, "wantlist.json")

    with open(collection_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(wantlist_path, "w", encoding="utf-8") as f:
        json.dump(want_payload, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(collection)} collection releases to {collection_path}")
    print(f"Saved {len(wantlist)} wantlist items to {wantlist_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
