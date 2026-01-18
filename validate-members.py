#!/usr/bin/env python3
"""
Validate that feeds.json entries correspond to current Ubuntu Members.

Checks each nick in feeds.json against the ~ubuntumembers team on Launchpad.
When non-members are found, generates updated feeds.json and PR description.

Usage:
    python validate-members.py                  # Normal run (modifies files)
    python validate-members.py --dry-run        # Check only, no file changes
    python validate-members.py --check NICK     # Check specific nick(s)
    python validate-members.py --verbose        # Show more details
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from launchpadlib.launchpad import Launchpad


FEEDS_FILE = "feeds.json"
PR_BODY_FILE = "pr-body.md"

# Nicks that should be allowed even if not direct Ubuntu Members
# (e.g., team accounts, official Ubuntu sources)
ALLOWED_NICKS = {
    "uwn",  # Ubuntu Weekly News
}


def load_feeds():
    """Load feeds from feeds.json."""
    with open(FEEDS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_feeds(feeds):
    """Save feeds to feeds.json with consistent formatting."""
    with open(FEEDS_FILE, "w", encoding="utf-8") as f:
        json.dump(feeds, f, indent=2, ensure_ascii=False)
        f.write("\n")


def get_unique_nicks(feeds):
    """Extract unique nicks from feeds, excluding allowed nicks."""
    nicks = set()
    for feed in feeds:
        nick = feed.get("nick", "")
        if nick and nick.lower() not in {a.lower() for a in ALLOWED_NICKS}:
            nicks.add(nick)
    return nicks


def get_ubuntu_members(launchpad, verbose=False):
    """Get set of all Ubuntu Member usernames from Launchpad."""
    print("Fetching ~ubuntumembers participants from Launchpad...")
    team = launchpad.people["ubuntumembers"]

    # Get all participants (includes indirect members via sub-teams)
    members = set()
    for person in team.participants:
        members.add(person.name)  # Launchpad returns lowercase names

    print(f"Found {len(members)} Ubuntu Members")

    if verbose:
        # Show some sample members for verification
        sample = sorted(list(members))[:10]
        print(f"  Sample members: {', '.join(sample)}...")

    return members


def check_user_exists(launchpad, nick):
    """Check if a Launchpad user exists. Returns (exists, person_or_none)."""
    try:
        person = launchpad.people[nick]
        return True, person
    except KeyError:
        return False, None
    except Exception as e:
        # API errors (network issues, malformed responses, etc.)
        print(f"  Warning: API error checking {nick}: {e}")
        return None, None  # Unknown - couldn't verify


def check_single_nick(launchpad, nick, ubuntu_members, verbose=False):
    """
    Check a single nick and print detailed info.

    Returns: 'member', 'not_member', 'not_found', or 'error'
    """
    # Normalize to lowercase for Launchpad lookup
    lp_nick = nick.lower()

    print(f"\nChecking: {nick} (LP: {lp_nick})")

    # Check if in members set
    if lp_nick in ubuntu_members:
        print(f"  Status: MEMBER (found in ~ubuntumembers participants)")
        return 'member'

    # Not in participants - check if user exists
    exists, person = check_user_exists(launchpad, lp_nick)

    if exists is None:
        print(f"  Status: ERROR (couldn't verify)")
        return 'error'

    if not exists:
        print(f"  Status: NOT FOUND on Launchpad")
        return 'not_found'

    # User exists but not a member
    print(f"  Status: NOT A MEMBER")

    if verbose and person:
        print(f"  Display name: {person.display_name}")
        # Try to show what teams they're in
        try:
            teams = list(person.super_teams)[:5]
            if teams:
                team_names = [t.name for t in teams]
                print(f"  Some teams: {', '.join(team_names)}")
        except Exception as e:
            print(f"  (couldn't fetch teams: {e})")

    return 'not_member'


def validate_memberships(feeds, launchpad, verbose=False):
    """
    Validate all feed nicks against Ubuntu membership.

    Returns:
        tuple: (valid_feeds, removed_entries, not_found_nicks)
    """
    nicks_to_check = get_unique_nicks(feeds)
    print(f"Checking {len(nicks_to_check)} unique nicks...")

    # Get all Ubuntu Members once (efficient)
    ubuntu_members = get_ubuntu_members(launchpad, verbose)

    # Build a mapping from original nick to lowercase for comparison
    # but preserve original case for reporting
    nick_to_lower = {nick: nick.lower() for nick in nicks_to_check}

    # Categorize nicks
    non_member_nicks = set()  # Original case
    not_found_nicks = set()   # Original case
    error_nicks = set()       # Original case

    for nick in sorted(nicks_to_check):
        lp_nick = nick_to_lower[nick]

        if lp_nick in ubuntu_members:
            if verbose:
                print(f"  {nick}: OK (member)")
            continue  # Valid member

        # Not in members list - check if user exists at all
        exists, person = check_user_exists(launchpad, lp_nick)

        if exists is None:
            # API error - don't remove, just warn
            error_nicks.add(nick)
            continue

        if exists:
            non_member_nicks.add(nick)
            print(f"  {nick}: NOT an Ubuntu Member")
        else:
            not_found_nicks.add(nick)
            print(f"  {nick}: User not found on Launchpad")

    # Filter feeds - only remove confirmed non-members/not-found
    # Keep feeds with API errors (safer)
    invalid_nicks = non_member_nicks | not_found_nicks
    valid_feeds = []
    removed_entries = []

    for feed in feeds:
        nick = feed.get("nick", "")
        if nick in invalid_nicks:
            removed_entries.append({
                **feed,
                "reason": "not_found" if nick in not_found_nicks else "not_member"
            })
        else:
            valid_feeds.append(feed)

    if error_nicks:
        print(f"\nNote: {len(error_nicks)} nicks had API errors and were NOT removed:")
        for nick in sorted(error_nicks):
            print(f"  - {nick}")

    return valid_feeds, removed_entries, not_found_nicks


def generate_pr_body(removed_entries, not_found_nicks):
    """Generate markdown content for the PR body."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        "## Feeds Removed",
        "",
        "The following feeds have been removed because the associated",
        "Launchpad user is no longer an Ubuntu Member or was not found:",
        "",
        "| Name | Nick | Reason | Feed URL |",
        "|------|------|--------|----------|",
    ]

    for entry in removed_entries:
        nick = entry["nick"]
        name = entry["name"]
        url = entry["url"]
        reason = "User not found" if entry["reason"] == "not_found" else "Not a member"
        lines.append(f"| {name} | {nick} | {reason} | {url} |")

    lines.extend([
        "",
        "---",
        f"Validated against [~ubuntumembers](https://launchpad.net/~ubuntumembers) on {now}",
    ])

    return "\n".join(lines)


def set_github_output(name, value):
    """Set a GitHub Actions output variable."""
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"{name}={value}\n")
    # Also print for local testing
    print(f"::set-output name={name}::{value}")


def main():
    parser = argparse.ArgumentParser(
        description="Validate feeds.json against Ubuntu membership"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check only, don't modify files"
    )
    parser.add_argument(
        "--check",
        nargs="+",
        metavar="NICK",
        help="Check specific nick(s) only"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show more details"
    )
    args = parser.parse_args()

    # Connect to Launchpad (anonymous, read-only)
    print("Connecting to Launchpad...")
    launchpad = Launchpad.login_anonymously(
        "terra-membership-validator",
        "production",
        version="devel"
    )

    # If checking specific nicks, just do that
    if args.check:
        print("Fetching Ubuntu Members list...")
        ubuntu_members = get_ubuntu_members(launchpad, args.verbose)

        for nick in args.check:
            check_single_nick(launchpad, nick, ubuntu_members, args.verbose)
        return 0

    # Normal validation mode
    if args.dry_run:
        print("DRY RUN MODE - no files will be modified\n")

    # Load feeds
    feeds = load_feeds()
    print(f"Loaded {len(feeds)} feeds from {FEEDS_FILE}")

    # Validate memberships
    valid_feeds, removed_entries, not_found_nicks = validate_memberships(
        feeds, launchpad, args.verbose
    )

    # Summary
    print(f"\n=== Summary ===")
    print(f"Total feeds: {len(feeds)}")
    print(f"Valid feeds: {len(valid_feeds)}")
    print(f"Removed: {len(removed_entries)}")

    if not removed_entries:
        print("\nAll feeds belong to current Ubuntu Members!")
        set_github_output("has_changes", "false")
        return 0

    print(f"\nFeeds to remove:")
    for entry in removed_entries:
        reason = "not found" if entry["reason"] == "not_found" else "not a member"
        print(f"  - {entry['name']} ({entry['nick']}): {reason}")

    if args.dry_run:
        print("\nDry run - no changes made")
        set_github_output("has_changes", "false")
        return 0

    # Write updated feeds.json
    save_feeds(valid_feeds)
    print(f"\nUpdated {FEEDS_FILE}")

    # Write PR body
    pr_body = generate_pr_body(removed_entries, not_found_nicks)
    with open(PR_BODY_FILE, "w", encoding="utf-8") as f:
        f.write(pr_body)
    print(f"Generated {PR_BODY_FILE}")

    set_github_output("has_changes", "true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
