# Shared by setup.sh, update.sh and refresh.sh. Sourced, not run.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

profile_names() {
    local names=()
    local profile

    for profile in "$REPO"/profiles/*/; do
        names+=("$(basename "$profile")")
    done
    (IFS='|'; echo "${names[*]}")
}

usage() {
    echo "usage: $0 --profile $(profile_names)" >&2
    exit 1
}

# Sets PROFILE from a leading `--profile <name>`; the caller shifts past it.
parse_profile() {
    [[ $# -ge 2 && "$1" == "--profile" ]] || usage
    PROFILE="$2"
    [[ -n "$PROFILE" && -d "$REPO/profiles/$PROFILE" ]] || {
        echo "unknown profile: $PROFILE" >&2
        usage
    }
}

require_command() {
    command -v "$1" >/dev/null || {
        echo "$1 is not installed; run scripts/setup.sh first" >&2
        exit 1
    }
}
