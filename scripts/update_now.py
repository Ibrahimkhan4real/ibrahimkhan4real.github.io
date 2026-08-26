import os
import sys
from datetime import date

import requests
import yaml

REPO = "Ibrahimkhan4real/ibrahimkhan4real.github.io"
REPO_OWNER = "Ibrahimkhan4real"
ISSUE_LABEL = "current-status"
DATA_FILE = "_data/now.yml"
MAX_SUMMARY_LENGTH = 2000


def github_headers():
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_latest_issue():
    url = f"https://api.github.com/repos/{REPO}/issues"
    response = requests.get(
        url,
        headers=github_headers(),
        params={
            "labels": ISSUE_LABEL,
            "state": "open",
            "sort": "updated",
            "direction": "desc",
            "per_page": 20,
        },
        timeout=20,
    )
    response.raise_for_status()

    for issue in response.json():
        if "pull_request" in issue:
            continue
        if issue.get("user", {}).get("login", "").casefold() != REPO_OWNER.casefold():
            continue
        return issue
    return None


def clean_summary(body):
    summary = " ".join((body or "").strip().split())
    if not summary:
        raise ValueError("The current-status issue body is empty.")
    if len(summary) > MAX_SUMMARY_LENGTH:
        raise ValueError(
            f"The current-status summary exceeds {MAX_SUMMARY_LENGTH} characters."
        )
    return summary


def update_now_data(issue):
    if not issue:
        print(
            "No open owner-authored issue with the current-status label was found; "
            "leaving _data/now.yml unchanged."
        )
        return False

    with open(DATA_FILE, encoding="utf-8") as data_file:
        data = yaml.safe_load(data_file) or {}

    if data.get("schema_version") != 2 or not isinstance(data.get("streams"), list):
        raise ValueError(
            "_data/now.yml must use schema_version 2 and preserve structured streams."
        )

    data["updated"] = date.today().isoformat()
    data["update_title"] = issue.get("title") or "Current work update"
    data["summary"] = clean_summary(issue.get("body"))
    data["source_issue"] = issue["html_url"]

    temporary_file = f"{DATA_FILE}.tmp"
    with open(temporary_file, "w", encoding="utf-8") as data_file:
        yaml.safe_dump(
            data,
            data_file,
            sort_keys=False,
            allow_unicode=True,
            width=88,
        )
    os.replace(temporary_file, DATA_FILE)
    print(f"Updated {DATA_FILE} from owner-authored issue #{issue['number']}.")
    return True


def main():
    try:
        issue = fetch_latest_issue()
        update_now_data(issue)
    except (requests.RequestException, OSError, ValueError, yaml.YAMLError) as error:
        print(f"Live status update failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
