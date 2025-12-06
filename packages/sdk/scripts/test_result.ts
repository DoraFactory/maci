import { decodeResult } from '../src';

async function main() {
  const encoded = '25000000000000000000000625';
  const result = decodeResult(encoded);
  console.log(result);

  const encoded2 = '200000003000000040000001200000009';
  const result2 = decodeResult(encoded2);
  console.log(result2);
}

main();
