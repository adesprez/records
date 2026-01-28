import os
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import requests

DISCOGS_API_BASE = "https://api.discogs.com"
CACHE_FILENAME = "masters_cache.json"


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

        if resp.status_code == 429:
            # Respect basic rate limiting using Retry-After when available
            # retry_after = int(resp.headers.get("Retry-After", "5"))
            # import time

            # time.sleep(retry_after)
            # continue
            raise Warning(f"We are hitting Discogs API rate limits")

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


def _load_master_cache(base_dir: str) -> Dict[str, Any]:
    cache_path = Path(base_dir) / CACHE_FILENAME
    if not cache_path.exists():
        # Initialize an empty cache file for better visibility
        with cache_path.open("w", encoding="utf-8") as f:
            json.dump({}, f, ensure_ascii=False, indent=2)
        return {}
    try:
        with cache_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        return {}
    return {}


def _save_master_cache(base_dir: str, cache: Dict[str, Any]) -> None:
    cache_path = Path(base_dir) / CACHE_FILENAME
    with cache_path.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def _get_master_year(
    master_id: int,
    headers: Dict[str, str],
    base_dir: str,
    master_cache: Dict[str, Any],
) -> Any:
    url = f"{DISCOGS_API_BASE}/masters/{master_id}"
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code != 200:
        return None
    data = resp.json()
    year = data.get("year") or None
    key = str(master_id)
    master_cache[key] = year
    print(f"[discogs] master {master_id} -> year {year}")
    _save_master_cache(base_dir, master_cache)
    return year


def fetch_collection(
    username: str,
    token: str,
    headers: Dict[str, str],
    base_dir: str,
    master_cache: Dict[str, Any],
) -> List[Dict[str, Any]]:
    url = f"{DISCOGS_API_BASE}/users/{username}/collection/folders/0/releases"
    all_releases = _fetch_paginated(url, headers, "releases")

    simplified: List[Dict[str, Any]] = []
    for entry in all_releases:
        info = entry.get("basic_information", {})
        release_id = info.get("id")
        artists = info.get("artists", []) or []
        artist_names = ", ".join(a.get("name", "") for a in artists if a.get("name"))

        release_year = info.get("year") or None
        master_id = info.get("master_id")
        if isinstance(master_id, int):
            key = str(master_id)
            if key in master_cache:
                master_year = master_cache[key]
            else:
                master_year = _get_master_year(
                    master_id, headers, base_dir, master_cache
                )
            year = master_year or release_year
        else:
            year = release_year

        genres = info.get("genres") or []
        genre_str = ", ".join(g for g in genres if g)

        simplified.append(
            {
                "id": release_id,
                "artist": artist_names,
                "album": info.get("title", ""),
                "genre": genre_str,
                "year": year,
            }
        )

    simplified.sort(key=lambda x: (x["artist"].lower(), x["album"].lower()))

    return simplified


def fetch_wantlist(
    username: str,
    token: str,
    headers: Dict[str, str],
    base_dir: str,
    master_cache: Dict[str, Any],
) -> List[Dict[str, Any]]:
    url = f"{DISCOGS_API_BASE}/users/{username}/wants"
    all_items = _fetch_paginated(url, headers, "wants")

    simplified: List[Dict[str, Any]] = []
    for entry in all_items:
        info = entry.get("basic_information", {})
        release_id = info.get("id")
        artists = info.get("artists", []) or []
        artist_names = ", ".join(a.get("name", "") for a in artists if a.get("name"))

        release_year = info.get("year") or None
        master_id = info.get("master_id")
        if isinstance(master_id, int):
            key = str(master_id)
            if key in master_cache:
                master_year = master_cache[key]
            else:
                master_year = _get_master_year(
                    master_id, headers, base_dir, master_cache
                )
            year = master_year or release_year
        else:
            year = release_year

        genres = info.get("genres") or []
        genre_str = ", ".join(g for g in genres if g)

        notes = entry.get("notes") or ""
        if not isinstance(notes, str):
            notes = str(notes)
        lower_notes = notes.lower()
        is_purchasing = "purchas" in lower_notes

        simplified.append(
            {
                "id": release_id,
                "artist": artist_names,
                "album": info.get("title", ""),
                "genre": genre_str,
                "year": year,
                "purchasing": is_purchasing,
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

    headers = {
        "User-Agent": "discogs-collection-sync-python/1.0",
        "Authorization": f"Discogs token={token}",
    }

    base_dir = os.path.dirname(__file__)
    master_cache = _load_master_cache(base_dir)

    try:
        collection = fetch_collection(username, token, headers, base_dir, master_cache)
        wantlist = fetch_wantlist(username, token, headers, base_dir, master_cache)
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Failed to fetch data from Discogs: {exc}")
        return 1

    _save_master_cache(base_dir, master_cache)

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
