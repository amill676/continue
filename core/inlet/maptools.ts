/**
 * Compresses an example by limiting the length of lists while preserving structure
 * @param example The example to compress
 * @param listLen The maximum length of subsequent lists
 * @param topListLen The maximum length of the first list encountered
 * @param seenList Whether we've already processed a list (internal tracking)
 * @returns The compressed example
 */
export function compressExample(
    example: any,
    listLen: number = 5,
    topListLen: number = 5,
    seenList: boolean = false
): any {
    // Handle dictionary/object case
    if (example && typeof example === 'object' && !Array.isArray(example)) {
        return Object.fromEntries(
            Object.entries(example).map(([k, v]) => [
                k,
                compressExample(v, listLen, topListLen, seenList)
            ])
        );
    }
    // Handle array case
    else if (Array.isArray(example)) {
        const lenLimit = seenList ? listLen : topListLen;
        return example
            .slice(0, lenLimit)
            .map(v => compressExample(v, listLen, topListLen, true));
    }
    // Base case: return primitive values as-is
    return example;
}
