import { adaptToUncompressed } from '../src/libs/crypto/adapter';

async function main() {
  // Test data: original Groth16 proof
  const testProof = {
    pi_a: [
      '5370533990242256937771239275021999495207323669512369139094888163771127139466',
      '12920133384383439953572567290813458808085226665082476966499120479063073919999',
      '1'
    ],
    pi_b: [
      [
        '7828185172947669623250218718936284517886978196252533089639552895062818577300',
        '2396228926641335571438114871097560450395995188330239265515750589628046024299'
      ],
      [
        '15893513953647639388792674597456990428197546415251911893682593979465570028444',
        '2873393060128667406529942633543572111463006579069091563442128969898344812324'
      ],
      ['1', '0']
    ],
    pi_c: [
      '5232017197362484438125316341780180478359141786259561623848279904124798390633',
      '12181636990721456234853387807114978890474733482848045831963170573774205824657',
      '1'
    ],
    protocol: 'groth16',
    curve: 'bn128'
  };

  // Expected compressed result
  const expectedResult = {
    a: '0bdf9d511740447761adc4d5f8b46c71de868bec3d6f694f0258073228ff8c8a1c90894e2baa7093ddede7bcf9122708c3bfc46faf4a923d09ab3de5111093ff',
    b: '054c37aebb45a79f78984b77b0f08f9b3ef33883e14f25195b021978c8929e6b114e9885ec13b5316d14c1b48d1b543b2aba476bc9c7e5c6cdc4b77c269a5b94065a48681ea5d78bd1079e12c5e22e875d95aede48b74defc8ab712591178f24232368fd210a31c0c4a586a45ffdaffc91f960a70dea85cdfa02b7bbf4b58b9c',
    c: '0b91377fb089294c72d5c509af0e675021db9eb0bda1b41b99dc557bd56651691aee8fec83a62c81ecb0e7d8612084bd9460a539ac0b25bb032b4de247152e91'
  };

  console.log('🧪 Testing Proof Compression\n');
  console.log('📥 Input Original Proof:');
  console.log(JSON.stringify(testProof, null, 2));
  console.log('\n');

  // Execute compression
  const result = await adaptToUncompressed(testProof as any);

  console.log('📤 Compressed Result:');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n');

  console.log('✅ Expected Result:');
  console.log(JSON.stringify(expectedResult, null, 2));
  console.log('\n');

  // Verify results
  console.log('🔍 Verification Results:\n');

  const aMatch = result.a === expectedResult.a;
  const bMatch = result.b === expectedResult.b;
  const cMatch = result.c === expectedResult.c;

  console.log(`  proof.a: ${aMatch ? '✅ Match' : '❌ Mismatch'}`);
  if (!aMatch) {
    console.log(`    Actual: ${result.a}`);
    console.log(`    Expected: ${expectedResult.a}`);
  }

  console.log(`  proof.b: ${bMatch ? '✅ Match' : '❌ Mismatch'}`);
  if (!bMatch) {
    console.log(`    Actual: ${result.b}`);
    console.log(`    Expected: ${expectedResult.b}`);
  }

  console.log(`  proof.c: ${cMatch ? '✅ Match' : '❌ Mismatch'}`);
  if (!cMatch) {
    console.log(`    Actual: ${result.c}`);
    console.log(`    Expected: ${expectedResult.c}`);
  }

  console.log('\n');

  if (aMatch && bMatch && cMatch) {
    console.log('🎉 All tests passed! Proof compression is working correctly.');
  } else {
    console.log('❌ Test failed! There are mismatched results.');
    process.exit(1);
  }

  // Additional info: display byte lengths
  console.log('\n📊 Byte Length Information:');
  console.log(`  proof.a: ${result.a.length / 2} bytes (${result.a.length} hex characters)`);
  console.log(`  proof.b: ${result.b.length / 2} bytes (${result.b.length} hex characters)`);
  console.log(`  proof.c: ${result.c.length / 2} bytes (${result.c.length} hex characters)`);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
