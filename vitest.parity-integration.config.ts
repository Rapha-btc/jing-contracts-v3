import {defineConfig} from 'vitest/config';
import {vitestSetupFilePath} from '@stacks/clarinet-sdk/vitest';
import './tests/unit/redeploy/parity/build-integration.mjs';
const dir=`tests/unit/parity-${process.env.PARITY_PAIR??'sbtc-usdcx'}-integration`;
export default defineConfig({test:{include:[`${dir}/*.test.ts`],environment:'clarinet',pool:'forks',poolOptions:{forks:{singleFork:true}},setupFiles:[vitestSetupFilePath],bail:1,environmentOptions:{clarinet:{manifestPath:`${dir}/Clarinet.toml`,initBeforeEach:true,coverage:true,costs:false,coverageFilename:`${dir}/.build/lcov.info`}}}});
