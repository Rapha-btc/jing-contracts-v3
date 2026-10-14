# v6-3 error-exit matrix

Market SHA-256: `65a8dc9aed179a3cc440306e31aff7da5bcecb99872423ca50b8ba417abbb6c0`.

Inventory: **295 explicit error-exit sites**, with a conservative negative witness for **133**. **162 have no attributed negative witness**.

These counts describe witness attribution, **not failing tests**.

These are error exits (`asserts!`, `unwrap!`, `try!`), not all control-flow branches. Missing witnesses do not prove a path is reachable or untested. No site is excluded from the denominator.

A witness is either Clarinet LCOV execution of an assertion’s error operand or an SDK trace showing that the immediate operand call returned an error in a test that checked the public/private result. Native operations, `unwrap!`, and folds are not guessed from the final error code. Private helper witnesses do not establish public reachability.

The real core runs in this suite. Artificial selective logger failures are excluded. Stxer links identify related scenarios only: they are **not per-arm coverage evidence**. Source-matched Stxer trace attribution remains separate.

Regenerate after a passing full suite with `node tests/unit/v6-3/path-matrix.mjs`. Full test attribution and rollback details are in `.build/path-matrix.json`.

| Source line | Function | Exit | Negative witness | Related Stxer scenario |
| ---: | --- | --- | --- | --- |
| [140](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L140) | sync-seat | `asserts!` | [T134](#t134) | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [142](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L142) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [146](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L146) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [930](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L930) | park-token-y | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [958](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L958) | park-token-x | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [1027](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1027) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1031](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1031) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1039](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1039) | lazer-feeds | `try!` | [T15](#t15) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1044](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1044) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1053](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1053) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1064](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1064) | lazer-feeds | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1065](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1065) | lazer-feeds | `try!` | [T13](#t13) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1076](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1076) | fresh-classification-price-aged | `try!` | [T12](#t12) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1111](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1111) | fresh-classification-from-feeds | `asserts!` | [T127](#t127) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1112](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1112) | fresh-classification-from-feeds | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1113](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1113) | fresh-classification-from-feeds | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1114](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1114) | fresh-classification-from-feeds | `asserts!` | [T131](#t131) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1125](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1125) | fresh-classification-price | `try!` | [T12](#t12) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1250](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1250) | deposit-token-y-core | `asserts!` | [T227](#t227) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1253](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1253) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1261](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1261) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1264](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1264) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1279](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1279) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1288](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1288) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1294](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1294) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1305](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1305) | deposit-token-y-core | `try!` | [T24](#t24) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1329](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1329) | deposit-token-y | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1330](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1330) | deposit-token-y | `asserts!` | [T212](#t212) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1331](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1331) | deposit-token-y | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1332](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1332) | deposit-token-y | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1333](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1333) | deposit-token-y | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1334](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1334) | deposit-token-y | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1342](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1342) | deposit-token-y | `try!` | [T11](#t11) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1346](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1346) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1353](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1353) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1368](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1368) | settle-token-y-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1369](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1369) | settle-token-y-deposit | `try!` | [T15](#t15) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1382](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1382) | settle-token-y-deposit | `asserts!` | [T218](#t218) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1383](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1383) | settle-token-y-deposit | `asserts!` | [T218](#t218) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1384](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1384) | settle-token-y-deposit | `asserts!` | [T218](#t218) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1391](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1391) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1392](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1392) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1414](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1414) | settle-token-y-deposit | `asserts!` | [T219](#t219) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1415](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1415) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1416](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1416) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1427](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1427) | settle-token-y-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1428](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1428) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1429](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1429) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1493](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1493) | deposit-token-x-core | `asserts!` | [T172](#t172) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1496](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1496) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1504](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1504) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1507](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1507) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1522](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1522) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1531](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1531) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1537](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1537) | deposit-token-x-core | `try!` | [T18](#t18) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1548](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1548) | deposit-token-x-core | `try!` | [T25](#t25) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1572](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1572) | deposit-token-x | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1573](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1573) | deposit-token-x | `asserts!` | [T157](#t157) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1574](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1574) | deposit-token-x | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1575](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1575) | deposit-token-x | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1576](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1576) | deposit-token-x | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1577](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1577) | deposit-token-x | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1585](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1585) | deposit-token-x | `try!` | [T18](#t18) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1589](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1589) | deposit-token-x | `try!` | [T19](#t19) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1596](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1596) | deposit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1611](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1611) | settle-token-x-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1612](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1612) | settle-token-x-deposit | `try!` | [T15](#t15) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1625](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1625) | settle-token-x-deposit | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1626](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1626) | settle-token-x-deposit | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1627](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1627) | settle-token-x-deposit | `asserts!` | [T163](#t163) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1634](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1634) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1635](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1635) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1657](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1657) | settle-token-x-deposit | `asserts!` | [T164](#t164) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1658](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1658) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1659](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1659) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1670](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1670) | settle-token-x-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1671](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1671) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1672](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1672) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1697](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1697) | cancel-token-y-deposit | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1698](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1698) | cancel-token-y-deposit | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1704](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1704) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1705](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1705) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1720](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1720) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1721](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1721) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1733](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1733) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1734](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1734) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1771](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1771) | cancel-token-x-deposit | `asserts!` | [T152](#t152) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1772](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1772) | cancel-token-x-deposit | `asserts!` | [T162](#t162) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1778](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1778) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1779](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1779) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1794](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1794) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1795](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1795) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1807](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1807) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1808](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1808) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1853](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1853) | withdraw-token-y | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1854](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1854) | withdraw-token-y | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1855](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1855) | withdraw-token-y | `asserts!` | [T210](#t210) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1856](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1856) | withdraw-token-y | `asserts!` | [T210](#t210) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1857](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1857) | withdraw-token-y | `asserts!` | [T210](#t210) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1858](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1858) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1859](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1859) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1875](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1875) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1903](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1903) | withdraw-token-x | `asserts!` | [T152](#t152) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1904](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1904) | withdraw-token-x | `asserts!` | [T162](#t162) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1905](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1905) | withdraw-token-x | `asserts!` | [T155](#t155) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1906](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1906) | withdraw-token-x | `asserts!` | [T155](#t155) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1907](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1907) | withdraw-token-x | `asserts!` | [T155](#t155) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1908](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1908) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1909](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1909) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1925](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1925) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1935](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1935) | readmit-token-y | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1936](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1936) | readmit-token-y | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1937](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1937) | readmit-token-y | `asserts!` | [T230](#t230) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1939](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1939) | readmit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1950](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1950) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1951](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1951) | settle-token-y-readmit | `try!` | [T17](#t17) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1962](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1962) | settle-token-y-readmit | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1963](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1963) | settle-token-y-readmit | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1967](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1967) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1986](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1986) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1992](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1992) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2004](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2004) | readmit-token-x | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2005](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2005) | readmit-token-x | `asserts!` | [T162](#t162) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2006](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2006) | readmit-token-x | `asserts!` | [T175](#t175) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2008](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2008) | readmit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2019](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2019) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2020](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2020) | settle-token-x-readmit | `try!` | [T17](#t17) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2031](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2031) | settle-token-x-readmit | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2032](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2032) | settle-token-x-readmit | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2036](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2036) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2055](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2055) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2061](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2061) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2074](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2074) | set-token-y-limit | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2075](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2075) | set-token-y-limit | `asserts!` | [T216](#t216) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2076](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2076) | set-token-y-limit | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2090](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2090) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2101](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2101) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2114](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2114) | settle-token-y-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2115](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2115) | settle-token-y-limit | `try!` | [T16](#t16) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2125](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2125) | settle-token-y-limit | `asserts!` | [T242](#t242) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2138](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2138) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2156](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2156) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2169](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2169) | set-token-x-limit | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2170](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2170) | set-token-x-limit | `asserts!` | [T161](#t161) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2171](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2171) | set-token-x-limit | `asserts!` | [T162](#t162) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2185](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2185) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2196](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2196) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2209](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2209) | settle-token-x-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2210](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2210) | settle-token-x-limit | `try!` | [T16](#t16) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2220](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2220) | settle-token-x-limit | `asserts!` | [T187](#t187) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2233](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2233) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2251](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2251) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2272](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2272) | reprice-or-swap-token-y | `asserts!` | [T247](#t247) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2273](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2273) | reprice-or-swap-token-y | `asserts!` | [T247](#t247) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2274](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2274) | reprice-or-swap-token-y | `asserts!` | [T247](#t247) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2275](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2275) | reprice-or-swap-token-y | `asserts!` | [T247](#t247) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2276](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2276) | reprice-or-swap-token-y | `asserts!` | [T247](#t247) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2279](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2279) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2284](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2284) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2292](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2292) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2297](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2297) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2303](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2303) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2305](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2305) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2319](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2319) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2329](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2329) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2358](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2358) | reprice-or-swap-token-x | `asserts!` | [T192](#t192) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2359](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2359) | reprice-or-swap-token-x | `asserts!` | [T192](#t192) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2360](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2360) | reprice-or-swap-token-x | `asserts!` | [T192](#t192) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2361](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2361) | reprice-or-swap-token-x | `asserts!` | [T192](#t192) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2362](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2362) | reprice-or-swap-token-x | `asserts!` | [T192](#t192) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2365](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2365) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2370](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2370) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2378](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2378) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2383](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2383) | reprice-or-swap-token-x | `try!` | [T20](#t20) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2391](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2391) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2393](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2393) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2407](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2407) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2417](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2417) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2471](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2471) | filter-small-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2519](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2519) | filter-small-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2564](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2564) | filter-limit-violating-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2608](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2608) | filter-limit-violating-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2625](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2625) | settle-with-refresh | `asserts!` | [T103](#t103) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2626](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2626) | settle-with-refresh | `asserts!` | [T103](#t103) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2627](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2627) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2661](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2661) | settle-with-verified-feeds | `try!` | [T313](#t313) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2672](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2672) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2678](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2678) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2684](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2684) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2705](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2705) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2706](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2706) | swap | `try!` | [T10](#t10) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2726](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2726) | swap | `asserts!` | [T198](#t198) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2727](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2727) | swap | `asserts!` | [T198](#t198) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2728](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2728) | swap | `asserts!` | [T198](#t198) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2738](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2738) | swap | `asserts!` | [T185](#t185) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2748](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2748) | swap | `asserts!` | [T198](#t198) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2756](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2756) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2765](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2765) | swap | `try!` | [T21](#t21) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2771](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2771) | swap | `try!` | [T25](#t25) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2776](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2776) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2779](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2779) | swap | `try!` | [T24](#t24) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2787](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2787) | swap | `asserts!` | [T310](#t310) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2788](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2788) | swap | `asserts!` | [T309](#t309) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2789](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2789) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2794](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2794) | swap | `try!` | [T22](#t22) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2799](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2799) | swap | `try!` | [T23](#t23) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2878](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2878) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2879](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2879) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2881](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2881) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2884](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2884) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2885](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2885) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2889](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2889) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2941](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2941) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2942](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2942) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2944](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2944) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2952](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2952) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2953](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2953) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2955](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2955) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2967](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2967) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3015](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3015) | walk-x-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3056](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3056) | walk-y-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3301](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3301) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3320](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3320) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3321](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3321) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3325](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3325) | cross-remainder-as-y | `asserts!` | [T253](#t253) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3329](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3329) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3330](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3330) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3344](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3344) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3371](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3371) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3390](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3390) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3391](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3391) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3395](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3395) | cross-remainder-as-x | `asserts!` | [T198](#t198) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3399](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3399) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3400](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3400) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3414](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3414) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3459](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3459) | execute-settlement | `asserts!` | [T103](#t103) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3460](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3460) | execute-settlement | `asserts!` | [T108](#t108) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3467](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3467) | execute-settlement | `asserts!` | [T117](#t117) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3468](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3468) | execute-settlement | `asserts!` | [T118](#t118) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3469](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3469) | execute-settlement | `asserts!` | [T120](#t120) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3470](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3470) | execute-settlement | `asserts!` | [T103](#t103) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3471](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3471) | execute-settlement | `asserts!` | [T103](#t103) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3472](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3472) | execute-settlement | `asserts!` | [T137](#t137) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3475](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3475) | execute-settlement | `asserts!` | [T119](#t119) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3478](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3478) | execute-settlement | `asserts!` | [T121](#t121) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3480](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3480) | execute-settlement | `asserts!` | [T137](#t137) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3495](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3495) | execute-settlement | `asserts!` | [T188](#t188) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3525](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3525) | execute-settlement | `asserts!` | [T136](#t136) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3544](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3544) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3545](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3545) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3550](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3550) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3551](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3551) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3569](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3569) | execute-settlement | `try!` | [T313](#t313) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3588](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3588) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3631](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3631) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3633](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3633) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3656](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3656) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3657](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3657) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3659](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3659) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3667](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3667) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3683](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3683) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3726](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3726) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3727](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3727) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3748](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3748) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3750](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3750) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3754](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3754) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3762](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3762) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3796](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3796) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3797](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3797) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3802](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3802) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3803](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3803) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3809](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3809) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3827](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3827) | initialize | `asserts!` | [T111](#t111) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3828](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3828) | initialize | `asserts!` | [T111](#t111) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3831](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3831) | initialize | `asserts!` | [T111](#t111) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3832](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3832) | initialize | `asserts!` | [T111](#t111) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3840](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3840) | initialize | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3846](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3846) | set-treasury | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3847](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3847) | set-treasury | `asserts!` | [T110](#t110) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3853](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3853) | set-paused | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3859](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3859) | set-operator | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3865](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3865) | set-min-token-y-deposit | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3866](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3866) | set-min-token-y-deposit | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3872](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3872) | set-min-token-x-deposit | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3873](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3873) | set-min-token-x-deposit | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3879](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3879) | set-distance-slots | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3880](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3880) | set-distance-slots | `asserts!` | [T109](#t109) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3995](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3995) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3996](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3996) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3998](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3998) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3999](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3999) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4000](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4000) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4001](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4001) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4183](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4183) | prune-one | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [4184](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4184) | prune-one | `asserts!` | [T108](#t108) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |

## Witness test catalog

<a id="t134"></a>**T134**: tests/unit/v6-3/market.test.ts__protected seats__syncs both memberships idempotently, prunes revoked seats, caps reservation at 50

<a id="t15"></a>**T15**: oracle propagation and unfunded STX input > oracle error preserves pending deposit on both sides

<a id="t16"></a>**T16**: oracle propagation and unfunded STX input > oracle error preserves pending limit on both sides

<a id="t17"></a>**T17**: oracle propagation and unfunded STX input > oracle error preserves pending readmit on both sides

<a id="t13"></a>**T13**: oracle propagation and unfunded STX input > independent y-feed shape error mode 14 is returned without state changes

<a id="t14"></a>**T14**: oracle propagation and unfunded STX input > independent y-feed shape error mode 15 is returned without state changes

<a id="t12"></a>**T12**: oracle propagation and unfunded STX input > independent y-feed shape error mode 13 is returned without state changes

<a id="t127"></a>**T127**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=80/0 code=1003

<a id="t30"></a>**T30**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 80 quotes 70 bps but swap rejects stale data

<a id="t29"></a>**T29**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 100 quotes 70 bps but swap rejects stale data

<a id="t308"></a>**T308**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a stale classification feed before any transfer

<a id="t125"></a>**T125**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=0/80 code=1003

<a id="t128"></a>**T128**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=1 ages=0/0 code=1006

<a id="t135"></a>**T135**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t131"></a>**T131**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=45 ages=0/0 code=1006

<a id="t227"></a>**T227**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t228"></a>**T228**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t240"></a>**T240**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t144"></a>**T144**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public y slots before escrowing the 41st maker

<a id="t24"></a>**T24**: registered contract depositor with real core accounting > x: core pause rejects a walk without changing either market or equity

<a id="t315"></a>**T315**: y real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t216"></a>**T216**: tests/unit/v6-3/market.test.ts__y maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t90"></a>**T90**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__y: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t212"></a>**T212**: tests/unit/v6-3/market.test.ts__y maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t11"></a>**T11**: oracle propagation and unfunded STX input > an unfunded direct STX input cannot change the market

<a id="t218"></a>**T218**: tests/unit/v6-3/market.test.ts__y maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t219"></a>**T219**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t205"></a>**T205**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t172"></a>**T172**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t173"></a>**T173**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t185"></a>**T185**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t143"></a>**T143**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public x slots before escrowing the 41st maker

<a id="t18"></a>**T18**: real core registration and equity > an unfunded direct token input returns the real FT balance error

<a id="t25"></a>**T25**: registered contract depositor with real core accounting > y: core pause rejects a walk without changing either market or equity

<a id="t312"></a>**T312**: x real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t161"></a>**T161**: tests/unit/v6-3/market.test.ts__x maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t89"></a>**T89**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__x: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t157"></a>**T157**: tests/unit/v6-3/market.test.ts__x maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t19"></a>**T19**: real core registration and equity > an unfunded pending token input returns the real FT balance error

<a id="t163"></a>**T163**: tests/unit/v6-3/market.test.ts__x maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t164"></a>**T164**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t150"></a>**T150**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t207"></a>**T207**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t217"></a>**T217**: tests/unit/v6-3/market.test.ts__y maker lifecycle__starts empty and exposes consistent default reads

<a id="t152"></a>**T152**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t162"></a>**T162**: tests/unit/v6-3/market.test.ts__x maker lifecycle__starts empty and exposes consistent default reads

<a id="t210"></a>**T210**: tests/unit/v6-3/market.test.ts__y maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t155"></a>**T155**: tests/unit/v6-3/market.test.ts__x maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t230"></a>**T230**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t226"></a>**T226**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t175"></a>**T175**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t171"></a>**T171**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t242"></a>**T242**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t187"></a>**T187**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t247"></a>**T247**: tests/unit/v6-3/market.test.ts__y swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t192"></a>**T192**: tests/unit/v6-3/market.test.ts__x swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t20"></a>**T20**: real core registration and equity > an unfunded reprice token input returns the real FT balance error

<a id="t103"></a>**T103**: tests/unit/v6-3/market.test.ts__batch settlement and history__rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t313"></a>**T313**: x real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t314"></a>**T314**: x real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t316"></a>**T316**: y real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t317"></a>**T317**: y real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t26"></a>**T26**: settles distinct asset identities through the real core and clears deposited equity

<a id="t1"></a>**T1**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 0: exact rejection and recovery

<a id="t2"></a>**T2**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 1: exact rejection and recovery

<a id="t3"></a>**T3**: independent oracle boundaries with funded settlement and recovery > x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t4"></a>**T4**: independent oracle boundaries with funded settlement and recovery > x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t5"></a>**T5**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 0: exact rejection and recovery

<a id="t6"></a>**T6**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 1: exact rejection and recovery

<a id="t7"></a>**T7**: independent oracle boundaries with funded settlement and recovery > y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t8"></a>**T8**: independent oracle boundaries with funded settlement and recovery > y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t10"></a>**T10**: market owns the age-aware capacity quote > age 80 quotes 70 bps but swap rejects stale data

<a id="t9"></a>**T9**: market owns the age-aware capacity quote > age 100 quotes 70 bps but swap rejects stale data

<a id="t27"></a>**T27**: swap verifies its Lazer update once > rejects a stale classification feed before any transfer

<a id="t198"></a>**T198**: tests/unit/v6-3/market.test.ts__x swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t253"></a>**T253**: tests/unit/v6-3/market.test.ts__y swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t21"></a>**T21**: real core registration and equity > an unfunded swap token input returns the real FT balance error

<a id="t310"></a>**T310**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a wrong opposite-asset trait after deposit and rolls back: deposit y

<a id="t309"></a>**T309**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a wrong opposite-asset trait after deposit and rolls back: deposit x

<a id="t22"></a>**T22**: real-core accounting at the taker refund threshold > x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t23"></a>**T23**: real-core accounting at the taker refund threshold > y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t94"></a>**T94**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t91"></a>**T91**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t108"></a>**T108**: tests/unit/v6-3/market.test.ts__batch settlement and history__settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t193"></a>**T193**: tests/unit/v6-3/market.test.ts__x swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t248"></a>**T248**: tests/unit/v6-3/market.test.ts__y swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t117"></a>**T117**: tests/unit/v6-3/market.test.ts__isolated defensive helper cases__rejects an already-settled historical cycle through the settlement helper

<a id="t118"></a>**T118**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 1

<a id="t120"></a>**T120**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 45

<a id="t262"></a>**T262**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t263"></a>**T263**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t268"></a>**T268**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t269"></a>**T269**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t137"></a>**T137**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__rejects zero computed cross-price and confidence at the x threshold

<a id="t259"></a>**T259**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 0: exact rejection and recovery

<a id="t260"></a>**T260**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 1: exact rejection and recovery

<a id="t119"></a>**T119**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 3

<a id="t265"></a>**T265**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 0: exact rejection and recovery

<a id="t266"></a>**T266**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 1: exact rejection and recovery

<a id="t121"></a>**T121**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 5

<a id="t188"></a>**T188**: tests/unit/v6-3/market.test.ts__x remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t243"></a>**T243**: tests/unit/v6-3/market.test.ts__y remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t136"></a>**T136**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__does not settle a book with no eligible liquidity after limit filtering

<a id="t111"></a>**T111**: tests/unit/v6-3/market.test.ts__initialization and administration__requires both operator and core owner; rejects zero minima and reinitialization

<a id="t109"></a>**T109**: tests/unit/v6-3/market.test.ts__initialization and administration__authorizes setters and enforces their boundaries

<a id="t110"></a>**T110**: tests/unit/v6-3/market.test.ts__initialization and administration__rejects the market as treasury without changing the configured recipient or funded book
