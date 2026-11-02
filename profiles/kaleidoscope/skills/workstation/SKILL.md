---
name: workstation
description: >-
  Host-specific facts for kaleidoscope, the current device. Use for hardware, drivers, or desktop/session infrastructure. Do not use for ordinary application or developer-tool configuration.
---

# Environment

**Hostname:** kaleidoscope
**Model:** MacBook Pro 16-inch, 2019 (`MacBookPro16,1`, Intel x86_64)
**OS:** macOS 26.7.1 (25G241)
**Shell:** bash 5 (`/opt/local/bin/bash`, MacPorts)
**System package managers:** MacPorts (`port`, `/opt/local`, root-owned). No Homebrew.

**CPU:** Intel Core i7-9750H, 6 cores / 12 threads
**GPU:** AMD Radeon Pro 5300M, 4GB; Intel UHD Graphics 630 (integrated)
**RAM:** 16GB
**Display:** Built-in Retina, 3072 x 1920
**Storage:** 500GB internal SSD; FileVault off

**Power:** configured to not sleep. AlDente will keep the battery at 80%; on battery, a launch daemon shuts the host down cleanly at 15%.
**Graphics:** integrated GPU only (`gpuswitch 0`); the Radeon hung the machine in October 2026. An external display wakes it regardless, since the ports are wired to it.
**Container VM:** Colima (`vz`), 4 CPUs, 6GB RAM, 100GB disk, no GPU.

**Terminal:** kitty

