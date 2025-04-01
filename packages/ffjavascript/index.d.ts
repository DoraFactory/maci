declare module "ffjavascript" {
    export class BigBuffer {
        constructor(...args: any[])
  
        set(...args: any[]): void
  
        slice(...args: any[]): void
    }
  
    export class ChaCha {
        constructor(...args: any[])
  
        nextBool(...args: any[]): void
  
        nextU32(...args: any[]): void
  
        nextU64(...args: any[]): void
  
        update(...args: any[]): void
    }
  
    export class EC {
        constructor(...args: any[])
  
        add(...args: any[]): void
  
        affine(...args: any[]): void
  
        double(...args: any[]): void
  
        eq(...args: any[]): void
  
        fromRng(...args: any[]): void
  
        fromRprBE(...args: any[]): void
  
        fromRprBEM(...args: any[]): void
  
        fromRprCompressed(...args: any[]): void
  
        fromRprLE(...args: any[]): void
  
        fromRprLEJM(...args: any[]): void
  
        fromRprLEM(...args: any[]): void
  
        fromRprUncompressed(...args: any[]): void
  
        isZero(...args: any[]): void
  
        mulScalar(...args: any[]): void
  
        multiAffine(...args: any[]): void
  
        neg(...args: any[]): void
  
        sub(...args: any[]): void
  
        timesScalar(...args: any[]): void
  
        toRprBE(...args: any[]): void
  
        toRprBEM(...args: any[]): void
  
        toRprCompressed(...args: any[]): void
  
        toRprLE(...args: any[]): void
  
        toRprLEJM(...args: any[]): void
  
        toRprLEM(...args: any[]): void
  
        toRprUncompressed(...args: any[]): void
  
        toString(...args: any[]): void
    }
  
    export class F1Field {
        constructor(...args: any[])
  
        e(...args: any[]): any
        add(...args: any[]): any
        sub(...args: any[]): any
        neg(...args: any[]): any
        mul(...args: any[]): any
        mulScalar(...args: any[]): any
        square(...args: any[]): any
        eq(...args: any[]): any
        neq(...args: any[]): any
        lt(...args: any[]): any
        gt(...args: any[]): any
        leq(...args: any[]): any
        geq(...args: any[]): any
        div(...args: any[]): any
        idiv(...args: any[]): any
        inv(...args: any[]): any
        mod(...args: any[]): any
        pow(...args: any[]): any
        exp(...args: any[]): any
        band(...args: any[]): any
        bor(...args: any[]): any
        bxor(...args: any[]): any
        bnot(...args: any[]): any
        shl(...args: any[]): any
        shr(...args: any[]): any
        land(...args: any[]): any
        lor(...args: any[]): any
        lnot(...args: any[]): any
        sqrt_old(...args: any[]): any
        normalize(...args: any[]): any
        random(...args: any[]): any
        toString(...args: any[]): any
        isZero(...args: any[]): any
        fromRng(...args: any[]): any
  
        fromRprBE(...args: any[]): void
  
        fromRprBEM(...args: any[]): void
  
        fromRprLE(...args: any[]): void
  
        fromRprLEM(...args: any[]): void
  
        toRprBE(...args: any[]): void
  
        toRprBEM(...args: any[]): void
  
        toRprLE(...args: any[]): void
  
        toRprLEM(...args: any[]): void
    }
  
    export class F2Field {
        constructor(...args: any[])
  
        add(...args: any[]): void
  
        conjugate(...args: any[]): void
  
        copy(...args: any[]): void
  
        div(...args: any[]): void
  
        double(...args: any[]): void
  
        eq(...args: any[]): void
  
        exp(...args: any[]): void
  
        fromRng(...args: any[]): void
  
        fromRprBE(...args: any[]): void
  
        fromRprBEM(...args: any[]): void
  
        fromRprLE(...args: any[]): void
  
        fromRprLEM(...args: any[]): void
  
        geq(...args: any[]): void
  
        gt(...args: any[]): void
  
        inv(...args: any[]): void
  
        isZero(...args: any[]): void
  
        leq(...args: any[]): void
  
        lt(...args: any[]): void
  
        mul(...args: any[]): void
  
        mulScalar(...args: any[]): void
  
        neg(...args: any[]): void
  
        neq(...args: any[]): void
  
        pow(...args: any[]): void
  
        random(...args: any[]): void
  
        square(...args: any[]): void
  
        sub(...args: any[]): void
  
        toRprBE(...args: any[]): void
  
        toRprBEM(...args: any[]): void
  
        toRprLE(...args: any[]): void
  
        toRprLEM(...args: any[]): void
  
        toString(...args: any[]): void
    }
  
    export class F3Field {
        constructor(...args: any[])
  
        add(...args: any[]): void
  
        affine(...args: any[]): void
  
        copy(...args: any[]): void
  
        div(...args: any[]): void
  
        double(...args: any[]): void
  
        eq(...args: any[]): void
  
        exp(...args: any[]): void
  
        fromRng(...args: any[]): void
  
        fromRprBE(...args: any[]): void
  
        fromRprBEM(...args: any[]): void
  
        fromRprLE(...args: any[]): void
  
        fromRprLEM(...args: any[]): void
  
        geq(...args: any[]): void
  
        gt(...args: any[]): void
  
        inv(...args: any[]): void
  
        isZero(...args: any[]): void
  
        leq(...args: any[]): void
  
        lt(...args: any[]): void
  
        mul(...args: any[]): void
  
        mulScalar(...args: any[]): void
  
        neg(...args: any[]): void
  
        neq(...args: any[]): void
  
        pow(...args: any[]): void
  
        random(...args: any[]): void
  
        square(...args: any[]): void
  
        sub(...args: any[]): void
  
        toRprBE(...args: any[]): void
  
        toRprBEM(...args: any[]): void
  
        toRprLE(...args: any[]): void
  
        toRprLEM(...args: any[]): void
  
        toString(...args: any[]): void
    }
  
    export class PolField {
        constructor(...args: any[])
  
        add(...args: any[]): void
  
        computeVanishingPolinomial(...args: any[]): void
  
        div(...args: any[]): void
  
        double(...args: any[]): void
  
        eq(...args: any[]): void
  
        eval(...args: any[]): void
  
        eval2(...args: any[]): void
  
        evaluateLagrangePolynomials(...args: any[]): void
  
        extend(...args: any[]): void
  
        fft(...args: any[]): void
  
        fft2(...args: any[]): void
  
        ifft(...args: any[]): void
  
        ifft2(...args: any[]): void
  
        lagrange(...args: any[]): void
  
        log2(...args: any[]): void
  
        mul(...args: any[]): void
  
        mulFFT(...args: any[]): void
  
        mulNormal(...args: any[]): void
  
        mulScalar(...args: any[]): void
  
        normalize(...args: any[]): void
  
        oneRoot(...args: any[]): void
  
        reduce(...args: any[]): void
  
        ruffini(...args: any[]): void
  
        scaleX(...args: any[]): void
  
        square(...args: any[]): void
  
        sub(...args: any[]): void
  
        toString(...args: any[]): void
    }
  
    export class ZqField {
        constructor(...args: any[])
  
        e(...args: any[]): any
        add(...args: any[]): any
        sub(...args: any[]): any
        neg(...args: any[]): any
        mul(...args: any[]): any
        mulScalar(...args: any[]): any
        square(...args: any[]): any
        eq(...args: any[]): any
        neq(...args: any[]): any
        lt(...args: any[]): any
        gt(...args: any[]): any
        leq(...args: any[]): any
        geq(...args: any[]): any
        div(...args: any[]): any
        idiv(...args: any[]): any
        inv(...args: any[]): any
        mod(...args: any[]): any
        pow(...args: any[]): any
        exp(...args: any[]): any
        band(...args: any[]): any
        bor(...args: any[]): any
        bxor(...args: any[]): any
        bnot(...args: any[]): any
        shl(...args: any[]): any
        shr(...args: any[]): any
        land(...args: any[]): any
        lor(...args: any[]): any
        lnot(...args: any[]): any
        sqrt_old(...args: any[]): any
        normalize(...args: any[]): any
        random(...args: any[]): any
        toString(...args: any[]): any
        isZero(...args: any[]): any
        fromRng(...args: any[]): any
  
        fromRprBE(...args: any[]): void
  
        fromRprBEM(...args: any[]): void
  
        fromRprLE(...args: any[]): void
  
        fromRprLEM(...args: any[]): void
  
        toRprBE(...args: any[]): void
  
        toRprBEM(...args: any[]): void
  
        toRprLE(...args: any[]): void
  
        toRprLEM(...args: any[]): void
    }
  
    export function buildBls12381(singleThread: any, plugins: any): any
  
    export function buildBn128(singleThread: any, plugins: any): any
  
    export function getCurveFromName(name: any, singleThread?: any, plugins?: any): any
  
    export function getCurveFromQ(q: any, singleThread: any, plugins: any): any
  
    export function getCurveFromR(r: any, singleThread: any, plugins: any): any
  
    export namespace Scalar {
        const one: any
  
        const zero: any
  
        function abs(a: any): any
  
        function add(a: any, b: any): any
  
        function band(a: any, b: any): any
  
        function bitLength(a: any): any
  
        function bits(n: any): any
  
        function bor(a: any, b: any): any
  
        function bxor(a: any, b: any): any
  
        function div(a: any, b: any): any
  
        function e(s: any, radix: any): any
  
        function eq(a: any, b: any): any
  
        function exp(a: any, b: any): any
  
        function fromArray(a: any, radix: any): any
  
        function fromRprBE(buff: any, o: any, n8: any): any
  
        function fromRprLE(buff: any, o: any, n8: any): any
  
        function fromString(s: any, radix: any): any
  
        function geq(a: any, b: any): any
  
        function gt(a: any, b: any): any
  
        function isNegative(a: any): any
  
        function isOdd(a: any): any
  
        function isZero(a: any): any
  
        function land(a: any, b: any): any
  
        function leq(a: any, b: any): any
  
        function lnot(a: any): any
  
        function lor(a: any, b: any): any
  
        function lt(a: any, b: any): any
  
        function mod(a: any, b: any): any
  
        function mul(a: any, b: any): any
  
        function naf(n: any): any
  
        function neg(a: any): any
  
        function neq(a: any, b: any): any
  
        function pow(a: any, b: any): any
  
        function shiftLeft(a: any, n: any): any
  
        function shiftRight(a: any, n: any): any
  
        function shl(a: any, n: any): any
  
        function shr(a: any, n: any): any
  
        function square(a: any): any
  
        function sub(a: any, b: any): any
  
        function toArray(s: any, radix: any): any
  
        function toLEBuff(a: any): any
  
        function toNumber(s: any): any
  
        function toRprBE(buff: any, o: any, e: any, n8: any): void
  
        function toRprLE(buff: any, o: any, e: any, n8: any): void
  
        function toString(a: any, radix: any): any
    }
  
    export namespace utils {
        function array2buffer(arr: any, sG: any): any
  
        function beBuff2int(buff: any): any
  
        function beInt2Buff(n: any, len: any): any
  
        function bitReverse(idx: any, bits: any): any
  
        function buffReverseBits(buff: any, eSize: any): void
  
        function buffer2array(buff: any, sG: any): any
  
        function leBuff2int(buff: any): any
  
        function leInt2Buff(n: any, len: any): any
  
        function log2(V: any): any
  
        function stringifyBigInts(o: any): any
  
        function stringifyFElements(F: any, o: any): any
  
        function unstringifyBigInts(o: any): any
  
        function unstringifyFElements(F: any, o: any): any
    }
  }