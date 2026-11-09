---
"@allons-y/opx-cli": patch
---

Scans now report a `.yarnrc.yml` file as the `yarnrc` type as well as `.yml`. Before, the extension check ran first and the `yarnrc` mapping never matched.
