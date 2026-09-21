import fs from 'node:fs';

// Preserve production logic; replace only the deployed registry dependency.
const source = fs.readFileSync('contracts/jing-ladder-dispatch.clar', 'utf8');
const mainnet = "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder";
if (!source.includes(mainnet)) throw new Error('Dispatcher registry reference changed');
fs.mkdirSync('tests/rv/.build', { recursive: true });
fs.writeFileSync('tests/rv/.build/jing-ladder-dispatch.clar',
  source.replaceAll(mainnet, '.rv-dispatch-registry') + '\n' +
  fs.readFileSync('tests/rv/jing-ladder-dispatch.invariants.clar', 'utf8'));
