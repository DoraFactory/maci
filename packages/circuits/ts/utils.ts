export const cleanThreads = async (): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!globalThis) {
    return;
  }

  const curves = ['curve_bn128', 'curve_bls12381'];
  await Promise.all(curves.map((curve) => (globalThis as any)[curve]?.terminate()).filter(Boolean));
};
