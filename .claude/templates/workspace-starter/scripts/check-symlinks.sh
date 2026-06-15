#!/usr/bin/env bash
# Validate symbolic links in the project: detect dangling targets and cycles.
# Usage:
#   check-symlinks.sh [path ...]
# Defaults to scanning the current directory if no paths are given.
# Exits 0 if all links are healthy, 1 otherwise.

set -uo pipefail

paths=("$@")
[ ${#paths[@]} -eq 0 ] && paths=(".")

broken=0
cyclic=0
total=0

# --- dangling targets ---
while IFS= read -r -d '' link; do
  total=$((total + 1))
  if ! readlink -e -- "$link" >/dev/null 2>&1; then
    target=$(readlink -- "$link")
    printf "  BROKEN  %s -> %s\n" "$link" "$target"
    broken=$((broken + 1))
  fi
done < <(find "${paths[@]}" -type l -print0 2>/dev/null)

# --- symlink cycles ---
# `find -L` emits "File system loop detected" on stderr when a directory cycle
# is reached. Capture stderr without descending too deep ourselves.
loop_lines=$(find -L "${paths[@]}" -maxdepth 16 -type d 2>&1 >/dev/null \
             | grep -E 'loop|too many levels' || true)
if [ -n "$loop_lines" ]; then
  echo "  CYCLES detected by 'find -L':"
  echo "$loop_lines" | sed 's/^/    /'
  cyclic=$(echo "$loop_lines" | wc -l)
fi

# --- report ---
echo
if [ "$broken" -eq 0 ] && [ "$cyclic" -eq 0 ]; then
  echo "OK: $total symlink(s) checked, all healthy."
  exit 0
fi
echo "FAIL: $broken broken link(s), $cyclic cycle(s) in $total total."
exit 1
