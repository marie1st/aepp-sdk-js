#!/usr/bin/env node
// eslint-disable-next-line import/extensions
import { Node, AeSdk, MemoryAccount } from '../../es/index.mjs';

const contractSourceCode = `
contract Test =
 entrypoint getArg(x : map(string, int)) = x
`;
const node = new Node('https://testnet.aeternity.io');
const aeSdk = new AeSdk({
  nodes: [{ name: 'testnet', instance: node }],
  compilerUrl: 'https://compiler.aepps.com',
});
aeSdk.addAccount(
  new MemoryAccount('bf66e1c256931870908a649572ed0257876bb84e3cdf71efb12f56c7335fad54d5cf08400e988222f26eb4b02c8f89077457467211a6e6d955edb70749c6a33b'),
  { select: true },
);

console.log('Height:', await aeSdk.getHeight());
console.log('Instanceof works correctly for nodes pool', aeSdk.pool instanceof Map);

const contract = await aeSdk.getContractInstance({ sourceCode: contractSourceCode });
const deployInfo = await contract.deploy();
console.log('Contract deployed at', deployInfo.address);
const map = new Map([['foo', 42], ['bar', 43]]);
const { decodedResult } = await contract.methods.getArg(map);
console.log('Call result', decodedResult);
console.log('Instanceof works correctly for returned map', decodedResult instanceof Map);
