type MixedData<T> = T | Array<MixedData<T>> | { [key: string]: MixedData<T> };

export const stringizing = (
  o: MixedData<bigint>,
  path: MixedData<bigint>[] = []
): MixedData<string> => {
  if (path.includes(o)) {
    throw new Error('loop nesting!');
  }
  const newPath = [...path, o];

  if (Array.isArray(o)) {
    return o.map((item) => stringizing(item, newPath));
  } else if (typeof o === 'object') {
    const output: { [key: string]: MixedData<string> } = {};
    for (const key in o) {
      output[key] = stringizing(o[key], newPath);
    }
    return output;
  } else {
    return o.toString();
  }
};

export const bigInt2Buffer = (i: bigint) => {
  let hex = i.toString(16);
  if (hex.length % 2 === 1) {
    hex = '0' + hex;
  }
  return Buffer.from(hex, 'hex');
};
