import os
import requests
import yaml
from datetime import datetime

# Configuration
REPO = "Ibrahimkhan4real/ibrahimkhan4real.github.io"
ISSUE_LABEL = "current-status"
DATA_FILE = "_data/now.yml"

def fetch_latest_issue():
    url = f"https://api.github.com/repos/{REPO}/issues?labels={ISSUE_LABEL}&state=open"
    headers = {"Accept": "application/vnd.github.v3+json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200 and response.json():
        return response.json()[0]
    return None

def update_now_data(issue):
    if not issue:
        print("No open issue with label 'current-status' found.")
        return

    data = {
        "updated": datetime.now().strftime("%B %Y"),
        "content": issue["body"],
        "issue_url": issue["html_url"]
    }

    with open(DATA_FILE, "w") as f:
        yaml.dump(data, f)
    print(f"Updated {DATA_FILE} with content from issue: {issue['title']}")

if __name__ == "__main__":
    latest_issue = fetch_latest_issue()
    update_now_data(latest_issue)
