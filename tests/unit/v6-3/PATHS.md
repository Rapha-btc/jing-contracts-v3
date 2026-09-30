# v6-3 error-exit matrix

Market SHA-256: `ed046155b017d6acad569c6769da050747f4c69db7f627e4767fe0cafea41848`.

Inventory: **292 explicit error-exit sites**, with a conservative negative witness for **135**. **157 have no attributed negative witness**.

These counts describe witness attribution, **not failing tests**.

These are error exits (`asserts!`, `unwrap!`, `try!`), not all control-flow branches. Missing witnesses do not prove a path is reachable or untested. No site is excluded from the denominator.

A witness is either Clarinet LCOV execution of an assertion’s error operand or an SDK trace showing that the immediate operand call returned an error in a test that checked the public/private result. Native operations, `unwrap!`, and folds are not guessed from the final error code. Private helper witnesses do not establish public reachability.

The real core runs in this suite. Artificial selective logger failures are excluded. Stxer links identify related scenarios only: they are **not per-arm coverage evidence**. Source-matched Stxer trace attribution remains separate.

Regenerate after a passing full suite with `node tests/unit/v6-3/path-matrix.mjs`. Full test attribution and rollback details are in `.build/path-matrix.json`.

| Source line | Function | Exit | Negative witness | Related Stxer scenario |
| ---: | --- | --- | --- | --- |
| [140](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L140) | sync-seat | `asserts!` | [T150](#t150) | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [142](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L142) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [146](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L146) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [930](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L930) | park-token-y | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [958](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L958) | park-token-x | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [1027](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1027) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1031](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1031) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1039](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1039) | lazer-feeds | `try!` | [T24](#t24) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1044](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1044) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1053](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1053) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1064](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1064) | lazer-feeds | `try!` | [T20](#t20) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1065](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1065) | lazer-feeds | `try!` | [T27](#t27) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1077](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1077) | fresh-classification-price-aged | `try!` | [T20](#t20) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1088](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1088) | fresh-classification-price-aged | `asserts!` | [T143](#t143) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1089](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1089) | fresh-classification-price-aged | `asserts!` | [T141](#t141) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1090](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1090) | fresh-classification-price-aged | `asserts!` | [T144](#t144) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1091](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1091) | fresh-classification-price-aged | `asserts!` | [T147](#t147) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1102](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1102) | fresh-classification-price | `try!` | [T18](#t18) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1227](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1227) | deposit-token-y-core | `asserts!` | [T243](#t243) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1230](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1230) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1238](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1238) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1241](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1241) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1256](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1256) | deposit-token-y-core | `try!` | [T331](#t331) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1265](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1265) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1271](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1271) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1282](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1282) | deposit-token-y-core | `try!` | [T330](#t330) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1306](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1306) | deposit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1307](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1307) | deposit-token-y | `asserts!` | [T228](#t228) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1308](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1308) | deposit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1309](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1309) | deposit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1310](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1310) | deposit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1311](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1311) | deposit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1319](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1319) | deposit-token-y | `try!` | [T330](#t330) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1323](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1323) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1330](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1330) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1345](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1345) | settle-token-y-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1346](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1346) | settle-token-y-deposit | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1359](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1359) | settle-token-y-deposit | `asserts!` | [T234](#t234) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1360](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1360) | settle-token-y-deposit | `asserts!` | [T234](#t234) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1361](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1361) | settle-token-y-deposit | `asserts!` | [T234](#t234) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1368](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1368) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1369](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1369) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1391](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1391) | settle-token-y-deposit | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1392](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1392) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1393](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1393) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1404](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1404) | settle-token-y-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1405](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1405) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1406](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1406) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1470](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1470) | deposit-token-x-core | `asserts!` | [T188](#t188) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1473](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1473) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1481](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1481) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1484](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1484) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1499](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1499) | deposit-token-x-core | `try!` | [T322](#t322) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1508](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1508) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1514](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1514) | deposit-token-x-core | `try!` | [T32](#t32) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1525](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1525) | deposit-token-x-core | `try!` | [T321](#t321) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1549](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1549) | deposit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1550](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1550) | deposit-token-x | `asserts!` | [T173](#t173) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1551](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1551) | deposit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1552](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1552) | deposit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1553](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1553) | deposit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1554](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1554) | deposit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1562](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1562) | deposit-token-x | `try!` | [T321](#t321) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1566](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1566) | deposit-token-x | `try!` | [T33](#t33) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1573](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1573) | deposit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1588](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1588) | settle-token-x-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1589](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1589) | settle-token-x-deposit | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1602](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1602) | settle-token-x-deposit | `asserts!` | [T179](#t179) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1603](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1603) | settle-token-x-deposit | `asserts!` | [T179](#t179) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1604](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1604) | settle-token-x-deposit | `asserts!` | [T179](#t179) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1611](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1611) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1612](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1612) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1634](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1634) | settle-token-x-deposit | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1635](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1635) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1636](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1636) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1647](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1647) | settle-token-x-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1648](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1648) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1649](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1649) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1674](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1674) | cancel-token-y-deposit | `asserts!` | [T223](#t223) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1675](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1675) | cancel-token-y-deposit | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1681](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1681) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1682](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1682) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1697](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1697) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1698](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1698) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1710](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1710) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1711](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1711) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1748](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1748) | cancel-token-x-deposit | `asserts!` | [T168](#t168) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1749](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1749) | cancel-token-x-deposit | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1755](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1755) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1756](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1756) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1771](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1771) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1772](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1772) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1784](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1784) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1785](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1785) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1830](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1830) | withdraw-token-y | `asserts!` | [T223](#t223) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1831](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1831) | withdraw-token-y | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1832](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1832) | withdraw-token-y | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1833](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1833) | withdraw-token-y | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1834](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1834) | withdraw-token-y | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1835](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1835) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1836](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1836) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1852](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1852) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1880](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1880) | withdraw-token-x | `asserts!` | [T168](#t168) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1881](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1881) | withdraw-token-x | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1882](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1882) | withdraw-token-x | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1883](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1883) | withdraw-token-x | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1884](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1884) | withdraw-token-x | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1885](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1885) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1886](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1886) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1902](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1902) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1912](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1912) | readmit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1913](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1913) | readmit-token-y | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1914](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1914) | readmit-token-y | `asserts!` | [T246](#t246) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1916](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1916) | readmit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1927](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1927) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1928](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1928) | settle-token-y-readmit | `try!` | [T31](#t31) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1939](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1939) | settle-token-y-readmit | `asserts!` | [T242](#t242) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1940](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1940) | settle-token-y-readmit | `asserts!` | [T242](#t242) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1944](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1944) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1963](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1963) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1969](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1969) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1981](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1981) | readmit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1982](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1982) | readmit-token-x | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1983](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1983) | readmit-token-x | `asserts!` | [T191](#t191) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1985](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1985) | readmit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1996](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1996) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1997](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1997) | settle-token-x-readmit | `try!` | [T31](#t31) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2008](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2008) | settle-token-x-readmit | `asserts!` | [T187](#t187) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2009](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2009) | settle-token-x-readmit | `asserts!` | [T187](#t187) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2013](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2013) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2032](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2032) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2038](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2038) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2051](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2051) | set-token-y-limit | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2052](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2052) | set-token-y-limit | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2053](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2053) | set-token-y-limit | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2067](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2067) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2078](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2078) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2091](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2091) | settle-token-y-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2092](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2092) | settle-token-y-limit | `try!` | [T30](#t30) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2102](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2102) | settle-token-y-limit | `asserts!` | [T258](#t258) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2115](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2115) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2133](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2133) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2146](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2146) | set-token-x-limit | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2147](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2147) | set-token-x-limit | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2148](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2148) | set-token-x-limit | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2162](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2162) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2173](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2173) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2186](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2186) | settle-token-x-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2187](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2187) | settle-token-x-limit | `try!` | [T30](#t30) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2197](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2197) | settle-token-x-limit | `asserts!` | [T203](#t203) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2210](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2210) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2228](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2228) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2249](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2249) | reprice-or-swap-token-y | `asserts!` | [T263](#t263) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2250](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2250) | reprice-or-swap-token-y | `asserts!` | [T263](#t263) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2251](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2251) | reprice-or-swap-token-y | `asserts!` | [T263](#t263) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2252](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2252) | reprice-or-swap-token-y | `asserts!` | [T263](#t263) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2253](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2253) | reprice-or-swap-token-y | `asserts!` | [T263](#t263) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2256](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2256) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2261](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2261) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2269](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2269) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2274](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2274) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2280](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2280) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2282](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2282) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2296](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2296) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2306](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2306) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2335](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2335) | reprice-or-swap-token-x | `asserts!` | [T208](#t208) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2336](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2336) | reprice-or-swap-token-x | `asserts!` | [T208](#t208) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2337](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2337) | reprice-or-swap-token-x | `asserts!` | [T208](#t208) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2338](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2338) | reprice-or-swap-token-x | `asserts!` | [T208](#t208) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2339](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2339) | reprice-or-swap-token-x | `asserts!` | [T208](#t208) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2342](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2342) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2347](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2347) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2355](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2355) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2360](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2360) | reprice-or-swap-token-x | `try!` | [T34](#t34) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2368](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2368) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2370](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2370) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2384](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2384) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2394](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2394) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2448](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2448) | filter-small-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2496](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2496) | filter-small-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2541](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2541) | filter-limit-violating-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2585](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2585) | filter-limit-violating-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2602](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2602) | settle-with-refresh | `asserts!` | [T119](#t119) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2603](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2603) | settle-with-refresh | `asserts!` | [T119](#t119) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2605](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2605) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2610](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2610) | settle-with-refresh | `try!` | [T14](#t14) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2621](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2621) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2627](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2627) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2633](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2633) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2655](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2655) | swap | `try!` | [T12](#t12) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2675](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2675) | swap | `asserts!` | [T214](#t214) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2676](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2676) | swap | `asserts!` | [T214](#t214) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2677](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2677) | swap | `asserts!` | [T214](#t214) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2687](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2687) | swap | `asserts!` | [T201](#t201) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2697](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2697) | swap | `asserts!` | [T214](#t214) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2705](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2705) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2714](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2714) | swap | `try!` | [T35](#t35) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2720](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2720) | swap | `try!` | [T39](#t39) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2725](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2725) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2728](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2728) | swap | `try!` | [T38](#t38) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2736](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2736) | swap | `try!` | [T327](#t327) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2739](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2739) | swap | `try!` | [T328](#t328) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2744](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2744) | swap | `try!` | [T337](#t337) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2823](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2823) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2824](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2824) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2826](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2826) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2829](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2829) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2830](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2830) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2834](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2834) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2886](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2886) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2887](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2887) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2889](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2889) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2897](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2897) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2898](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2898) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2900](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2900) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2912](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2912) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2960](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2960) | walk-x-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3001](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3001) | walk-y-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3246](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3246) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3265](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3265) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3266](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3266) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3270](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3270) | cross-remainder-as-y | `asserts!` | [T269](#t269) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3274](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3274) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3275](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3275) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3289](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3289) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3316](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3316) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3335](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3335) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3336](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3336) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3340](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3340) | cross-remainder-as-x | `asserts!` | [T214](#t214) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3344](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3344) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3345](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3345) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3359](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3359) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3404](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3404) | execute-settlement | `asserts!` | [T119](#t119) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3405](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3405) | execute-settlement | `asserts!` | [T124](#t124) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3412](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3412) | execute-settlement | `asserts!` | [T133](#t133) (private) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3413](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3413) | execute-settlement | `asserts!` | [T134](#t134) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3414](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3414) | execute-settlement | `asserts!` | [T136](#t136) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3415](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3415) | execute-settlement | `asserts!` | [T119](#t119) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3416](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3416) | execute-settlement | `asserts!` | [T119](#t119) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3417](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3417) | execute-settlement | `asserts!` | [T153](#t153) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3420](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3420) | execute-settlement | `asserts!` | [T135](#t135) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3423](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3423) | execute-settlement | `asserts!` | [T137](#t137) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3425](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3425) | execute-settlement | `asserts!` | [T153](#t153) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3440](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3440) | execute-settlement | `asserts!` | [T204](#t204) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3470](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3470) | execute-settlement | `asserts!` | [T152](#t152) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3489](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3489) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3490](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3490) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3495](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3495) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3496](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3496) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3514](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3514) | execute-settlement | `try!` | [T324](#t324) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3533](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3533) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3576](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3576) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3578](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3578) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3601](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3601) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3602](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3602) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3604](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3604) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3612](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3612) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3628](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3628) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3671](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3671) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3672](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3672) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3693](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3693) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3695](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3695) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3699](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3699) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3707](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3707) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3741](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3741) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3742](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3742) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3747](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3747) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3748](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3748) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3754](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3754) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3772](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3772) | initialize | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3773](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3773) | initialize | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3776](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3776) | initialize | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3777](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3777) | initialize | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3785](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3785) | initialize | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3791](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3791) | set-treasury | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3792](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3792) | set-treasury | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3798](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3798) | set-paused | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3804](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3804) | set-operator | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3810](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3810) | set-min-token-y-deposit | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3811](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3811) | set-min-token-y-deposit | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3817](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3817) | set-min-token-x-deposit | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3818](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3818) | set-min-token-x-deposit | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3824](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3824) | set-distance-slots | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3825](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3825) | set-distance-slots | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3940](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3940) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3941](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3941) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3943](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3943) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3944](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3944) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3945](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3945) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3946](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3946) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4128](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4128) | prune-one | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [4129](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4129) | prune-one | `asserts!` | [T124](#t124) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |

## Witness test catalog

<a id="t150"></a>**T150**: tests/unit/v6-3/market.test.ts__protected seats__syncs both memberships idempotently, prunes revoked seats, caps reservation at 50

<a id="t24"></a>**T24**: oracle and peg boundaries > refresh mode=7 ages=0/0 code=9001

<a id="t29"></a>**T29**: oracle propagation and unfunded STX input > oracle error preserves pending deposit on both sides

<a id="t30"></a>**T30**: oracle propagation and unfunded STX input > oracle error preserves pending limit on both sides

<a id="t31"></a>**T31**: oracle propagation and unfunded STX input > oracle error preserves pending readmit on both sides

<a id="t20"></a>**T20**: oracle and peg boundaries > refresh mode=2 ages=0/0 code=1004

<a id="t21"></a>**T21**: oracle and peg boundaries > refresh mode=4 ages=0/0 code=1025

<a id="t27"></a>**T27**: oracle propagation and unfunded STX input > independent y-feed shape error mode 14 is returned without state changes

<a id="t28"></a>**T28**: oracle propagation and unfunded STX input > independent y-feed shape error mode 15 is returned without state changes

<a id="t23"></a>**T23**: oracle and peg boundaries > refresh mode=6 ages=0/0 code=1023

<a id="t26"></a>**T26**: oracle propagation and unfunded STX input > independent y-feed shape error mode 13 is returned without state changes

<a id="t143"></a>**T143**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=80/0 code=1003

<a id="t46"></a>**T46**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 80 quotes 70 bps but swap rejects stale data

<a id="t45"></a>**T45**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 100 quotes 70 bps but swap rejects stale data

<a id="t141"></a>**T141**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=0/80 code=1003

<a id="t144"></a>**T144**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=1 ages=0/0 code=1006

<a id="t151"></a>**T151**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t147"></a>**T147**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=45 ages=0/0 code=1006

<a id="t18"></a>**T18**: oracle and peg boundaries > refresh mode=0 ages=80/0 code=1003

<a id="t17"></a>**T17**: oracle and peg boundaries > refresh mode=0 ages=0/80 code=1003

<a id="t19"></a>**T19**: oracle and peg boundaries > refresh mode=1 ages=0/0 code=1006

<a id="t22"></a>**T22**: oracle and peg boundaries > refresh mode=45 ages=0/0 code=1006

<a id="t40"></a>**T40**: rounding and additional oracle boundaries > accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t243"></a>**T243**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t244"></a>**T244**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t256"></a>**T256**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t160"></a>**T160**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public y slots before escrowing the 41st maker

<a id="t331"></a>**T331**: y queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t330"></a>**T330**: y maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t329"></a>**T329**: y final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t38"></a>**T38**: registered contract depositor with real core accounting > x: core pause rejects a walk without changing either market or equity

<a id="t332"></a>**T332**: y real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t232"></a>**T232**: tests/unit/v6-3/market.test.ts__y maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t106"></a>**T106**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__y: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t228"></a>**T228**: tests/unit/v6-3/market.test.ts__y maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t25"></a>**T25**: oracle propagation and unfunded STX input > an unfunded direct STX input cannot change the market

<a id="t234"></a>**T234**: tests/unit/v6-3/market.test.ts__y maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t235"></a>**T235**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t221"></a>**T221**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t188"></a>**T188**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t189"></a>**T189**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t201"></a>**T201**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t159"></a>**T159**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public x slots before escrowing the 41st maker

<a id="t322"></a>**T322**: x queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t32"></a>**T32**: real core registration and equity > an unfunded direct token input returns the real FT balance error

<a id="t321"></a>**T321**: x maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t320"></a>**T320**: x final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t39"></a>**T39**: registered contract depositor with real core accounting > y: core pause rejects a walk without changing either market or equity

<a id="t323"></a>**T323**: x real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t177"></a>**T177**: tests/unit/v6-3/market.test.ts__x maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t105"></a>**T105**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__x: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t173"></a>**T173**: tests/unit/v6-3/market.test.ts__x maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t33"></a>**T33**: real core registration and equity > an unfunded pending token input returns the real FT balance error

<a id="t179"></a>**T179**: tests/unit/v6-3/market.test.ts__x maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t180"></a>**T180**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t166"></a>**T166**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t223"></a>**T223**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t233"></a>**T233**: tests/unit/v6-3/market.test.ts__y maker lifecycle__starts empty and exposes consistent default reads

<a id="t168"></a>**T168**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t178"></a>**T178**: tests/unit/v6-3/market.test.ts__x maker lifecycle__starts empty and exposes consistent default reads

<a id="t226"></a>**T226**: tests/unit/v6-3/market.test.ts__y maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t171"></a>**T171**: tests/unit/v6-3/market.test.ts__x maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t246"></a>**T246**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t242"></a>**T242**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t191"></a>**T191**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t187"></a>**T187**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t258"></a>**T258**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t203"></a>**T203**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t263"></a>**T263**: tests/unit/v6-3/market.test.ts__y swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t208"></a>**T208**: tests/unit/v6-3/market.test.ts__x swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t34"></a>**T34**: real core registration and equity > an unfunded reprice token input returns the real FT balance error

<a id="t119"></a>**T119**: tests/unit/v6-3/market.test.ts__batch settlement and history__rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t14"></a>**T14**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 3

<a id="t16"></a>**T16**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 5

<a id="t13"></a>**T13**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 1

<a id="t15"></a>**T15**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 45

<a id="t2"></a>**T2**: batch settlement and history > settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t1"></a>**T1**: batch settlement and history > rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t327"></a>**T327**: x swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t336"></a>**T336**: y swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t326"></a>**T326**: x remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t335"></a>**T335**: y remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t41"></a>**T41**: rounding and additional oracle boundaries > does not settle a book with no eligible liquidity after limit filtering

<a id="t42"></a>**T42**: rounding and additional oracle boundaries > rejects zero computed cross-price and confidence at the x threshold

<a id="t324"></a>**T324**: x real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t325"></a>**T325**: x real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t333"></a>**T333**: y real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t334"></a>**T334**: y real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t43"></a>**T43**: settles distinct asset identities through the real core and clears deposited equity

<a id="t3"></a>**T3**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 0: exact rejection and recovery

<a id="t4"></a>**T4**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 1: exact rejection and recovery

<a id="t5"></a>**T5**: independent oracle boundaries with funded settlement and recovery > x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t6"></a>**T6**: independent oracle boundaries with funded settlement and recovery > x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t7"></a>**T7**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 0: exact rejection and recovery

<a id="t8"></a>**T8**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 1: exact rejection and recovery

<a id="t9"></a>**T9**: independent oracle boundaries with funded settlement and recovery > y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t10"></a>**T10**: independent oracle boundaries with funded settlement and recovery > y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t12"></a>**T12**: market owns the age-aware capacity quote > age 80 quotes 70 bps but swap rejects stale data

<a id="t11"></a>**T11**: market owns the age-aware capacity quote > age 100 quotes 70 bps but swap rejects stale data

<a id="t214"></a>**T214**: tests/unit/v6-3/market.test.ts__x swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t269"></a>**T269**: tests/unit/v6-3/market.test.ts__y swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t35"></a>**T35**: real core registration and equity > an unfunded swap token input returns the real FT balance error

<a id="t328"></a>**T328**: x swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t36"></a>**T36**: real-core accounting at the taker refund threshold > x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t337"></a>**T337**: y swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t37"></a>**T37**: real-core accounting at the taker refund threshold > y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t110"></a>**T110**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t107"></a>**T107**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t124"></a>**T124**: tests/unit/v6-3/market.test.ts__batch settlement and history__settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t209"></a>**T209**: tests/unit/v6-3/market.test.ts__x swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t264"></a>**T264**: tests/unit/v6-3/market.test.ts__y swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t133"></a>**T133**: tests/unit/v6-3/market.test.ts__isolated defensive helper cases__rejects an already-settled historical cycle through the settlement helper

<a id="t134"></a>**T134**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 1

<a id="t136"></a>**T136**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 45

<a id="t278"></a>**T278**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t279"></a>**T279**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t284"></a>**T284**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t285"></a>**T285**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t153"></a>**T153**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__rejects zero computed cross-price and confidence at the x threshold

<a id="t275"></a>**T275**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 0: exact rejection and recovery

<a id="t276"></a>**T276**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 1: exact rejection and recovery

<a id="t135"></a>**T135**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 3

<a id="t281"></a>**T281**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 0: exact rejection and recovery

<a id="t282"></a>**T282**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 1: exact rejection and recovery

<a id="t137"></a>**T137**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 5

<a id="t204"></a>**T204**: tests/unit/v6-3/market.test.ts__x remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t259"></a>**T259**: tests/unit/v6-3/market.test.ts__y remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t152"></a>**T152**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__does not settle a book with no eligible liquidity after limit filtering

<a id="t127"></a>**T127**: tests/unit/v6-3/market.test.ts__initialization and administration__requires both operator and core owner; rejects zero minima and reinitialization

<a id="t125"></a>**T125**: tests/unit/v6-3/market.test.ts__initialization and administration__authorizes setters and enforces their boundaries

<a id="t126"></a>**T126**: tests/unit/v6-3/market.test.ts__initialization and administration__rejects the market as treasury without changing the configured recipient or funded book
