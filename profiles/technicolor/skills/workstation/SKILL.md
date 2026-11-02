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
**Display Manager:** SDDM
**XDG_CURRENT_DESKTOP:** Hyprland:KDE
**Terminal:** kitty

**Current Keyboard:** Keychron Q1 HE Aluminum 75%

`~/dev/dots` owns configuration. Inspect that repository before
changing a live configuration file.

`~/.agents` owns agentic workflow configuration.
