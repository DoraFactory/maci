// Type shims for packages without official TypeScript declarations

declare module 'snarkjs' {
  export const groth16: {
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: unknown
    ): Promise<boolean>;
  };
}
