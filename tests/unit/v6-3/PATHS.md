# v6-3 error-exit matrix

Market SHA-256: `943927cc5067d21d50c87e3f7464d379c3d704cb2ed8dcbfb5c88205a68c5a67`.

Inventory: **295 explicit error-exit sites**, with a conservative negative witness for **141**. **154 have no attributed negative witness**.

These counts describe witness attribution, **not failing tests**.

These are error exits (`asserts!`, `unwrap!`, `try!`), not all control-flow branches. Missing witnesses do not prove a path is reachable or untested. No site is excluded from the denominator.

A witness is either Clarinet LCOV execution of an assertion’s error operand or an SDK trace showing that the immediate operand call returned an error in a test that checked the public/private result. Native operations, `unwrap!`, and folds are not guessed from the final error code. Private helper witnesses do not establish public reachability.

The real core runs in this suite. Artificial selective logger failures are excluded. Stxer links identify related scenarios only: they are **not per-arm coverage evidence**. Source-matched Stxer trace attribution remains separate.

Regenerate after a passing full suite with `node tests/unit/v6-3/path-matrix.mjs`. Full test attribution and rollback details are in `.build/path-matrix.json`.

| Source line | Function | Exit | Negative witness | Related Stxer scenario |
| ---: | --- | --- | --- | --- |
| [140](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L140) | sync-seat | `asserts!` | [T153](#t153) | [full-side](../../../simulations/verify-v6-3-full-side.js) |
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
| [1076](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1076) | fresh-classification-price-aged | `try!` | [T20](#t20) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1111](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1111) | fresh-classification-from-feeds | `asserts!` | [T146](#t146) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1112](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1112) | fresh-classification-from-feeds | `asserts!` | [T144](#t144) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1113](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1113) | fresh-classification-from-feeds | `asserts!` | [T147](#t147) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1114](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1114) | fresh-classification-from-feeds | `asserts!` | [T150](#t150) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1125](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1125) | fresh-classification-price | `try!` | [T18](#t18) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1250](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1250) | deposit-token-y-core | `asserts!` | [T246](#t246) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1253](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1253) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1261](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1261) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1264](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1264) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1279](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1279) | deposit-token-y-core | `try!` | [T352](#t352) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1288](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1288) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1294](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1294) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1305](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1305) | deposit-token-y-core | `try!` | [T351](#t351) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1329](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1329) | deposit-token-y | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1330](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1330) | deposit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1331](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1331) | deposit-token-y | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1332](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1332) | deposit-token-y | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1333](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1333) | deposit-token-y | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1334](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1334) | deposit-token-y | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1342](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1342) | deposit-token-y | `try!` | [T351](#t351) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1346](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1346) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1353](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1353) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1368](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1368) | settle-token-y-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1369](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1369) | settle-token-y-deposit | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1382](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1382) | settle-token-y-deposit | `asserts!` | [T237](#t237) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1383](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1383) | settle-token-y-deposit | `asserts!` | [T237](#t237) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1384](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1384) | settle-token-y-deposit | `asserts!` | [T237](#t237) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1391](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1391) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1392](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1392) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1414](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1414) | settle-token-y-deposit | `asserts!` | [T238](#t238) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1415](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1415) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1416](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1416) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1427](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1427) | settle-token-y-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1428](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1428) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1429](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1429) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1493](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1493) | deposit-token-x-core | `asserts!` | [T191](#t191) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1496](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1496) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1504](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1504) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1507](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1507) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1522](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1522) | deposit-token-x-core | `try!` | [T343](#t343) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1531](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1531) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1537](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1537) | deposit-token-x-core | `try!` | [T32](#t32) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1548](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1548) | deposit-token-x-core | `try!` | [T342](#t342) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1572](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1572) | deposit-token-x | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1573](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1573) | deposit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1574](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1574) | deposit-token-x | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1575](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1575) | deposit-token-x | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1576](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1576) | deposit-token-x | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1577](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1577) | deposit-token-x | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1585](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1585) | deposit-token-x | `try!` | [T342](#t342) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1589](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1589) | deposit-token-x | `try!` | [T33](#t33) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1596](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1596) | deposit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1611](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1611) | settle-token-x-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1612](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1612) | settle-token-x-deposit | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1625](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1625) | settle-token-x-deposit | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1626](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1626) | settle-token-x-deposit | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1627](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1627) | settle-token-x-deposit | `asserts!` | [T182](#t182) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1634](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1634) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1635](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1635) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1657](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1657) | settle-token-x-deposit | `asserts!` | [T183](#t183) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1658](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1658) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1659](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1659) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1670](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1670) | settle-token-x-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1671](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1671) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1672](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1672) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1697](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1697) | cancel-token-y-deposit | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1698](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1698) | cancel-token-y-deposit | `asserts!` | [T236](#t236) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1704](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1704) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1705](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1705) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1720](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1720) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1721](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1721) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1733](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1733) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1734](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1734) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1771](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1771) | cancel-token-x-deposit | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1772](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1772) | cancel-token-x-deposit | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1778](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1778) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1779](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1779) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1794](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1794) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1795](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1795) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1807](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1807) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1808](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1808) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1853](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1853) | withdraw-token-y | `asserts!` | [T226](#t226) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1854](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1854) | withdraw-token-y | `asserts!` | [T236](#t236) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1855](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1855) | withdraw-token-y | `asserts!` | [T229](#t229) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1856](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1856) | withdraw-token-y | `asserts!` | [T229](#t229) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1857](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1857) | withdraw-token-y | `asserts!` | [T229](#t229) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1858](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1858) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1859](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1859) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1875](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1875) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1903](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1903) | withdraw-token-x | `asserts!` | [T171](#t171) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1904](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1904) | withdraw-token-x | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1905](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1905) | withdraw-token-x | `asserts!` | [T174](#t174) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1906](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1906) | withdraw-token-x | `asserts!` | [T174](#t174) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1907](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1907) | withdraw-token-x | `asserts!` | [T174](#t174) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1908](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1908) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1909](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1909) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1925](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1925) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1935](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1935) | readmit-token-y | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1936](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1936) | readmit-token-y | `asserts!` | [T236](#t236) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1937](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1937) | readmit-token-y | `asserts!` | [T249](#t249) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1939](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1939) | readmit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1950](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1950) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1951](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1951) | settle-token-y-readmit | `try!` | [T31](#t31) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1962](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1962) | settle-token-y-readmit | `asserts!` | [T245](#t245) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1963](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1963) | settle-token-y-readmit | `asserts!` | [T245](#t245) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1967](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1967) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1986](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1986) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1992](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1992) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2004](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2004) | readmit-token-x | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2005](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2005) | readmit-token-x | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2006](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2006) | readmit-token-x | `asserts!` | [T194](#t194) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2008](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2008) | readmit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2019](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2019) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2020](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2020) | settle-token-x-readmit | `try!` | [T31](#t31) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2031](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2031) | settle-token-x-readmit | `asserts!` | [T190](#t190) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2032](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2032) | settle-token-x-readmit | `asserts!` | [T190](#t190) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2036](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2036) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2055](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2055) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2061](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2061) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2074](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2074) | set-token-y-limit | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2075](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2075) | set-token-y-limit | `asserts!` | [T235](#t235) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2076](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2076) | set-token-y-limit | `asserts!` | [T236](#t236) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2090](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2090) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2101](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2101) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2114](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2114) | settle-token-y-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2115](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2115) | settle-token-y-limit | `try!` | [T30](#t30) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2125](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2125) | settle-token-y-limit | `asserts!` | [T261](#t261) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2138](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2138) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2156](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2156) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2169](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2169) | set-token-x-limit | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2170](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2170) | set-token-x-limit | `asserts!` | [T180](#t180) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2171](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2171) | set-token-x-limit | `asserts!` | [T181](#t181) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2185](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2185) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2196](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2196) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2209](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2209) | settle-token-x-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2210](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2210) | settle-token-x-limit | `try!` | [T30](#t30) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2220](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2220) | settle-token-x-limit | `asserts!` | [T206](#t206) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2233](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2233) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2251](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2251) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2272](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2272) | reprice-or-swap-token-y | `asserts!` | [T266](#t266) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2273](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2273) | reprice-or-swap-token-y | `asserts!` | [T266](#t266) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2274](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2274) | reprice-or-swap-token-y | `asserts!` | [T266](#t266) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2275](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2275) | reprice-or-swap-token-y | `asserts!` | [T266](#t266) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2276](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2276) | reprice-or-swap-token-y | `asserts!` | [T266](#t266) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2280](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2280) | reprice-or-swap-token-y | `try!` | [T41](#t41) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2281](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2281) | reprice-or-swap-token-y | `try!` | [T41](#t41) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2300](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2300) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2305](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2305) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2311](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2311) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2315](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2315) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2329](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2329) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2339](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2339) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2368](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2368) | reprice-or-swap-token-x | `asserts!` | [T211](#t211) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2369](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2369) | reprice-or-swap-token-x | `asserts!` | [T211](#t211) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2370](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2370) | reprice-or-swap-token-x | `asserts!` | [T211](#t211) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2371](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2371) | reprice-or-swap-token-x | `asserts!` | [T211](#t211) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2372](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2372) | reprice-or-swap-token-x | `asserts!` | [T211](#t211) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2376](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2376) | reprice-or-swap-token-x | `try!` | [T40](#t40) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2377](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2377) | reprice-or-swap-token-x | `try!` | [T40](#t40) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2396](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2396) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2401](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2401) | reprice-or-swap-token-x | `try!` | [T34](#t34) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2409](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2409) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2413](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2413) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2427](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2427) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2437](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2437) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2491](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2491) | filter-small-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2539](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2539) | filter-small-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2584](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2584) | filter-limit-violating-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2628](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2628) | filter-limit-violating-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2645](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2645) | settle-with-refresh | `asserts!` | [T122](#t122) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2646](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2646) | settle-with-refresh | `asserts!` | [T122](#t122) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2647](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2647) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2682](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2682) | settle-with-verified-feeds | `try!` | [T14](#t14) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2693](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2693) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2699](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2699) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2705](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2705) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2726](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2726) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2727](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2727) | swap | `try!` | [T46](#t46) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2747](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2747) | swap | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2748](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2748) | swap | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2749](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2749) | swap | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2759](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2759) | swap | `asserts!` | [T204](#t204) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2769](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2769) | swap | `asserts!` | [T217](#t217) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2777](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2777) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2786](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2786) | swap | `try!` | [T35](#t35) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2792](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2792) | swap | `try!` | [T39](#t39) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2797](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2797) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2800](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2800) | swap | `try!` | [T38](#t38) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2808](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2808) | swap | `asserts!` | [T339](#t339) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2809](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2809) | swap | `asserts!` | [T338](#t338) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2810](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2810) | swap | `try!` | [T348](#t348) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2815](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2815) | swap | `try!` | [T349](#t349) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2820](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2820) | swap | `try!` | [T358](#t358) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2899](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2899) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2900](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2900) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2902](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2902) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2905](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2905) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2906](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2906) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2910](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2910) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2962](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2962) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2963](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2963) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2965](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2965) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2973](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2973) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2974](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2974) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2976](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2976) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2988](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2988) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3036](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3036) | walk-x-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3077](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3077) | walk-y-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3322](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3322) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3341](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3341) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3342](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3342) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3346](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3346) | cross-remainder-as-y | `asserts!` | [T272](#t272) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3350](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3350) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3351](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3351) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3365](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3365) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3392](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3392) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3411](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3411) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3412](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3412) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3416](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3416) | cross-remainder-as-x | `asserts!` | [T217](#t217) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3420](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3420) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3421](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3421) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3435](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3435) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [3480](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3480) | execute-settlement | `asserts!` | [T122](#t122) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3481](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3481) | execute-settlement | `asserts!` | [T127](#t127) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3488](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3488) | execute-settlement | `asserts!` | [T136](#t136) (private) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3489](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3489) | execute-settlement | `asserts!` | [T137](#t137) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3490](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3490) | execute-settlement | `asserts!` | [T139](#t139) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3491](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3491) | execute-settlement | `asserts!` | [T122](#t122) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3492](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3492) | execute-settlement | `asserts!` | [T122](#t122) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3493](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3493) | execute-settlement | `asserts!` | [T156](#t156) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3496](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3496) | execute-settlement | `asserts!` | [T138](#t138) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3499](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3499) | execute-settlement | `asserts!` | [T140](#t140) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3501](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3501) | execute-settlement | `asserts!` | [T156](#t156) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3516](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3516) | execute-settlement | `asserts!` | [T207](#t207) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3546](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3546) | execute-settlement | `asserts!` | [T155](#t155) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3565](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3565) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3566](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3566) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3571](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3571) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3572](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3572) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3590](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3590) | execute-settlement | `try!` | [T345](#t345) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3609](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3609) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3652](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3652) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3654](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3654) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3677](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3677) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3678](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3678) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3680](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3680) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3688](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3688) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3704](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3704) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3747](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3747) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3748](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3748) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3769](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3769) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3771](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3771) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3775](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3775) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3783](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3783) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3817](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3817) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3818](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3818) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3823](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3823) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3824](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3824) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3830](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3830) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3848](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3848) | initialize | `asserts!` | [T130](#t130) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3849](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3849) | initialize | `asserts!` | [T130](#t130) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3852](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3852) | initialize | `asserts!` | [T130](#t130) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3853](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3853) | initialize | `asserts!` | [T130](#t130) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3861](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3861) | initialize | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3867](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3867) | set-treasury | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3868](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3868) | set-treasury | `asserts!` | [T129](#t129) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3874](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3874) | set-paused | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3880](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3880) | set-operator | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3886](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3886) | set-min-token-y-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3887](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3887) | set-min-token-y-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3893](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3893) | set-min-token-x-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3894](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3894) | set-min-token-x-deposit | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3900](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3900) | set-distance-slots | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3901](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3901) | set-distance-slots | `asserts!` | [T128](#t128) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4016](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4016) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4017](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4017) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4019](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4019) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4020](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4020) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4021](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4021) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4022](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4022) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [4204](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4204) | prune-one | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [4205](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L4205) | prune-one | `asserts!` | [T127](#t127) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |

## Witness test catalog

<a id="t153"></a>**T153**: tests/unit/v6-3/market.test.ts__protected seats__syncs both memberships idempotently, prunes revoked seats, caps reservation at 50

<a id="t24"></a>**T24**: oracle and peg boundaries > refresh mode=7 ages=0/0 code=9001

<a id="t29"></a>**T29**: oracle propagation and unfunded STX input > oracle error preserves pending deposit on both sides

<a id="t30"></a>**T30**: oracle propagation and unfunded STX input > oracle error preserves pending limit on both sides

<a id="t31"></a>**T31**: oracle propagation and unfunded STX input > oracle error preserves pending readmit on both sides

<a id="t40"></a>**T40**: reprice-or-swap verifies its Lazer update once > a crossing reprice keeps its oracle errors and rolls back: side x

<a id="t41"></a>**T41**: reprice-or-swap verifies its Lazer update once > a crossing reprice keeps its oracle errors and rolls back: side y

<a id="t20"></a>**T20**: oracle and peg boundaries > refresh mode=2 ages=0/0 code=1004

<a id="t21"></a>**T21**: oracle and peg boundaries > refresh mode=4 ages=0/0 code=1025

<a id="t27"></a>**T27**: oracle propagation and unfunded STX input > independent y-feed shape error mode 14 is returned without state changes

<a id="t28"></a>**T28**: oracle propagation and unfunded STX input > independent y-feed shape error mode 15 is returned without state changes

<a id="t23"></a>**T23**: oracle and peg boundaries > refresh mode=6 ages=0/0 code=1023

<a id="t26"></a>**T26**: oracle propagation and unfunded STX input > independent y-feed shape error mode 13 is returned without state changes

<a id="t146"></a>**T146**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=80/0 code=1003

<a id="t337"></a>**T337**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a stale classification feed before any transfer

<a id="t327"></a>**T327**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a crossing reprice keeps its oracle errors and rolls back: side x

<a id="t328"></a>**T328**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a crossing reprice keeps its oracle errors and rolls back: side y

<a id="t49"></a>**T49**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 80 quotes 70 bps but swap rejects stale data

<a id="t48"></a>**T48**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 100 quotes 70 bps but swap rejects stale data

<a id="t144"></a>**T144**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=0/80 code=1003

<a id="t147"></a>**T147**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=1 ages=0/0 code=1006

<a id="t154"></a>**T154**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t150"></a>**T150**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=45 ages=0/0 code=1006

<a id="t18"></a>**T18**: oracle and peg boundaries > refresh mode=0 ages=80/0 code=1003

<a id="t17"></a>**T17**: oracle and peg boundaries > refresh mode=0 ages=0/80 code=1003

<a id="t19"></a>**T19**: oracle and peg boundaries > refresh mode=1 ages=0/0 code=1006

<a id="t22"></a>**T22**: oracle and peg boundaries > refresh mode=45 ages=0/0 code=1006

<a id="t42"></a>**T42**: rounding and additional oracle boundaries > accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t246"></a>**T246**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t247"></a>**T247**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t259"></a>**T259**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t163"></a>**T163**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public y slots before escrowing the 41st maker

<a id="t352"></a>**T352**: y queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t351"></a>**T351**: y maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t350"></a>**T350**: y final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t38"></a>**T38**: registered contract depositor with real core accounting > x: core pause rejects a walk without changing either market or equity

<a id="t353"></a>**T353**: y real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t235"></a>**T235**: tests/unit/v6-3/market.test.ts__y maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t109"></a>**T109**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__y: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t231"></a>**T231**: tests/unit/v6-3/market.test.ts__y maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t25"></a>**T25**: oracle propagation and unfunded STX input > an unfunded direct STX input cannot change the market

<a id="t237"></a>**T237**: tests/unit/v6-3/market.test.ts__y maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t238"></a>**T238**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t224"></a>**T224**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t191"></a>**T191**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t192"></a>**T192**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t204"></a>**T204**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t162"></a>**T162**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public x slots before escrowing the 41st maker

<a id="t343"></a>**T343**: x queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t32"></a>**T32**: real core registration and equity > an unfunded direct token input returns the real FT balance error

<a id="t342"></a>**T342**: x maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t341"></a>**T341**: x final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t39"></a>**T39**: registered contract depositor with real core accounting > y: core pause rejects a walk without changing either market or equity

<a id="t344"></a>**T344**: x real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t180"></a>**T180**: tests/unit/v6-3/market.test.ts__x maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t108"></a>**T108**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__x: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t176"></a>**T176**: tests/unit/v6-3/market.test.ts__x maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t33"></a>**T33**: real core registration and equity > an unfunded pending token input returns the real FT balance error

<a id="t182"></a>**T182**: tests/unit/v6-3/market.test.ts__x maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t183"></a>**T183**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t169"></a>**T169**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t226"></a>**T226**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t236"></a>**T236**: tests/unit/v6-3/market.test.ts__y maker lifecycle__starts empty and exposes consistent default reads

<a id="t171"></a>**T171**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t181"></a>**T181**: tests/unit/v6-3/market.test.ts__x maker lifecycle__starts empty and exposes consistent default reads

<a id="t229"></a>**T229**: tests/unit/v6-3/market.test.ts__y maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t174"></a>**T174**: tests/unit/v6-3/market.test.ts__x maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t249"></a>**T249**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t245"></a>**T245**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t194"></a>**T194**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t190"></a>**T190**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t261"></a>**T261**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t206"></a>**T206**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t266"></a>**T266**: tests/unit/v6-3/market.test.ts__y swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t332"></a>**T332**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a wrong trait is rejected before any verification: side y

<a id="t211"></a>**T211**: tests/unit/v6-3/market.test.ts__x swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t331"></a>**T331**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a wrong trait is rejected before any verification: side x

<a id="t34"></a>**T34**: real core registration and equity > an unfunded reprice token input returns the real FT balance error

<a id="t122"></a>**T122**: tests/unit/v6-3/market.test.ts__batch settlement and history__rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t14"></a>**T14**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 3

<a id="t16"></a>**T16**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 5

<a id="t13"></a>**T13**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 1

<a id="t15"></a>**T15**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 45

<a id="t2"></a>**T2**: batch settlement and history > settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t1"></a>**T1**: batch settlement and history > rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t348"></a>**T348**: x swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t357"></a>**T357**: y swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t347"></a>**T347**: x remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t356"></a>**T356**: y remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t43"></a>**T43**: rounding and additional oracle boundaries > does not settle a book with no eligible liquidity after limit filtering

<a id="t44"></a>**T44**: rounding and additional oracle boundaries > rejects zero computed cross-price and confidence at the x threshold

<a id="t345"></a>**T345**: x real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t346"></a>**T346**: x real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t354"></a>**T354**: y real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t355"></a>**T355**: y real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t45"></a>**T45**: settles distinct asset identities through the real core and clears deposited equity

<a id="t3"></a>**T3**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 0: exact rejection and recovery

<a id="t4"></a>**T4**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 1: exact rejection and recovery

<a id="t5"></a>**T5**: independent oracle boundaries with funded settlement and recovery > x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t6"></a>**T6**: independent oracle boundaries with funded settlement and recovery > x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t7"></a>**T7**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 0: exact rejection and recovery

<a id="t8"></a>**T8**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 1: exact rejection and recovery

<a id="t9"></a>**T9**: independent oracle boundaries with funded settlement and recovery > y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t10"></a>**T10**: independent oracle boundaries with funded settlement and recovery > y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t46"></a>**T46**: swap verifies its Lazer update once > rejects a stale classification feed before any transfer

<a id="t12"></a>**T12**: market owns the age-aware capacity quote > age 80 quotes 70 bps but swap rejects stale data

<a id="t11"></a>**T11**: market owns the age-aware capacity quote > age 100 quotes 70 bps but swap rejects stale data

<a id="t217"></a>**T217**: tests/unit/v6-3/market.test.ts__x swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t272"></a>**T272**: tests/unit/v6-3/market.test.ts__y swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t35"></a>**T35**: real core registration and equity > an unfunded swap token input returns the real FT balance error

<a id="t339"></a>**T339**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a wrong opposite-asset trait after deposit and rolls back: deposit y

<a id="t338"></a>**T338**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a wrong opposite-asset trait after deposit and rolls back: deposit x

<a id="t349"></a>**T349**: x swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t36"></a>**T36**: real-core accounting at the taker refund threshold > x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t358"></a>**T358**: y swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t37"></a>**T37**: real-core accounting at the taker refund threshold > y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t113"></a>**T113**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t110"></a>**T110**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t127"></a>**T127**: tests/unit/v6-3/market.test.ts__batch settlement and history__settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t212"></a>**T212**: tests/unit/v6-3/market.test.ts__x swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t267"></a>**T267**: tests/unit/v6-3/market.test.ts__y swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t136"></a>**T136**: tests/unit/v6-3/market.test.ts__isolated defensive helper cases__rejects an already-settled historical cycle through the settlement helper

<a id="t137"></a>**T137**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 1

<a id="t139"></a>**T139**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 45

<a id="t281"></a>**T281**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t282"></a>**T282**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t287"></a>**T287**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 80 seconds: exact settlement cutoff and recovery

<a id="t288"></a>**T288**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 81 seconds: exact settlement cutoff and recovery

<a id="t156"></a>**T156**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__rejects zero computed cross-price and confidence at the x threshold

<a id="t278"></a>**T278**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 0: exact rejection and recovery

<a id="t279"></a>**T279**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 1: exact rejection and recovery

<a id="t138"></a>**T138**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 3

<a id="t284"></a>**T284**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 0: exact rejection and recovery

<a id="t285"></a>**T285**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 1: exact rejection and recovery

<a id="t140"></a>**T140**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 5

<a id="t207"></a>**T207**: tests/unit/v6-3/market.test.ts__x remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t262"></a>**T262**: tests/unit/v6-3/market.test.ts__y remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t155"></a>**T155**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__does not settle a book with no eligible liquidity after limit filtering

<a id="t130"></a>**T130**: tests/unit/v6-3/market.test.ts__initialization and administration__requires both operator and core owner; rejects zero minima and reinitialization

<a id="t128"></a>**T128**: tests/unit/v6-3/market.test.ts__initialization and administration__authorizes setters and enforces their boundaries

<a id="t129"></a>**T129**: tests/unit/v6-3/market.test.ts__initialization and administration__rejects the market as treasury without changing the configured recipient or funded book
