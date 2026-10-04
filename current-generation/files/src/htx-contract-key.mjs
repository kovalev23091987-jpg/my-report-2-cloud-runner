// HTX names are opaque identifiers. Script and a numeric prefix do not
// determine the asset class; the official contract catalog does.
export function isExactHtxUsdtSwapKey(value) {
 return typeof value==='string' && /^[^\s\p{C}/\\?#-]{1,64}-USDT$/u.test(value);
}

