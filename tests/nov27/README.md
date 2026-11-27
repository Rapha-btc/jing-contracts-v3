# November 26–27 contract regressions

From the repository root, with Clarinet **3.23.2** installed:

```sh
npm ci --prefix tests/nov27
npm --prefix tests/nov27 test
```

The isolated package pins Clarinet SDK **3.23.2** and Vitest **3.2.4**. Each test
creates a fresh simnet in its arrange section; there are no beforeAll/beforeEach
hooks or skipped tests. `run.sh` builds local fixtures, runs `clarinet check`,
and then runs only this directory's test files. Generated files stay under
`.build` (and wallet manifest settings/deployments are ignored).

Both complete production routers are compiled after external-principal bindings
are redirected to local mocks. Zest records pool ID, token order and route;
configurable partial fills transfer real simnet tokens/STX. Unavailable DLMM
pools model an empty smart-swap fallback; explicit split DLMM calls execute a
simple 1:1 mock fill. scale-min is tested through SDK callPrivateFn and through
public partial-fill swaps that reject rounded-down output (u3002).

These are deterministic unit/integration regressions with mocked external
services, not mainnet liquidity or oracle-signature integration tests. Production
source files, the root manifest and existing deployment plans are left untouched.

## Coverage and seeded fuzzing

See [RESULTS.md](RESULTS.md) for per-file pass counts, baseline/current production
line coverage, function coverage, source hashes and remaining gaps. Coverage
collection uses an afterEach reporting hook only; test setup remains explicit.

The `rendezvous*.test.ts` files use Rendezvous 1.0.3 ABI argument generation and
fast-check shrinking, with seeds 20261126 and 20261127. Default: 500 generated
cases per property. `RV_RUNS=2000 npm --prefix tests/nov27 test` increases the
campaign. They run inside the same pinned Clarinet SDK, independently of older
RV harnesses. `package-lock.json` pins the transitive toolchain as well.

The expanded router mocks also provide configurable DLMM availability and real
1:1 asset transfers for Jing, DLMM, XYK and Velar. This exercises mixed routes
and fallback accounting while leaving mainnet venue pricing outside this suite.
