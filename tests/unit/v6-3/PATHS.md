# v6-3 error-exit matrix

Market SHA-256: `d77d79bacb0eba623fafde5b693512612e68b32f3694381216c9973703cb5e97`.

Inventory: **301 explicit error-exit sites**, with a conservative negative witness for **147**. **154 have no attributed negative witness**.

These counts describe witness attribution, **not failing tests**.

These are error exits (`asserts!`, `unwrap!`, `try!`), not all control-flow branches. Missing witnesses do not prove a path is reachable or untested. No site is excluded from the denominator.

A witness is either Clarinet LCOV execution of an assertion’s error operand or an SDK trace showing that the immediate operand call returned an error in a test that checked the public/private result. Native operations, `unwrap!`, and folds are not guessed from the final error code. Private helper witnesses do not establish public reachability.

The real core runs in this suite. Artificial selective logger failures are excluded. Stxer links identify related scenarios only: they are **not per-arm coverage evidence**. Source-matched Stxer trace attribution remains separate.

Regenerate after a passing full suite with `node tests/unit/v6-3/path-matrix.mjs`. Full test attribution and rollback details are in `.build/path-matrix.json`.

| Source line | Function | Exit | Negative witness | Related Stxer scenario |
| ---: | --- | --- | --- | --- |
| [122](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L122) | sync-seat | `asserts!` | [T149](#t149) | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [124](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L124) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [127](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L127) | sync-seat | `unwrap!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [746](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L746) | park-token-y | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [766](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L766) | park-token-x | `try!` | unattributed | [full-side](../../../simulations/verify-v6-3-full-side.js) |
| [828](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L828) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [832](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L832) | shape-feed | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [838](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L838) | lazer-feeds | `try!` | [T20](#t20) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [842](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L842) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [849](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L849) | lazer-feeds | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [857](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L857) | lazer-feeds | `try!` | [T16](#t16) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [858](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L858) | lazer-feeds | `try!` | [T23](#t23) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [865](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L865) | fresh-classification-price-aged | `try!` | [T16](#t16) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [895](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L895) | fresh-classification-from-feeds | `asserts!` | [T142](#t142) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [896](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L896) | fresh-classification-from-feeds | `asserts!` | [T140](#t140) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [897](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L897) | fresh-classification-from-feeds | `asserts!` | [T143](#t143) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [898](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L898) | fresh-classification-from-feeds | `asserts!` | [T146](#t146) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [906](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L906) | fresh-classification-price | `try!` | [T14](#t14) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1002](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1002) | deposit-token-y-core | `asserts!` | [T242](#t242) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1004](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1004) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1010](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1010) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1012](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1012) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1025](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1025) | deposit-token-y-core | `try!` | [T359](#t359) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1032](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1032) | deposit-token-y-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1036](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1036) | deposit-token-y-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1045](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1045) | deposit-token-y-core | `try!` | [T358](#t358) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1062](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1062) | deposit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1063](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1063) | deposit-token-y | `asserts!` | [T227](#t227) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1064](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1064) | deposit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1065](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1065) | deposit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1066](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1066) | deposit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1067](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1067) | deposit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1073](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1073) | deposit-token-y | `try!` | [T358](#t358) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1076](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1076) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1083](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1083) | deposit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1092](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1092) | settle-token-y-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1093](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1093) | settle-token-y-deposit | `try!` | [T25](#t25) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1108](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1108) | settle-token-y-deposit | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1109](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1109) | settle-token-y-deposit | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1110](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1110) | settle-token-y-deposit | `asserts!` | [T233](#t233) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1116](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1116) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1117](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1117) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1133](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1133) | settle-token-y-deposit | `asserts!` | [T234](#t234) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1134](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1134) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1135](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1135) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1142](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1142) | settle-token-y-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1143](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1143) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1144](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1144) | settle-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1193](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1193) | deposit-token-x-core | `asserts!` | [T187](#t187) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1195](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1195) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1201](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1201) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1203](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1203) | deposit-token-x-core | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1216](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1216) | deposit-token-x-core | `try!` | [T350](#t350) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1223](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1223) | deposit-token-x-core | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1227](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1227) | deposit-token-x-core | `try!` | [T28](#t28) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1236](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1236) | deposit-token-x-core | `try!` | [T349](#t349) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1253](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1253) | deposit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1254](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1254) | deposit-token-x | `asserts!` | [T172](#t172) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1255](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1255) | deposit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1256](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1256) | deposit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1257](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1257) | deposit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1258](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1258) | deposit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1264](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1264) | deposit-token-x | `try!` | [T349](#t349) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1267](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1267) | deposit-token-x | `try!` | [T29](#t29) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1274](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1274) | deposit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1283](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1283) | settle-token-x-deposit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1284](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1284) | settle-token-x-deposit | `try!` | [T25](#t25) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1299](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1299) | settle-token-x-deposit | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1300](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1300) | settle-token-x-deposit | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1301](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1301) | settle-token-x-deposit | `asserts!` | [T178](#t178) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1307](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1307) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1308](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1308) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1324](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1324) | settle-token-x-deposit | `asserts!` | [T179](#t179) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1325](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1325) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1326](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1326) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1333](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1333) | settle-token-x-deposit | `asserts!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1334](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1334) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1335](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1335) | settle-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1351](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1351) | cancel-token-y-deposit | `asserts!` | [T222](#t222) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1352](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1352) | cancel-token-y-deposit | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1358](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1358) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1359](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1359) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1370](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1370) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1371](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1371) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1379](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1379) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1380](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1380) | cancel-token-y-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1406](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1406) | cancel-token-x-deposit | `asserts!` | [T167](#t167) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1407](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1407) | cancel-token-x-deposit | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1413](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1413) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1414](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1414) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1425](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1425) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1426](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1426) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1434](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1434) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1435](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1435) | cancel-token-x-deposit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1467](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1467) | withdraw-token-y | `asserts!` | [T222](#t222) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1468](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1468) | withdraw-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1469](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1469) | withdraw-token-y | `asserts!` | [T225](#t225) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1470](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1470) | withdraw-token-y | `asserts!` | [T225](#t225) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1471](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1471) | withdraw-token-y | `asserts!` | [T225](#t225) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1472](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1472) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1473](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1473) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1484](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1484) | withdraw-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1505](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1505) | withdraw-token-x | `asserts!` | [T167](#t167) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1506](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1506) | withdraw-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1507](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1507) | withdraw-token-x | `asserts!` | [T170](#t170) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1508](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1508) | withdraw-token-x | `asserts!` | [T170](#t170) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1509](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1509) | withdraw-token-x | `asserts!` | [T170](#t170) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1510](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1510) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1511](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1511) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1522](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1522) | withdraw-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1528](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1528) | readmit-token-y | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1529](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1529) | readmit-token-y | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1530](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1530) | readmit-token-y | `asserts!` | [T245](#t245) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1532](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1532) | readmit-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1539](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1539) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1540](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1540) | settle-token-y-readmit | `try!` | [T27](#t27) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1550](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1550) | settle-token-y-readmit | `asserts!` | [T241](#t241) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1551](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1551) | settle-token-y-readmit | `asserts!` | [T241](#t241) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1555](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1555) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1570](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1570) | settle-token-y-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1574](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1574) | settle-token-y-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1580](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1580) | readmit-token-x | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1581](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1581) | readmit-token-x | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1582](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1582) | readmit-token-x | `asserts!` | [T190](#t190) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1584](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1584) | readmit-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1591](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1591) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1592](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1592) | settle-token-x-readmit | `try!` | [T27](#t27) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1602](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1602) | settle-token-x-readmit | `asserts!` | [T186](#t186) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1603](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1603) | settle-token-x-readmit | `asserts!` | [T186](#t186) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1607](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1607) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1622](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1622) | settle-token-x-readmit | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1626](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1626) | settle-token-x-readmit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1633](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1633) | set-token-y-limit | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1634](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1634) | set-token-y-limit | `asserts!` | [T231](#t231) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1635](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1635) | set-token-y-limit | `asserts!` | [T232](#t232) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1647](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1647) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1656](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1656) | set-token-y-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1663](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1663) | settle-token-y-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1664](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1664) | settle-token-y-limit | `try!` | [T26](#t26) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1672](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1672) | settle-token-y-limit | `asserts!` | [T257](#t257) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1682](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1682) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1696](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1696) | settle-token-y-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1703](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1703) | set-token-x-limit | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1704](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1704) | set-token-x-limit | `asserts!` | [T176](#t176) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1705](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1705) | set-token-x-limit | `asserts!` | [T177](#t177) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1717](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1717) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1726](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1726) | set-token-x-limit | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1733](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1733) | settle-token-x-limit | `unwrap!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1734](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1734) | settle-token-x-limit | `try!` | [T26](#t26) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1742](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1742) | settle-token-x-limit | `asserts!` | [T202](#t202) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1752](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1752) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1766](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1766) | settle-token-x-limit | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1780](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1780) | reprice-or-swap-token-y | `asserts!` | [T262](#t262) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1781](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1781) | reprice-or-swap-token-y | `asserts!` | [T262](#t262) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1782](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1782) | reprice-or-swap-token-y | `asserts!` | [T262](#t262) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1783](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1783) | reprice-or-swap-token-y | `asserts!` | [T262](#t262) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1784](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1784) | reprice-or-swap-token-y | `asserts!` | [T262](#t262) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1788](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1788) | reprice-or-swap-token-y | `try!` | [T37](#t37) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1789](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1789) | reprice-or-swap-token-y | `try!` | [T37](#t37) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1803](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1803) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1807](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1807) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1812](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1812) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1815](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1815) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1825](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1825) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1833](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1833) | reprice-or-swap-token-y | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1853](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1853) | reprice-or-swap-token-x | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1854](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1854) | reprice-or-swap-token-x | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1855](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1855) | reprice-or-swap-token-x | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1856](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1856) | reprice-or-swap-token-x | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1857](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1857) | reprice-or-swap-token-x | `asserts!` | [T207](#t207) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1861](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1861) | reprice-or-swap-token-x | `try!` | [T36](#t36) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1862](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1862) | reprice-or-swap-token-x | `try!` | [T36](#t36) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1876](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1876) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1880](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1880) | reprice-or-swap-token-x | `try!` | [T30](#t30) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1886](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1886) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1889](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1889) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1899](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1899) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1907](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1907) | reprice-or-swap-token-x | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [1946](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1946) | filter-small-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [1980](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L1980) | filter-small-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2012](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2012) | filter-limit-violating-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2044](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2044) | filter-limit-violating-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2055](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2055) | settle-with-refresh | `asserts!` | [T118](#t118) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2056](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2056) | settle-with-refresh | `asserts!` | [T118](#t118) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2057](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2057) | settle-with-refresh | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2058](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2058) | settle-with-refresh | `asserts!` | [T118](#t118) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2059](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2059) | settle-with-refresh | `asserts!` | [T118](#t118) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2089](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2089) | settle-with-verified-feeds | `try!` | [T10](#t10) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2100](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2100) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2105](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2105) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2110](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2110) | settle-with-verified-feeds | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2128](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2128) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2129](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2129) | swap | `try!` | [T42](#t42) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2144](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2144) | swap | `asserts!` | [T213](#t213) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2145](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2145) | swap | `asserts!` | [T213](#t213) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2146](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2146) | swap | `asserts!` | [T213](#t213) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2153](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2153) | swap | `asserts!` | [T200](#t200) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2160](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2160) | swap | `asserts!` | [T213](#t213) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2166](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2166) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2173](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2173) | swap | `try!` | [T31](#t31) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2177](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2177) | swap | `try!` | [T35](#t35) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2180](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2180) | swap | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2183](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2183) | swap | `try!` | [T34](#t34) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2187](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2187) | swap | `asserts!` | [T346](#t346) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2188](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2188) | swap | `asserts!` | [T345](#t345) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2189](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2189) | swap | `try!` | [T355](#t355) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2193](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2193) | swap | `try!` | [T356](#t356) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2196](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2196) | swap | `try!` | [T365](#t365) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2254](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2254) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2255](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2255) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2257](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2257) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2259](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2259) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2260](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2260) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2263](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2263) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2301](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2301) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2302](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2302) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2303](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2303) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2308](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2308) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2309](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2309) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2310](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2310) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2318](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2318) | execute-fill | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2355](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2355) | walk-x-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2386](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2386) | walk-y-book-step | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2587](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2587) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2602](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2602) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2603](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2603) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2605](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2605) | cross-remainder-as-y | `asserts!` | [T268](#t268) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2609](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2609) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2610](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2610) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2620](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2620) | cross-remainder-as-y | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2641](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2641) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2656](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2656) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2657](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2657) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2659](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2659) | cross-remainder-as-x | `asserts!` | [T213](#t213) | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2663](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2663) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2664](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2664) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2674](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2674) | cross-remainder-as-x | `try!` | unattributed | [swap-walk](../../../simulations/verify-v6-3-swap-walk.js) |
| [2712](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2712) | execute-settlement | `asserts!` | [T118](#t118) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2713](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2713) | execute-settlement | `asserts!` | [T123](#t123) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2718](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2718) | execute-settlement | `asserts!` | [T132](#t132) (private) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2719](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2719) | execute-settlement | `asserts!` | [T133](#t133) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2720](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2720) | execute-settlement | `asserts!` | [T135](#t135) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2721](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2721) | execute-settlement | `asserts!` | [T302](#t302) (private) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2722](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2722) | execute-settlement | `asserts!` | [T303](#t303) (private) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2723](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2723) | execute-settlement | `asserts!` | [T152](#t152) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2725](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2725) | execute-settlement | `asserts!` | [T134](#t134) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2727](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2727) | execute-settlement | `asserts!` | [T136](#t136) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2729](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2729) | execute-settlement | `asserts!` | [T152](#t152) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2741](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2741) | execute-settlement | `asserts!` | [T203](#t203) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2766](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2766) | execute-settlement | `asserts!` | [T151](#t151) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2782](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2782) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2783](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2783) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2786](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2786) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2787](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2787) | execute-settlement | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2800](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2800) | execute-settlement | `try!` | [T352](#t352) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2812](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2812) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2847](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2847) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2849](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2849) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2866](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2866) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2867](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2867) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2868](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2868) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2871](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2871) | distribute-to-token-y-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2882](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2882) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2917](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2917) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2918](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2918) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2934](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2934) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2936](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2936) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2938](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2938) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2941](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2941) | distribute-to-token-x-depositor | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2968](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2968) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2969](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2969) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2972](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2972) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2973](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2973) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2976](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2976) | roll-and-sweep-dust | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [2990](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2990) | initialize | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2991](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2991) | initialize | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2993](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2993) | initialize | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [2994](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L2994) | initialize | `asserts!` | [T126](#t126) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3002](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3002) | initialize | `try!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3006](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3006) | set-treasury | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3007](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3007) | set-treasury | `asserts!` | [T125](#t125) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3011](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3011) | set-max-staleness | `asserts!` | [T299](#t299) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3012](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3012) | set-max-staleness | `asserts!` | [T299](#t299) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3016](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3016) | set-settle-max-staleness | `asserts!` | [T301](#t301) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3017](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3017) | set-settle-max-staleness | `asserts!` | [T301](#t301) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3021](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3021) | set-paused | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3025](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3025) | set-operator | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3029](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3029) | set-min-token-y-deposit | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3030](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3030) | set-min-token-y-deposit | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3034](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3034) | set-min-token-x-deposit | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3035](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3035) | set-min-token-x-deposit | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3039](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3039) | set-distance-slots | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3040](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3040) | set-distance-slots | `asserts!` | [T124](#t124) | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3126](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3126) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3127](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3127) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3129](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3129) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3130](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3130) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3131](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3131) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3132](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3132) | capacity-rebate-hint | `unwrap!` | unattributed | [errors-admin](../../../simulations/verify-v6-3-errors-admin.js) |
| [3278](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3278) | prune-one | `try!` | unattributed | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |
| [3279](../../../contracts/markets-sbtc-stx-jing-v6-5.clar#L3279) | prune-one | `asserts!` | [T123](#t123) | [settlement-edges](../../../simulations/verify-v6-3-settlement-edges.js) |

## Witness test catalog

<a id="t149"></a>**T149**: tests/unit/v6-3/market.test.ts__protected seats__syncs both memberships idempotently, prunes revoked seats, caps reservation at 50

<a id="t20"></a>**T20**: oracle and peg boundaries > refresh mode=7 ages=0/0 code=9001

<a id="t25"></a>**T25**: oracle propagation and unfunded STX input > oracle error preserves pending deposit on both sides

<a id="t26"></a>**T26**: oracle propagation and unfunded STX input > oracle error preserves pending limit on both sides

<a id="t27"></a>**T27**: oracle propagation and unfunded STX input > oracle error preserves pending readmit on both sides

<a id="t36"></a>**T36**: reprice-or-swap verifies its Lazer update once > a crossing reprice keeps its oracle errors and rolls back: side x

<a id="t37"></a>**T37**: reprice-or-swap verifies its Lazer update once > a crossing reprice keeps its oracle errors and rolls back: side y

<a id="t16"></a>**T16**: oracle and peg boundaries > refresh mode=2 ages=0/0 code=1004

<a id="t17"></a>**T17**: oracle and peg boundaries > refresh mode=4 ages=0/0 code=1025

<a id="t23"></a>**T23**: oracle propagation and unfunded STX input > independent y-feed shape error mode 14 is returned without state changes

<a id="t24"></a>**T24**: oracle propagation and unfunded STX input > independent y-feed shape error mode 15 is returned without state changes

<a id="t19"></a>**T19**: oracle and peg boundaries > refresh mode=6 ages=0/0 code=1023

<a id="t22"></a>**T22**: oracle propagation and unfunded STX input > independent y-feed shape error mode 13 is returned without state changes

<a id="t142"></a>**T142**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=80/0 code=1003

<a id="t344"></a>**T344**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a stale classification feed before any transfer

<a id="t334"></a>**T334**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a crossing reprice keeps its oracle errors and rolls back: side x

<a id="t335"></a>**T335**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a crossing reprice keeps its oracle errors and rolls back: side y

<a id="t45"></a>**T45**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 80 quotes 70 bps but swap rejects stale data

<a id="t44"></a>**T44**: tests/unit/v6-3/capacity-age.test.ts__market owns the age-aware capacity quote__age 100 quotes 70 bps but swap rejects stale data

<a id="t140"></a>**T140**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=0 ages=0/80 code=1003

<a id="t143"></a>**T143**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=1 ages=0/0 code=1006

<a id="t150"></a>**T150**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t146"></a>**T146**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__refresh mode=45 ages=0/0 code=1006

<a id="t14"></a>**T14**: oracle and peg boundaries > refresh mode=0 ages=80/0 code=1003

<a id="t13"></a>**T13**: oracle and peg boundaries > refresh mode=0 ages=0/80 code=1003

<a id="t15"></a>**T15**: oracle and peg boundaries > refresh mode=1 ages=0/0 code=1006

<a id="t18"></a>**T18**: oracle and peg boundaries > refresh mode=45 ages=0/0 code=1006

<a id="t38"></a>**T38**: rounding and additional oracle boundaries > accepts future feed timestamps with zero rebate age and rejects negative classification prices

<a id="t242"></a>**T242**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t243"></a>**T243**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t255"></a>**T255**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t159"></a>**T159**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public y slots before escrowing the 41st maker

<a id="t359"></a>**T359**: y queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t358"></a>**T358**: y maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t357"></a>**T357**: y final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t34"></a>**T34**: registered contract depositor with real core accounting > x: core pause rejects a walk without changing either market or equity

<a id="t360"></a>**T360**: y real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t231"></a>**T231**: tests/unit/v6-3/market.test.ts__y maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t105"></a>**T105**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__y: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t227"></a>**T227**: tests/unit/v6-3/market.test.ts__y maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t21"></a>**T21**: oracle propagation and unfunded STX input > an unfunded direct STX input cannot change the market

<a id="t233"></a>**T233**: tests/unit/v6-3/market.test.ts__y maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t234"></a>**T234**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t220"></a>**T220**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t187"></a>**T187**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 0.5 refunds ties/smaller and parks for larger

<a id="t188"></a>**T188**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__size-only admission amount multiplier 1 refunds ties/smaller and parks for larger

<a id="t200"></a>**T200**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refunds only fresh escrow when a parked owner is refused re-entry

<a id="t158"></a>**T158**: tests/unit/v6-3/market.test.ts__unreduced queue boundaries__fills all 40 default public x slots before escrowing the 41st maker

<a id="t350"></a>**T350**: x queues, parking, and readmission > a paused core rejects admission after parking and restores incumbent and escrow

<a id="t28"></a>**T28**: real core registration and equity > an unfunded direct token input returns the real FT balance error

<a id="t349"></a>**T349**: x maker lifecycle > rejects funding while the real core is paused but permits withdrawals and cancellation

<a id="t348"></a>**T348**: x final guard and walk boundaries > rolls back price-priority parking when the real core rejects admission

<a id="t35"></a>**T35**: registered contract depositor with real core accounting > y: core pause rejects a walk without changing either market or equity

<a id="t351"></a>**T351**: x real core pause and rollback > rejects crossing settlement while the real core is paused

<a id="t176"></a>**T176**: tests/unit/v6-3/market.test.ts__x maker lifecycle__rejects invalid deposits and quotes without touching funds

<a id="t104"></a>**T104**: tests/unit/v6-3/lifecycle.test.ts__multi-cycle lifecycle with real core equity__x: deposit, park, refused readmit, readmit, walk, settle and paused recovery

<a id="t172"></a>**T172**: tests/unit/v6-3/market.test.ts__x maker lifecycle__escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit

<a id="t29"></a>**T29**: real core registration and equity > an unfunded pending token input returns the real FT balance error

<a id="t178"></a>**T178**: tests/unit/v6-3/market.test.ts__x maker lifecycle__uses feed timestamps strictly newer than submission and preserves escrow on guard errors

<a id="t179"></a>**T179**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__a paused core rejects admission after parking and restores incumbent and escrow

<a id="t165"></a>**T165**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__rolls back price-priority parking when the real core rejects admission

<a id="t222"></a>**T222**: tests/unit/v6-3/market.test.ts__y final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t232"></a>**T232**: tests/unit/v6-3/market.test.ts__y maker lifecycle__starts empty and exposes consistent default reads

<a id="t167"></a>**T167**: tests/unit/v6-3/market.test.ts__x final guard and walk boundaries__withdraw and cancel reject a wrong token without releasing custody

<a id="t177"></a>**T177**: tests/unit/v6-3/market.test.ts__x maker lifecycle__starts empty and exposes consistent default reads

<a id="t225"></a>**T225**: tests/unit/v6-3/market.test.ts__y maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t170"></a>**T170**: tests/unit/v6-3/market.test.ts__x maker lifecycle__deposits, tops up, updates a direct quote, partially withdraws and cancels while paused

<a id="t245"></a>**T245**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t241"></a>**T241**: tests/unit/v6-3/market.test.ts__y queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t190"></a>**T190**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact

<a id="t186"></a>**T186**: tests/unit/v6-3/market.test.ts__x queues, parking, and readmission__readmission clears a full-queue refusal, then succeeds after a seat is freed

<a id="t257"></a>**T257**: tests/unit/v6-3/market.test.ts__y remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t202"></a>**T202**: tests/unit/v6-3/market.test.ts__x remaining public transitions__refuses a crossing limit without changing the previous quote

<a id="t262"></a>**T262**: tests/unit/v6-3/market.test.ts__y swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t339"></a>**T339**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a wrong trait is rejected before any verification: side y

<a id="t207"></a>**T207**: tests/unit/v6-3/market.test.ts__x swaps and reprice__direct and pending maker reprices preserve funds and enforce guards

<a id="t338"></a>**T338**: tests/unit/v6-3/verify-once.test.ts__reprice-or-swap verifies its Lazer update once__a wrong trait is rejected before any verification: side x

<a id="t30"></a>**T30**: real core registration and equity > an unfunded reprice token input returns the real FT balance error

<a id="t118"></a>**T118**: tests/unit/v6-3/market.test.ts__batch settlement and history__rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t277"></a>**T277**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 40 seconds: exact settlement cutoff and recovery

<a id="t278"></a>**T278**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x feed aged 41 seconds: exact settlement cutoff and recovery

<a id="t283"></a>**T283**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 40 seconds: exact settlement cutoff and recovery

<a id="t284"></a>**T284**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y feed aged 41 seconds: exact settlement cutoff and recovery

<a id="t10"></a>**T10**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 3

<a id="t12"></a>**T12**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 5

<a id="t9"></a>**T9**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 1

<a id="t11"></a>**T11**: oracle and peg boundaries > batch validates confidence/exponent/positive prices: 45

<a id="t2"></a>**T2**: batch settlement and history > settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t1"></a>**T1**: batch settlement and history > rejects empty, paused, stale, and wrong-trait settlement without mutations

<a id="t355"></a>**T355**: x swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t364"></a>**T364**: y swaps and reprice > does not count pending escrow as settlement liquidity

<a id="t354"></a>**T354**: x remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t363"></a>**T363**: y remaining public transitions > rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t39"></a>**T39**: rounding and additional oracle boundaries > does not settle a book with no eligible liquidity after limit filtering

<a id="t40"></a>**T40**: rounding and additional oracle boundaries > rejects zero computed cross-price and confidence at the x threshold

<a id="t352"></a>**T352**: x real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t353"></a>**T353**: x real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t361"></a>**T361**: y real core pause and rollback > reverts limit filtering when the real settlement logger rejects a paused core

<a id="t362"></a>**T362**: y real core pause and rollback > reverts small share filtering when the real settlement logger rejects a paused core

<a id="t41"></a>**T41**: settles distinct asset identities through the real core and clears deposited equity

<a id="t3"></a>**T3**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 0: exact rejection and recovery

<a id="t4"></a>**T4**: independent oracle boundaries with funded settlement and recovery > x confidence at 2% price plus 1: exact rejection and recovery

<a id="t5"></a>**T5**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 0: exact rejection and recovery

<a id="t6"></a>**T6**: independent oracle boundaries with funded settlement and recovery > y confidence at 2% price plus 1: exact rejection and recovery

<a id="t42"></a>**T42**: swap verifies its Lazer update once > rejects a stale classification feed before any transfer

<a id="t8"></a>**T8**: market owns the age-aware capacity quote > age 80 quotes 70 bps but swap rejects stale data

<a id="t7"></a>**T7**: market owns the age-aware capacity quote > age 100 quotes 70 bps but swap rejects stale data

<a id="t213"></a>**T213**: tests/unit/v6-3/market.test.ts__x swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t268"></a>**T268**: tests/unit/v6-3/market.test.ts__y swaps and reprice__rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t31"></a>**T31**: real core registration and equity > an unfunded swap token input returns the real FT balance error

<a id="t346"></a>**T346**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a wrong opposite-asset trait after deposit and rolls back: deposit y

<a id="t345"></a>**T345**: tests/unit/v6-3/verify-once.test.ts__swap verifies its Lazer update once__rejects a wrong opposite-asset trait after deposit and rolls back: deposit x

<a id="t356"></a>**T356**: x swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t32"></a>**T32**: real-core accounting at the taker refund threshold > x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t365"></a>**T365**: y swaps and reprice > rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically

<a id="t33"></a>**T33**: real-core accounting at the taker refund threshold > y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t109"></a>**T109**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__y: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t106"></a>**T106**: tests/unit/v6-3/lifecycle.test.ts__real-core accounting at the taker refund threshold__x: at-minimum remainder, rollback or refund, then wallet reuse

<a id="t123"></a>**T123**: tests/unit/v6-3/market.test.ts__batch settlement and history__settles a balanced book with exact payouts, fees, cleared amounts, and custody

<a id="t208"></a>**T208**: tests/unit/v6-3/market.test.ts__x swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t263"></a>**T263**: tests/unit/v6-3/market.test.ts__y swaps and reprice__does not count pending escrow as settlement liquidity

<a id="t132"></a>**T132**: tests/unit/v6-3/market.test.ts__isolated defensive helper cases__rejects an already-settled historical cycle through the settlement helper

<a id="t133"></a>**T133**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 1

<a id="t135"></a>**T135**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 45

<a id="t302"></a>**T302**: tests/unit/v6-3/redeploy.test.ts__settlement helper rejects stale x feed at the swap cap

<a id="t303"></a>**T303**: tests/unit/v6-3/redeploy.test.ts__settlement helper rejects stale y feed at the swap cap

<a id="t152"></a>**T152**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__rejects zero computed cross-price and confidence at the x threshold

<a id="t274"></a>**T274**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 0: exact rejection and recovery

<a id="t275"></a>**T275**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__x confidence at 2% price plus 1: exact rejection and recovery

<a id="t134"></a>**T134**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 3

<a id="t280"></a>**T280**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 0: exact rejection and recovery

<a id="t281"></a>**T281**: tests/unit/v6-3/oracle-boundaries.test.ts__independent oracle boundaries with funded settlement and recovery__y confidence at 2% price plus 1: exact rejection and recovery

<a id="t136"></a>**T136**: tests/unit/v6-3/market.test.ts__oracle and peg boundaries__batch validates confidence/exponent/positive prices: 5

<a id="t203"></a>**T203**: tests/unit/v6-3/market.test.ts__x remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t258"></a>**T258**: tests/unit/v6-3/market.test.ts__y remaining public transitions__rejects a taker below the minimum pro-rata share without committing rebates or fills

<a id="t151"></a>**T151**: tests/unit/v6-3/market.test.ts__rounding and additional oracle boundaries__does not settle a book with no eligible liquidity after limit filtering

<a id="t126"></a>**T126**: tests/unit/v6-3/market.test.ts__initialization and administration__requires both operator and core owner; rejects zero minima and reinitialization

<a id="t124"></a>**T124**: tests/unit/v6-3/market.test.ts__initialization and administration__authorizes setters and enforces their boundaries

<a id="t125"></a>**T125**: tests/unit/v6-3/market.test.ts__initialization and administration__rejects the market as treasury without changing the configured recipient or funded book

<a id="t299"></a>**T299**: tests/unit/v6-3/redeploy.test.ts__max-staleness defaults, auth, bounds and rollback

<a id="t301"></a>**T301**: tests/unit/v6-3/redeploy.test.ts__settle-max-staleness defaults, auth, bounds and rollback
