#!/bin/sh
set -eu

tool="${1:-}"
case "$tool" in
    node|pnpm) ;;
    *)
        echo "Unsupported Xcode build tool: ${tool:-missing}" >&2
        exit 64
        ;;
esac
shift

for directory in \
    "$HOME/Library/pnpm" \
    "$HOME/Library/Application Support/fnm/aliases/default/bin" \
    "$HOME/.local/share/fnm/aliases/default/bin" \
    "$HOME/.volta/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"
do
    if [ -d "$directory" ]; then
        PATH="$PATH:$directory"
    fi
done
export PATH

resolve_tool() {
    name="$1"
    if command -v "$name" >/dev/null 2>&1; then
        command -v "$name"
        return
    fi
    resolved=$(/bin/zsh -lic "command -v $name" 2>/dev/null || true)
    if [ -n "$resolved" ] && [ -x "$resolved" ]; then
        printf '%s\n' "$resolved"
        return
    fi
    echo "Xcode cannot find $name. Install Node.js and pnpm, or expose them from your login shell." >&2
    exit 127
}

if [ "$tool" = "pnpm" ]; then
    node_path=$(resolve_tool node)
    PATH="$(dirname "$node_path"):$PATH"
    export PATH
fi

tool_path=$(resolve_tool "$tool")
exec "$tool_path" "$@"
