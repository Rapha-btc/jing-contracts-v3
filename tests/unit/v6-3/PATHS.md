# v6-3 error-exit matrix

Market SHA-256: `7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74`.

Inventory: **296 explicit error-exit sites**, with a conservative negative witness for **134**. **162 have no attributed negative witness**.

These counts describe witness attribution, **not failing tests**.

These are error exits (`asserts!`, `unwrap!`, `try!`), not all control-flow branches. Missing witnesses do not prove a path is reachable or untested. No site is excluded from the denominator.

A witness is either Clarinet LCOV execution of an assertion’s error operand or an SDK trace showing that the immediate operand call returned an error in a test that checked the public/private result. Native operations, `unwrap!`, and folds are not guessed from the final error code. Private helper witnesses do not establish public reachability.

The real core runs in this suite. Artificial selective logger failures are excluded. Stxer links identify related scenarios only: they are **not per-arm coverage evidence**. Source-matched Stxer trace attribution remains separate.

Regenerate after a passing full suite with `node tests/unit/v6-3/path-matrix.mjs`. Full test attribution and rollback details are in `.build/path-matrix.json`.

| Source line | Function | Exit | Negative witness | Related Stxer scenario |
| ---: | --- | --- | --- | --- |
| [140](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L140) | sync-seat | `asserts!` | [T99](#t99) | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [142](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L142) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [146](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L146) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [930](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L930) | park-token-y | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [958](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L958) | park-token-x | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [1027](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1027) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1031](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1031) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1039](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1039) | lazer-feeds | `try!` | [T22](#t22) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1044](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1044) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1053](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1053) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1064](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1064) | lazer-feeds | `try!` | [T18](#t18) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1065](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1065) | lazer-feeds | `try!` | [T25](#t25) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1071](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1071) | fresh-classification-price-aged | `try!` | [T18](#t18) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1082](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1082) | fresh-classification-price-aged | `asserts!` | [T92](#t92) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1083](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1083) | fresh-classification-price-aged | `asserts!` | [T90](#t90) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1084](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1084) | fresh-classification-price-aged | `asserts!` | [T93](#t93) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1085](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1085) | fresh-classification-price-aged | `asserts!` | [T96](#t96) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1099](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1099) | fresh-classification-price | `try!` | [T16](#t16) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1224](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1224) | deposit-token-y-core | `asserts!` | [T192](#t192) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1227](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1227) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1235](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1235) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1238](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1238) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1253](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1253) | deposit-token-y-core | `try!` | [T246](#t246) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1262](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1262) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1268](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1268) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1279](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1279) | deposit-token-y-core | `try!` | [T245](#t245) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1303](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1303) | deposit-token-y | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1304](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1304) | deposit-token-y | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1305](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1305) | deposit-token-y | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1306](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1306) | deposit-token-y | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1307](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1307) | deposit-token-y | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1308](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1308) | deposit-token-y | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1316](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1316) | deposit-token-y | `try!` | [T245](#t245) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1320](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1320) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1327](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1327) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1342](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1342) | settle-token-y-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1343](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1343) | settle-token-y-deposit | `try!` | [T27](#t27) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1356](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1356) | settle-token-y-deposit | `asserts!` | [T183](#t183) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1357](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1357) | settle-token-y-deposit | `asserts!` | [T183](#t183) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1358](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1358) | settle-token-y-deposit | `asserts!` | [T183](#t183) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1365](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1365) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1366](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1366) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1368](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1368) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1388](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1388) | settle-token-y-deposit | `asserts!` | [T184](#t184) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1389](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1389) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1390](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1390) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1392](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1392) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1401](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1401) | settle-token-y-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1402](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1402) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1403](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1403) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1405](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1405) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1467](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1467) | deposit-token-x-core | `asserts!` | [T137](#t137) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1470](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1470) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1478](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1478) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1481](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1481) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1496](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1496) | deposit-token-x-core | `try!` | [T237](#t237) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1505](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1505) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1511](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1511) | deposit-token-x-core | `try!` | [T30](#t30) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1522](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1522) | deposit-token-x-core | `try!` | [T236](#t236) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1546](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1546) | deposit-token-x | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1547](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1547) | deposit-token-x | `asserts!` | [T122](#t122) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1548](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1548) | deposit-token-x | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1549](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1549) | deposit-token-x | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1550](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1550) | deposit-token-x | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1551](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1551) | deposit-token-x | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1559](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1559) | deposit-token-x | `try!` | [T236](#t236) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1563](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1563) | deposit-token-x | `try!` | [T31](#t31) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1570](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1570) | deposit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1585](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1585) | settle-token-x-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1586](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1586) | settle-token-x-deposit | `try!` | [T27](#t27) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1599](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1599) | settle-token-x-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1600](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1600) | settle-token-x-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1601](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1601) | settle-token-x-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1608](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1608) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1609](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1609) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1611](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1611) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1631](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1631) | settle-token-x-deposit | `asserts!` | [T129](#t129) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1632](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1632) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1633](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1633) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1635](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1635) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1644](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1644) | settle-token-x-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1645](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1645) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1646](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1646) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1648](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1648) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1671](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1671) | cancel-token-y-deposit | `asserts!` | [T172](#t172) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1672](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1672) | cancel-token-y-deposit | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1678](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1678) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1679](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1679) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1682](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1682) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1694](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1694) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1695](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1695) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1698](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1698) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1707](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1707) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1708](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1708) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1721](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1721) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1745](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1745) | cancel-token-x-deposit | `asserts!` | [T117](#t117) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1746](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1746) | cancel-token-x-deposit | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1752](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1752) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1753](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1753) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1756](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1756) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1768](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1768) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1769](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1769) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1772](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1772) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1781](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1781) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1782](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1782) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1795](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1795) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1827](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1827) | withdraw-token-y | `asserts!` | [T172](#t172) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1828](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1828) | withdraw-token-y | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1829](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1829) | withdraw-token-y | `asserts!` | [T175](#t175) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1830](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1830) | withdraw-token-y | `asserts!` | [T175](#t175) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1831](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1831) | withdraw-token-y | `asserts!` | [T175](#t175) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1832](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1832) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1833](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1833) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1849](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1849) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1877](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1877) | withdraw-token-x | `asserts!` | [T117](#t117) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1878](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1878) | withdraw-token-x | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1879](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1879) | withdraw-token-x | `asserts!` | [T120](#t120) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1880](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1880) | withdraw-token-x | `asserts!` | [T120](#t120) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1881](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1881) | withdraw-token-x | `asserts!` | [T120](#t120) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1882](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1882) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1883](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1883) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1899](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1899) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1909](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1909) | readmit-token-y | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1910](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1910) | readmit-token-y | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1911](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1911) | readmit-token-y | `asserts!` | [T195](#t195) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1913](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1913) | readmit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1924](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1924) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1925](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1925) | settle-token-y-readmit | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1936](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1936) | settle-token-y-readmit | `asserts!` | [T191](#t191) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1937](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1937) | settle-token-y-readmit | `asserts!` | [T191](#t191) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1941](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1941) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1960](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1960) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1966](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1966) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1978](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1978) | readmit-token-x | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1979](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1979) | readmit-token-x | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1980](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1980) | readmit-token-x | `asserts!` | [T140](#t140) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1982](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1982) | readmit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1993](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1993) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1994](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1994) | settle-token-x-readmit | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2005](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2005) | settle-token-x-readmit | `asserts!` | [T136](#t136) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2006](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2006) | settle-token-x-readmit | `asserts!` | [T136](#t136) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2010](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2010) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2029](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2029) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2035](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2035) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2048](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2048) | set-token-y-limit | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2049](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2049) | set-token-y-limit | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2050](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2050) | set-token-y-limit | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2064](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2064) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2075](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2075) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2088](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2088) | settle-token-y-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2089](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2089) | settle-token-y-limit | `try!` | [T28](#t28) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2099](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2099) | settle-token-y-limit | `asserts!` | [T207](#t207) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2112](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2112) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2130](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2130) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2143](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2143) | set-token-x-limit | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2144](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2144) | set-token-x-limit | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2145](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2145) | set-token-x-limit | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2159](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2159) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2170](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2170) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2183](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2183) | settle-token-x-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2184](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2184) | settle-token-x-limit | `try!` | [T28](#t28) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2194](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2194) | settle-token-x-limit | `asserts!` | [T152](#t152) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2207](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2207) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2225](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2225) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2246](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2246) | reprice-or-swap-token-y | `asserts!` | [T212](#t212) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2247](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2247) | reprice-or-swap-token-y | `asserts!` | [T212](#t212) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2248](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2248) | reprice-or-swap-token-y | `asserts!` | [T212](#t212) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2249](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2249) | reprice-or-swap-token-y | `asserts!` | [T212](#t212) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2250](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2250) | reprice-or-swap-token-y | `asserts!` | [T212](#t212) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2253](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2253) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2258](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2258) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2266](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2266) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2271](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2271) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2277](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2277) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2279](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2279) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2293](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2293) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2303](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2303) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2332](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2332) | reprice-or-swap-token-x | `asserts!` | [T157](#t157) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2333](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2333) | reprice-or-swap-token-x | `asserts!` | [T157](#t157) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2334](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2334) | reprice-or-swap-token-x | `asserts!` | [T157](#t157) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2335](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2335) | reprice-or-swap-token-x | `asserts!` | [T157](#t157) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2336](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2336) | reprice-or-swap-token-x | `asserts!` | [T157](#t157) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2339](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2339) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2344](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2344) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2352](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2352) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2357](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2357) | reprice-or-swap-token-x | `try!` | [T32](#t32) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2365](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2365) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2367](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2367) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2381](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2381) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2391](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2391) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2445](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2445) | filter-small-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2493](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2493) | filter-small-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2538](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2538) | filter-limit-violating-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2582](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2582) | filter-limit-violating-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2599](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2599) | settle-with-refresh | `asserts!` | [T68](#t68) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2600](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2600) | settle-with-refresh | `asserts!` | [T68](#t68) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2602](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2602) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2607](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2607) | settle-with-refresh | `try!` | [T12](#t12) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2618](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2618) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2624](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2624) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2630](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2630) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2652](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2652) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2669](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2669) | swap | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2670](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2670) | swap | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2671](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2671) | swap | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2681](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2681) | swap | `asserts!` | [T150](#t150) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2691](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2691) | swap | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2699](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2699) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2708](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2708) | swap | `try!` | [T33](#t33) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2714](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2714) | swap | `try!` | [T238](#t238) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2719](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2719) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2722](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2722) | swap | `try!` | [T247](#t247) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2730](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2730) | swap | `try!` | [T242](#t242) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2733](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2733) | swap | `try!` | [T243](#t243) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2738](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2738) | swap | `try!` | [T252](#t252) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2817](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2817) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2818](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2818) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2820](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2820) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2823](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2823) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2824](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2824) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2828](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2828) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2880](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2880) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2881](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2881) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2883](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2883) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2891](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2891) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2892](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2892) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2894](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2894) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2906](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2906) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2954](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2954) | walk-x-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2995](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2995) | walk-y-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3240](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3240) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3259](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3259) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3260](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3260) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3264](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3264) | cross-remainder-as-y | `asserts!` | [T218](#t218) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3268](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3268) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3269](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3269) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3307](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3307) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3326](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3326) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3327](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3327) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3331](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3331) | cross-remainder-as-x | `asserts!` | [T163](#t163) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3335](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3335) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3336](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3336) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3392](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3392) | execute-settlement | `asserts!` | [T68](#t68) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3393](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3393) | execute-settlement | `asserts!` | [T73](#t73) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3400](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3400) | execute-settlement | `asserts!` | [T82](#t82) (private) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3401](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3401) | execute-settlement | `asserts!` | [T83](#t83) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3402](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3402) | execute-settlement | `asserts!` | [T85](#t85) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3403](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3403) | execute-settlement | `asserts!` | [T68](#t68) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3404](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3404) | execute-settlement | `asserts!` | [T68](#t68) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3405](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3405) | execute-settlement | `asserts!` | [T102](#t102) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3408](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3408) | execute-settlement | `asserts!` | [T84](#t84) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3411](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3411) | execute-settlement | `asserts!` | [T86](#t86) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3413](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3413) | execute-settlement | `asserts!` | [T102](#t102) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3428](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3428) | execute-settlement | `asserts!` | [T153](#t153) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3458](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3458) | execute-settlement | `asserts!` | [T101](#t101) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3477](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3477) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3478](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3478) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3483](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3483) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3484](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3484) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3502](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3502) | execute-settlement | `try!` | [T239](#t239) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3521](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3521) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3564](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3564) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3566](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3566) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3589](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3589) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3590](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3590) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3592](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3592) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3600](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3600) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3616](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3616) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3659](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3659) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3660](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3660) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3681](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3681) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3683](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3683) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3687](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3687) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3695](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3695) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3729](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3729) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3730](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3730) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3735](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3735) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3736](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3736) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3742](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3742) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3760](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3760) | initialize | `asserts!` | [T76](#t76) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3761](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3761) | initialize | `asserts!` | [T76](#t76) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3764](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3764) | initialize | `asserts!` | [T76](#t76) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3765](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3765) | initialize | `asserts!` | [T76](#t76) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3773](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3773) | initialize | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3779](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3779) | set-treasury | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3780](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3780) | set-treasury | `asserts!` | [T75](#t75) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3786](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3786) | set-paused | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3792](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3792) | set-operator | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3798](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3798) | set-min-token-y-deposit | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3799](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3799) | set-min-token-y-deposit | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3805](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3805) | set-min-token-x-deposit | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3806](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3806) | set-min-token-x-deposit | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3812](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3812) | set-distance-slots | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3813](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3813) | set-distance-slots | `asserts!` | [T74](#t74) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4101](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4101) | prune-one | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [4102](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4102) | prune-one | `asserts!` | [T73](#t73) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |

## Witness test catalog

<a id="t99"></a>**T99**: tests/unit/v6-3/market.test.ts__protected seats__syncs both memberships idempotently, prunes revoked seats, caps reservation at 50

<a id="t22"></a>**T22**: oracle and peg boundaries > refresh mode=7 ages=0/0 code=9001

<a id="t27"></a>**T27**: oracle propagation and unfunded STX input > oracle error preserves pending deposit on both sides

<a id="t28"></a>**T28**: oracle propagation and unfunded STX input > oracle error preserves pending limit on both sides

<a id="t29"></a>**T29**: oracle propagation and unfunded STX input > oracle error preserves pending readmit on both sides

<a id="t18"></a>**T18**: oracle and peg boundaries > refresh mode=2 ages=0/0 code=1004

<a id="t19"></a>**T19**: oracle and peg boundaries > refresh mode=4 ages=0/0 code=1025

<a id="t25"></a>**T25**: oracle propagation and unfunded STX input > independent y-feed shape error mode 14 is returned without state changes

<a id="t26"></a>**T26**: oracle propagation and unfunded STX input > independent y-feed shape error mode 15 is returned without state changes

<a id="t21"></a>**T21**: oracle and peg boundaries > refresh mode=6 ages=0/0 code=1023

<a id="t24"></a>**T24**: oracle propagation and unfunded STX input > independent y-feed shape error mode 13 is returned without state changes

<a id="t92"></a>**T92**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=80/0 code=1003

<a id="t90"></a>**T90**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=0/80 code=1003

<a id="t93"></a>**T93**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=1 ages=0/0 code=1006

<a id="t100"></a>**T100**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t96"></a>**T96**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=45 ages=0/0 code=1006

<a id="t16"></a>**T16**: oracle and peg boundaries > refresh mode=0 ages=80/0 code=1003

<a id="t15"></a>**T15**: oracle and peg boundaries > refresh mode=0 ages=0/80 code=1003

<a id="t17"></a>**T17**: oracle and peg boundaries > refresh mode=1 ages=0/0 code=1006

<a id="t20"></a>**T20**: oracle and peg boundaries > refresh mode=45 ages=0/0 code=1006

<a id="t34"></a>**T34**: rounding and additional oracle boundaries > accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t192"></a>**T192**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t193"></a>**T193**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t205"></a>**T205**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t109"></a>**T109**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public y slots before escrowing the 41st maker

<a id="t246"></a>**T246**: y queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t245"></a>**T245**: y maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t244"></a>**T244**: y final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t247"></a>**T247**: y real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t181"></a>**T181**: tests/unit/v6-3/market.test.ts__y maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t177"></a>**T177**: tests/unit/v6-3/market.test.ts__y maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t23"></a>**T23**: oracle propagation and unfunded STX input > an unfunded direct STX input cannot change the market

<a id="t183"></a>**T183**: tests/unit/v6-3/market.test.ts__y maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t184"></a>**T184**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t170"></a>**T170**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t137"></a>**T137**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t138"></a>**T138**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t150"></a>**T150**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t108"></a>**T108**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public x slots before escrowing the 41st maker

<a id="t237"></a>**T237**: x queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t30"></a>**T30**: real core registration and equity > an unfunded direct token input returns the real FT balance error

<a id="t236"></a>**T236**: x maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t235"></a>**T235**: x final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t238"></a>**T238**: x real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t126"></a>**T126**: tests/unit/v6-3/market.test.ts__x maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t122"></a>**T122**: tests/unit/v6-3/market.test.ts__x maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t31"></a>**T31**: real core registration and equity > an unfunded pending token input returns the real FT balance error

<a id="t128"></a>**T128**: tests/unit/v6-3/market.test.ts__x maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t129"></a>**T129**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t115"></a>**T115**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t172"></a>**T172**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t182"></a>**T182**: tests/unit/v6-3/market.test.ts__y maker lifecycle__starts empty and exposes consistent default reads

<a id="t117"></a>**T117**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t127"></a>**T127**: tests/unit/v6-3/market.test.ts__x maker lifecycle__starts empty and exposes consistent default reads

<a id="t175"></a>**T175**: tests/unit/v6-3/market.test.ts__y maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t120"></a>**T120**: tests/unit/v6-3/market.test.ts__x maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t195"></a>**T195**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t191"></a>**T191**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t140"></a>**T140**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t136"></a>**T136**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t207"></a>**T207**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t152"></a>**T152**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t212"></a>**T212**: tests/unit/v6-3/market.test.ts__y swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t157"></a>**T157**: tests/unit/v6-3/market.test.ts__x swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t32"></a>**T32**: real core registration and equity > an unfunded reprice token input returns the real FT balance error

<a id="t68"></a>**T68**: tests/unit/v6-3/market.test.ts__batch settlement and history__rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t12"></a>**T12**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 3

<a id="t14"></a>**T14**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 5

<a id="t11"></a>**T11**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 1

<a id="t13"></a>**T13**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 45

<a id="t2"></a>**T2**: batch settlement and history > settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t1"></a>**T1**: batch settlement and history > rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t242"></a>**T242**: x swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t251"></a>**T251**: y swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t241"></a>**T241**: x remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t250"></a>**T250**: y remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t35"></a>**T35**: rounding and additional oracle boundaries > does not settle a book with no eligible liquidity after limit filtering

<a id="t36"></a>**T36**: rounding and additional oracle boundaries > rejects zero computed cross-price and confidence at the x threshold

<a id="t239"></a>**T239**: x real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t240"></a>**T240**: x real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t248"></a>**T248**: y real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t249"></a>**T249**: y real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t37"></a>**T37**: settles distinct asset identities through the real core and clears deposited equity

<a id="t3"></a>**T3**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 0: exact rejection and recovery

<a id="t4"></a>**T4**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 1: exact rejection and recovery

<a id="t5"></a>**T5**: independent oracle boundaries with funded settlement and recovery > x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t6"></a>**T6**: independent oracle boundaries with funded settlement and recovery > x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t7"></a>**T7**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 0: exact rejection and recovery

<a id="t8"></a>**T8**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 1: exact rejection and recovery

<a id="t9"></a>**T9**: independent oracle boundaries with funded settlement and recovery > y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t10"></a>**T10**: independent oracle boundaries with funded settlement and recovery > y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t163"></a>**T163**: tests/unit/v6-3/market.test.ts__x swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t218"></a>**T218**: tests/unit/v6-3/market.test.ts__y swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t33"></a>**T33**: real core registration and equity > an unfunded swap token input returns the real FT balance error

<a id="t243"></a>**T243**: x swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t252"></a>**T252**: y swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t73"></a>**T73**: tests/unit/v6-3/market.test.ts__batch settlement and history__settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t158"></a>**T158**: tests/unit/v6-3/market.test.ts__x swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t213"></a>**T213**: tests/unit/v6-3/market.test.ts__y swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t82"></a>**T82**: tests/unit/v6-3/market.test.ts__isolated defensive helper cases__rejects an already-settled historical cycle through the settlement helper

<a id="t83"></a>**T83**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 1

<a id="t85"></a>**T85**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 45

<a id="t227"></a>**T227**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t228"></a>**T228**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t233"></a>**T233**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t234"></a>**T234**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t102"></a>**T102**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__rejects zero computed cross-price and confidence at the x threshold

<a id="t224"></a>**T224**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 0: exact rejection and recovery

<a id="t225"></a>**T225**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 1: exact rejection and recovery

<a id="t84"></a>**T84**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 3

<a id="t230"></a>**T230**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 0: exact rejection and recovery

<a id="t231"></a>**T231**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 1: exact rejection and recovery

<a id="t86"></a>**T86**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 5

<a id="t153"></a>**T153**: tests/unit/v6-3/market.test.ts__x remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t208"></a>**T208**: tests/unit/v6-3/market.test.ts__y remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t101"></a>**T101**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__does not settle a book with no eligible liquidity after limit filtering

<a id="t76"></a>**T76**: tests/unit/v6-3/market.test.ts__initialization and administration__requires both operator and core owner; rejects zero minima and reinitialization

<a id="t74"></a>**T74**: tests/unit/v6-3/market.test.ts__initialization and administration__authorizes setters and enforces their boundaries

<a id="t75"></a>**T75**: tests/unit/v6-3/market.test.ts__initialization and administration__rejects the market as treasury without changing the configured recipient or funded book
