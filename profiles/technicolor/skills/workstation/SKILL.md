---
name: workstation
description: >-
  Host-specific facts for TECHNICOLOR, the current device. Use for hardware, drivers, or desktop/session infrastructure. Do not use for ordinary application or developer-tool configuration.
---

# Environment
**Hostname:** TECHNICOLOR
**OS:** Arch Linux (btw)
**Bootloader:** GRUB
**Shell:** bash
**System package managers:** `pacman`, `yay` (AUR)

**CPU:** Intel i5-12600K
**GPU:** NVIDIA GeForce RTX 4070 Ti, 12GB (`nvidia-open` drivers)
**GPU compute:** CUDA at `/opt/cuda` (Arch's location)
**RAM:** 32GB
**Motherboard:** ASUS PRIME Z690M

**Compositor:** Hyprland (Wayland), launched through `uwsm`
**Hyprland config:** `~/.config/hypr/hyprland.lua` is Lua, so `hyprctl dispatch` takes a Lua expression, for example `hyprctl dispatch 'hl.dsp.dpms({action = "off", monitor = "DP-1"})'`. For other dispatchers, follow the `hl.dsp.*` calls in that file.
**Display Manager:** SDDM
**XDG_CURRENT_DESKTOP:** Hyprland:KDE
**Terminal:** kitty

**Current Keyboard:** Keychron Q1 HE Aluminum 75%

`~/dev/dots` owns configuration. Inspect that repository before
changing a live configuration file.

`~/.agents` owns agentic workflow configuration.
