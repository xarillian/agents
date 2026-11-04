#!/usr/bin/env bash
#
# Usage: evidence.sh <start_date> <end_date>    (YYYY-MM-DD, local time, end_date exclusive)
set -euo pipefail

start_date="$1"
end_date="$2"
projects="$HOME/.claude/projects"
here="$(dirname "$(realpath "$0")")"
mailmap="$here/mailmap"

main() {
    local entries touched
    entries="$(transcript_entries)"
    # This skill's own repository holds my agent workflow, which I also
    # change from other machines, so it is read even when no session here
    # touched it.
    touched="$({ jq -r '.cwd // empty' <<<"$entries"; echo "$PWD"; echo "$here"; } | repos)"

    echo "## Sessions ($start_date to $end_date, local time)"
    summarize_sessions <<<"$entries"

    echo
    echo "## Commits"
    while read -r repo; do
        [[ -n "$repo" ]] && authored_commits "$repo"
    done <<<"$touched"

    echo
    echo "## GitLab activity (pushes are under Commits)"
    gitlab_hosts <<<"$touched" | while read -r host; do
        gitlab_events "$host"
    done

    echo
    echo "## GitHub issues and PRs involving me, updated in the window"
    github_activity

    echo
    echo "## Open now"
    gitlab_hosts <<<"$touched" | while read -r host; do
        gitlab_open_work "$host"
    done
    github_open_work
}

# One compact line per transcript entry inside the window. Subagent
# transcripts repeat their parent's work, and /private/tmp projects are
# scratchpad experiments rather than work.
transcript_entries() {
    fd -e jsonl --exclude subagents --exclude='-private-*' \
        --changed-after "$start_date 00:00:00" . "$projects" -X \
        jq -cR --arg start_date "$start_date" --arg end_date "$end_date" '
            # What the user typed, with slash commands unwrapped to "/name args".
            # Tool results, injected skill text, and other wrappers are not.
            def slash_command:
                [capture("<command-name>(?<name>[^<]*)</command-name>").name,
                 (capture("<command-args>(?<args>[^<]*)</command-args>").args // "")]
                | join(" ") | rtrimstr(" ");
            def prompt_text:
                select(.type == "user" and (.isMeta | not))
                | .message.content
                | if type == "string" then . else map(select(.type == "text") | .text) | join(" ") end
                | if test("<command-name>") then slash_command else . end
                | select(. != "" and (startswith("<") | not));

            # A live session may end in a half-written line.
            fromjson?
            | select((.type == "user" or .type == "assistant") and (.isSidechain | not))
            | (.timestamp | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%Y-%m-%d %H:%M")) as $at
            | select($at >= $start_date and $at < $end_date)
            | {file: input_filename, at: $at, ts: .timestamp, cwd, branch: .gitBranch, prompt: (prompt_text // null)}
        '
}

summarize_sessions() {
    jq -rs '
        def short: gsub("\\s+"; " ") | .[0:140];
        group_by(.file)
        | map({
            start: (map(.at) | min), end: (map(.at) | max), through: (map(.ts) | max), file: .[0].file,
            cwds: (map(.cwd // empty | if startswith(env.HOME) then "~" + ltrimstr(env.HOME) else . end) | unique),
            branches: (map(.branch // empty) - ["HEAD"] | unique),
            prompts: map(.prompt // empty)
          })
        | sort_by(.start)[]
        | "\(.start[5:])–\(.end[11:])  turns=\(.prompts | length)  \(.cwds | join(", "))"
          + (if .branches == [] then "" else "  [\(.branches | join(", "))]" end)
          + "\n  first: \(.prompts | first // "" | short)"
          + "\n  last:  \(.prompts | last // "" | short)"
          + (([.prompts[] | scan("https://[^\\s)>\\]]+") | sub("#.*"; "") | rtrimstr(",") | rtrimstr(".")] | unique) as $links
             | if $links == [] then "" else "\n  links: \($links | join(" "))" end)
          + "\n  file:  \(.file)\n  through: \(.through)\n"
    '
}

# Distinct repositories behind a list of directories. Worktrees share their
# main repository's refs, so they collapse into it.
repos() {
    sort -u | while read -r dir; do
        git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true
    done | sort -u | sed 's#/\.git$##'
}

# Fetching first picks up what I pushed from other machines, under any of
# the identities the mailmap folds together.
authored_commits() {
    local repo="$1" email me log
    email="$(git -C "$repo" config user.email)" || return 0
    me="$(git -C "$repo" -c mailmap.file="$mailmap" check-mailmap "<$email>" | sed -E 's/.*<(.*)>/\1/')"
    git -C "$repo" fetch --quiet --all 2>/dev/null || echo "### ${repo/#"$HOME"/\~}: fetch failed, remote commits may be missing"
    log="$(git -C "$repo" -c mailmap.file="$mailmap" log --use-mailmap --all --source --no-merges --author="$me" \
        --start_date="$start_date 00:00" --end_date="$end_date 00:00" \
        --date=format-local:'%m-%d %H:%M' --format='%ad  %h  %S  %s' | sed -E 's#refs/(heads|remotes)/##')"
    [[ -n "$log" ]] || return 0
    echo "### ${repo/#"$HOME"/\~}"
    echo "$log"
}

gitlab_hosts() {
    while read -r repo; do
        [[ -n "$repo" ]] && git -C "$repo" remote get-url origin 2>/dev/null || true
    done | sed -E 's#^[a-z+]+://##; s#^[^@/]*@##; s#[:/].*##' | rg -v '^github\.com$' | sort -u || true
}

# Everything I did on a GitLab host besides pushing: MRs opened, approved,
# merged, and closed, and comments counted per MR or issue.
gitlab_events() {
    local host="$1" events names
    if ! events="$(glab api --hostname "$host" --paginate \
        "events?after=$(shift_day "$start_date" -1)&before=$(shift_day "$end_date" 1)&per_page=100" | jq -s 'add // []')"; then
        echo "### $host: glab could not read events"
        return 0
    fi
    names="$(jq -r '.[].project_id' <<<"$events" | sort -u | while read -r id; do
        glab api --hostname "$host" "projects/$id" | jq -c '{(.id | tostring): .path}'
    done | jq -s 'add // {}')"

    echo "### $host"
    jq -r --arg start_date "$start_date" --arg end_date "$end_date" --argjson names "$names" '
        def sigil: {MergeRequest: "!", Issue: "#", WorkItem: "#"}[.] // "\(.) ";
        map(select(.push_data == null)
            | (.created_at | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%Y-%m-%d %H:%M")) as $at
            | select($at >= $start_date and $at < $end_date)
            | {at: $at, action: .action_name, project: ($names[.project_id | tostring] // .project_id),
               target: (if .note then "\(.note.noteable_type | sigil)\(.note.noteable_iid)" else "\(.target_type | sigil)\(.target_iid)" end),
               title: (.target_title // "")})
        | sort_by(.at) | group_by([.action, .project, .target])
        | map(first + {count: length})
        | sort_by(.at)[]
        | "\(.at[5:])  \(.action)\(if .count > 1 then " ×\(.count)" else "" end)  \(.project) \(.target)  \(.title[0:90])"
    ' <<<"$events"
}

# What waits on whom: my MRs with GitLab's own verdict on why each is not
# merged yet, and the reviews asked of me that I have not approved.
gitlab_open_work() {
    local host="$1" me mr_line
    if ! me="$(glab api --hostname "$host" user | jq -r .username)"; then
        echo "### $host: glab could not read open MRs"
        return 0
    fi
    mr_line='"\(.updated_at | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%m-%d"))  \(.references.full | split("/") | last)  \(.detailed_merge_status)  \(.title[0:80])"'

    echo "### $host: my open MRs (last updated, merge status)"
    glab api --hostname "$host" --paginate 'merge_requests?scope=created_by_me&state=opened&per_page=100' \
        | jq -s -r "add[] | $mr_line + \"  reviewers: \([.reviewers[].username] | join(\", \"))\""

    echo "### $host: reviews asked of me, not yet approved"
    glab api --hostname "$host" --paginate "merge_requests?reviewer_username=$me&state=opened&scope=all&per_page=100" \
        | jq -s -c 'add[]' | while read -r mr; do
            approved="$(glab api --hostname "$host" "projects/$(jq .project_id <<<"$mr")/merge_requests/$(jq .iid <<<"$mr")/approvals" \
                | jq --arg me "$me" 'any(.approved_by[]; .user.username == $me)')"
            [[ "$approved" == true ]] || jq -r "$mr_line" <<<"$mr"
        done
}

github_open_work() {
    local pr_line='.[] | "\(.updatedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%m-%d"))  \(.repository.nameWithOwner)#\(.number)  \(.title[0:80])"'
    echo "### GitHub: my open PRs"
    gh search prs --author=@me --state=open --json repository,number,title,updatedAt --jq "$pr_line" || echo "gh could not search GitHub"
    echo "### GitHub: reviews asked of me"
    gh search prs --review-requested=@me --state=open --json repository,number,title,updatedAt --jq "$pr_line" || echo "gh could not search GitHub"
}

github_activity() {
    local offset
    offset="$(date +%z | sed -E 's/(..)$/:\1/')"
    gh search issues --include-prs --involves=@me \
        --updated="${start_date}T00:00:00$offset..${end_date}T00:00:00$offset" --limit 100 \
        --json repository,number,title,state,isPullRequest,updatedAt \
        --jq '.[] | "\(.updatedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%m-%d %H:%M"))  \(if .isPullRequest then "PR" else "issue" end) \(.state)  \(.repository.nameWithOwner)#\(.number)  \(.title[0:90])"' \
        || echo "gh could not search GitHub"
}

# GitLab bounds events by whole UTC days, exclusively, so ask for a day of
# slack either side and trim to local time afterwards.
shift_day() {
    jq -rn --arg day "$1" --argjson by "$2" '$day | strptime("%Y-%m-%d") | mktime + $by * 86400 | strftime("%Y-%m-%d")'
}

main
