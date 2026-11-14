#!/usr/bin/env bash
# Checks a commune document set for the three faults that have one right answer:
# a missing file, a link or anchor that does not resolve, a source tag with no definition.
set -euo pipefail

readonly DOCUMENTS=(brief.md analysis.md decision-space.md sources.md guide.md prompt.md decision.md)

main() {
    local directory="${1:?usage: check.sh <directory>}"
    cd "$directory"

    local failures
    failures="$(
        report_missing_files
        for file in *.md; do
            report_broken_links "$file"
            report_undefined_tags "$file"
        done
    )"

    if [[ -n "$failures" ]]; then
        printf '%s\n' "$failures"
        exit 1
    fi
}

report_missing_files() {
    local file
    for file in "${DOCUMENTS[@]}"; do
        [[ -f "$file" ]] || echo "$file: missing"
    done
}

report_broken_links() {
    local file="$1" line target path anchor
    while IFS=$'\t' read -r line target; do
        path="${target%%#*}"
        anchor=""
        [[ "$target" == *"#"* ]] && anchor="${target#*#}"
        [[ -n "$path" ]] || path="$file"

        if [[ ! -e "$path" ]]; then
            echo "$file:$line: link to $target, and $path does not exist"
        elif [[ -n "$anchor" ]] && ! heading_slugs "$path" | grep -qxF -- "$anchor"; then
            echo "$file:$line: link to $target, and $path has no heading for #$anchor"
        fi
    done < <(relative_link_targets "$file")
}

report_undefined_tags() {
    local file="$1" line tag
    while IFS=$'\t' read -r line tag; do
        defined_tags "$file" | grep -qxF -- "$tag" ||
            echo "$file:$line: source tag [$tag] has no reference definition"
    done < <(used_tags "$file")
}

# Prose only: fenced blocks become blank lines and inline code is removed,
# so line numbers still match the file.
prose() {
    awk '
        match($0, /^ *(`{3,}|~{3,})/) {
            fence = substr($0, RSTART, RLENGTH); gsub(/ /, "", fence)
            if (!open) { open = fence }
            else if (substr(fence, 1, 1) == substr(open, 1, 1) && length(fence) >= length(open)) { open = "" }
            print ""; next
        }
        open { print ""; next }
        { gsub(/`[^`]*`/, ""); print }
    ' "$1"
}

# Line number and target of every inline link and reference definition that is not a URL.
relative_link_targets() {
    prose "$1" | awk '
        {
            rest = $0
            while (match(rest, /\]\([^)]+\)/)) {
                print NR "\t" substr(rest, RSTART + 2, RLENGTH - 3)
                rest = substr(rest, RSTART + RLENGTH)
            }
        }
        match($0, /^\[[^]]+\]:[ \t]*[^ \t]+/) {
            target = substr($0, RSTART, RLENGTH); sub(/^\[[^]]+\]:[ \t]*/, "", target)
            print NR "\t" target
        }
    ' | grep -Ev $'\t''<?[a-z][a-z0-9+.-]*:' || true
}

# The anchors GitHub gives a file: lower case, punctuation dropped, spaces to hyphens.
heading_slugs() {
    prose "$1" | sed -En 's/^#+[[:space:]]+//p' |
        tr '[:upper:]' '[:lower:]' |
        sed -E 's/[^[:alnum:] _-]//g; s/ /-/g'
}

defined_tags() {
    prose "$1" | sed -En 's/^\[([^]]+)\]:.*/\1/p'
}

# A source tag is a bracketed lower-case name that is neither a link nor a definition.
used_tags() {
    prose "$1" | awk '
        /^\[[^]]+\]:/ { next }
        {
            rest = $0; before = ""
            while (match(rest, /\[[a-z][a-z0-9-]*\]/)) {
                tag = substr(rest, RSTART + 1, RLENGTH - 2)
                previous = RSTART > 1 ? substr(rest, RSTART - 1, 1) : before
                following = substr(rest, RSTART + RLENGTH, 1)
                if (previous != "]" && following != "(" && following != "[" && following != ":")
                    print NR "\t" tag
                before = "]"
                rest = substr(rest, RSTART + RLENGTH)
            }
        }
    '
}

main "$@"
