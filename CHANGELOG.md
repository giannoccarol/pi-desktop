## [0.6.7](https://github.com/giannoccarol/pi-desktop/compare/v0.6.6...v0.6.7) (2026-08-25)


### Bug Fixes

* **renderer:** stabilizza chat e ridisegna lo store plugin ([25cbd28](https://github.com/giannoccarol/pi-desktop/commit/25cbd28876f1e82fb73efffb4afbb9a35201c8d6))

## [0.6.6](https://github.com/giannoccarol/pi-desktop/compare/v0.6.5...v0.6.6) (2026-08-25)


### Bug Fixes

* **renderer,build:** icone Arch + i18n labels saltate ([01b3df2](https://github.com/giannoccarol/pi-desktop/commit/01b3df2eed6fe65a37a74dfe0d226966cfb3350f))

## [0.6.5](https://github.com/giannoccarol/pi-desktop/compare/v0.6.4...v0.6.5) (2026-08-25)

## [0.6.4](https://github.com/giannoccarol/pi-desktop/compare/v0.6.3...v0.6.4) (2026-08-25)


### Bug Fixes

* **renderer:** evita SyntaxError su globali condivisi (var vs const) ([a9454db](https://github.com/giannoccarol/pi-desktop/commit/a9454dbc9b1f3e9ce49b0b564b5cdeeba20b899a))

## [0.6.3](https://github.com/giannoccarol/pi-desktop/compare/v0.6.2...v0.6.3) (2026-08-25)

## [0.6.2](https://github.com/giannoccarol/pi-desktop/compare/v0.6.1...v0.6.2) (2026-08-25)


### Bug Fixes

* **build:** usa artifactName GitHub-safe Pi-Desktop per fix auto-updater 404 ([aead89d](https://github.com/giannoccarol/pi-desktop/commit/aead89d18b1065ef46e5a419340bf92447d5b6dc))

## [0.6.1](https://github.com/giannoccarol/pi-desktop/compare/v0.6.0...v0.6.1) (2026-08-25)

# [0.6.0](https://github.com/giannoccarol/pi-desktop/compare/v0.5.0...v0.6.0) (2026-08-25)


### Bug Fixes

* **ci:** branches semantic-release invalidi (ERELEASEBRANCHES) ([b5a055d](https://github.com/giannoccarol/pi-desktop/commit/b5a055dfaada126e03e9dd309ecb6fc9e918eaf6))
* **renderer:** time.now/minutes mostrano chiavi invece di traduzioni ([1e76c36](https://github.com/giannoccarol/pi-desktop/commit/1e76c3628e73dd5ad0b9c59d1700469f1bd73edb)), closes [#0f1115](https://github.com/giannoccarol/pi-desktop/issues/0f1115)


### Features

* **icons:** add new icon sizes for application assets ([fb28ad7](https://github.com/giannoccarol/pi-desktop/commit/fb28ad7a47c3c2e33b006357e763cd2f6ce20f71))

# [1.6.0](https://github.com/giannoccarol/pi-desktop/compare/v1.5.0...v1.6.0) (2026-08-25)


### Bug Fixes

* **renderer:** include session.js in index.html, risolve schermo bianco ([fa4701f](https://github.com/giannoccarol/pi-desktop/commit/fa4701f95d5ad2ab963d9e7d844aafe5575634b5))


### Features

* usa pi-logo-on-light/dark in taskbar, header e hero con supporto tema ([890dd99](https://github.com/giannoccarol/pi-desktop/commit/890dd99fcd9be3c02a657ab8ad0a825848f6b21c)), closes [#09090b](https://github.com/giannoccarol/pi-desktop/issues/09090b)

# [1.5.0](https://github.com/giannoccarol/pi-desktop/compare/v1.4.1...v1.5.0) (2026-08-25)


### Features

* settings check for app OTA (come gittree about) ([c81beb1](https://github.com/giannoccarol/pi-desktop/commit/c81beb1b3841fdf15f9107d62f5804eddc034ac3)), closes [#btn-app-update](https://github.com/giannoccarol/pi-desktop/issues/btn-app-update)

## [1.4.1](https://github.com/giannoccarol/pi-desktop/compare/v1.4.0...v1.4.1) (2026-08-25)

# [1.4.0](https://github.com/giannoccarol/pi-desktop/compare/v1.3.0...v1.4.0) (2026-08-25)


### Features

* add pacman target for Arch (come gittree) ([2a0909d](https://github.com/giannoccarol/pi-desktop/commit/2a0909d3fe34ce137ef917cb0a6402c1b44d97f7))

# [1.3.0](https://github.com/giannoccarol/pi-desktop/compare/v1.2.1...v1.3.0) (2026-08-25)


### Features

* add app OTA UI in header (come gittree #btn-update) ([1db484b](https://github.com/giannoccarol/pi-desktop/commit/1db484b5de3857778dccb42a9bcd9c5d16457e2c)), closes [#btn-update](https://github.com/giannoccarol/pi-desktop/issues/btn-update) [#btn-app-update](https://github.com/giannoccarol/pi-desktop/issues/btn-app-update)

## [1.2.1](https://github.com/giannoccarol/pi-desktop/compare/v1.2.0...v1.2.1) (2026-08-25)


### Bug Fixes

* relax eslint no-undef for renderer to unblock OTA release ([e7a1278](https://github.com/giannoccarol/pi-desktop/commit/e7a12784f69e8c1976c14678c0f5350fe0129251))

# [1.2.0](https://github.com/giannoccarol/pi-desktop/compare/v1.1.0...v1.2.0) (2026-08-25)


### Bug Fixes

* add missing renderer globals to eslint config for OTA CI ([dd0828b](https://github.com/giannoccarol/pi-desktop/commit/dd0828b837e1d01e714ab287784c5b32fe4e8162))


### Features

* add scroll-to-bottom button visibility logic ([ae4466c](https://github.com/giannoccarol/pi-desktop/commit/ae4466c7af0e68252010fa8e0728cdde4ba9e36a))

# [1.1.0](https://github.com/giannoccarol/pi-desktop/compare/v1.0.0...v1.1.0) (2026-08-25)


### Features

* enhance runtime tab management and improve delta handling ([8b5e67a](https://github.com/giannoccarol/pi-desktop/commit/8b5e67a4d4992106f6e47ff93c4abab56734aff9))

# 1.0.0 (2026-08-25)


### Features

* add OTA auto-update via electron-updater and GitHub Releases ([6a42e09](https://github.com/giannoccarol/pi-desktop/commit/6a42e0971b556e79499f78246abf7bc5fb213d53))

# Changelog - Pi Desktop
