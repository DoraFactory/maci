/**
 * Rebuild the on-chain MSG_HASHES cumulative hash chain from indexed messages.
 *
 * Contract logic (execute_publish_message):
 *   MSG_HASHES[0] = 0                      (set in instantiate)
 *   for each message i (0-indexed):
 *     old = MSG_HASHES[i]
 *     new = hash_message_and_enc_pub_key(message, encPubKey, old)
 *     MSG_HASHES[i+1] = new
 *
 * hash_message_and_enc_pub_key(msg, encPub, prev):
 *   m_hash  = hash5(msg.data[0..5])
 *   n_hash  = hash5(msg.data[5..10])
 *   return   hash5([m_hash, n_hash, encPub.x, encPub.y, prev])
 *   ≡ hash13([msg.data[0..10], encPub.x, encPub.y, prev])
 *
 * Indexer format (PublishMessageEvent):
 *   message   → JSON array of 10 decimal BigInt strings, e.g. "[123,456,…]"
 *   encPubKey → two decimal BigInts separated by comma, e.g. "12345,67890"
 *   msgChainLength → the chain-length value BEFORE this message was appended
 *                    (i.e. the message has index msgChainLength in the 0-based array)
 */

import { hash13 } from './poseidon.js';
import type { IndexedMessage } from './indexer.js';

export type { IndexedMessage };

/** Parse the 10-element message data array from the indexer's JSON string */
function parseMessageData(raw: string): bigint[] {
  let arr: unknown[];
  try {
    arr = JSON.parse(raw) as unknown[];
  } catch {
    throw new Error(`Invalid message JSON: ${raw.slice(0, 80)}`);
  }
  if (!Array.isArray(arr) || arr.length !== 10) {
    throw new Error(`Expected 10-element message array, got ${arr?.length}`);
  }
  return arr.map((v) => BigInt(String(v)));
}

/** Parse the encPubKey string from the indexer.
 *
 * The contract emits: format!("{:?},{:?}", x.to_string(), y.to_string())
 * Rust's {:?} for String adds surrounding double-quotes: "12345","67890"
 * We strip those quotes before converting to BigInt.
 */
function parseEncPubKey(raw: string): [bigint, bigint] {
  const stripQuotes = (s: string) => s.trim().replace(/^"+|"+$/g, '');
  const parts = raw.split(',');
  if (parts.length !== 2) {
    throw new Error(`Invalid encPubKey format: ${raw.slice(0, 80)}`);
  }
  return [BigInt(stripQuotes(parts[0])), BigInt(stripQuotes(parts[1]))];
}

/**
 * Compute hash_message_and_enc_pub_key — aligned with SDK's hash13.
 *
 * hash13([data[0..10], encPub.x, encPub.y, prev])
 * = hash5(hash5(data[0..5]), hash5(data[5..10]), encPub.x, encPub.y, prev)
 */
function hashMessageAndEncPubKey(
  data: bigint[],
  encPub: [bigint, bigint],
  prev: bigint
): bigint {
  return hash13([...data, encPub[0], encPub[1], prev]);
}

/**
 * Rebuild the full MSG_HASHES chain.
 *
 * @param messages - All indexed messages for the round, ordered by msgChainLength ASC.
 * @returns An array where result[i] = MSG_HASHES[i].
 *          result[0] = 0n  (initial value)
 *          result[i+1] = hash(messages[i], encPub[i], result[i])
 */
export function buildMsgHashChain(messages: IndexedMessage[]): bigint[] {
  const sorted = [...messages].sort((a, b) => a.msgChainLength - b.msgChainLength);

  const chain: bigint[] = [0n]; // MSG_HASHES[0] = 0

  for (const msg of sorted) {
    const idx = msg.msgChainLength; // should equal chain.length - 1
    if (chain.length !== idx + 1) {
      throw new Error(
        `MSG_HASHES gap: expected index ${chain.length - 1}, got msgChainLength=${idx}. ` +
          'Indexer data may be incomplete.'
      );
    }
    const data = parseMessageData(msg.message);
    const encPub = parseEncPubKey(msg.encPubKey);
    const prev = chain[idx];
    chain.push(hashMessageAndEncPubKey(data, encPub, prev));
  }

  return chain; // chain[i] = MSG_HASHES[i]
}

/**
 * Given the total message count (msgChainLength) and batch size, compute the
 * batchStart / batchEnd indices for each processMessage call.
 *
 * The contract processes batches from END → START:
 *   batch_start_index = ((N - processed - 1) / B) * B
 *   batch_end_index   = min(batch_start_index + B, N)
 *
 * Returns ordered list matching the order processMessage calls were submitted
 * (i.e. index 0 = first call, which covers the LAST batch in the message list).
 */
export function computeProcessBatches(
  totalMessages: number,
  batchSize: number
): Array<{ batchStart: number; batchEnd: number }> {
  const batches: Array<{ batchStart: number; batchEnd: number }> = [];
  let processed = 0;
  while (processed < totalMessages) {
    const batchStart =
      Math.floor((totalMessages - processed - 1) / batchSize) * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, totalMessages);
    batches.push({ batchStart, batchEnd });
    processed += batchSize;
  }
  return batches;
}
