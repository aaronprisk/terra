#!/bin/bash
# Run the membership validator using uv for dependency management
#
# Usage:
#   ./run-validator.sh                      # Normal run (modifies files)
#   ./run-validator.sh --dry-run            # Check only, no file changes
#   ./run-validator.sh --check popey pitti  # Check specific nick(s)
#   ./run-validator.sh --verbose            # Show more details
#   ./run-validator.sh --check popey -v     # Check nick with details

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create venv if it doesn't exist
if [ ! -d ".venv-validator" ]; then
    echo "Creating virtual environment with uv..."
    uv venv .venv-validator
fi

# Install dependencies
echo "Installing dependencies..."
uv pip install --python .venv-validator/bin/python launchpadlib

# Run the validator
echo "Running membership validator..."
.venv-validator/bin/python validate-members.py "$@"
