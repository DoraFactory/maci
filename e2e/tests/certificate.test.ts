import { expect } from 'chai';
import {
  generateCertificate,
  getBackendPublicKey,
  verifyKeypair
} from '../src/utils/certificateGenerator';

describe('Certificate Generator Tests', function () {
  it('should verify keypair matches', function () {
    const matches = verifyKeypair();
    console.log('Keypair verification:', matches);
    console.log('Backend public key:', getBackendPublicKey());
    expect(matches).to.be.true;
  });

  it('should generate certificate', function () {
    const certificate = generateCertificate(
      'dora1kpjz6jsyxg0wd5r5hhyquawgt3zva34m96qdl2', // contract address
      '17399497775960102380565502463631688556400670056228730095262963787053279532078', // pubkey x
      '18877551448216649826981805566855898133402281419471365959781518735588655366005', // pubkey y
      '1' // amount
    );

    console.log('Generated certificate:', certificate);
    console.log('Certificate length:', certificate.length);
    expect(certificate).to.be.a('string');
    expect(certificate.length).to.be.greaterThan(0);
  });
});
