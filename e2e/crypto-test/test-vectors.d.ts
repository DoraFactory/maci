/**
 * Type definitions for crypto test vectors
 *
 * Note: While TypeScript types show many fields as optional,
 * specific test_type values require certain fields to be present.
 * The test code asserts these requirements at runtime.
 */

export interface CryptoTestVector {
  name: string;
  description: string;
  test_type:
    | 'keypair'
    | 'keypair_comparison'
    | 'ecdh'
    | 'pack'
    | 'tree'
    | 'rerandomize'
    | 'amaci_static_random_key'
    | 'amaci_encrypt'
    | 'amaci_rerandomize'
    | 'amaci_deactivate_root';
  data: {
    // Keypair test data (required for test_type === 'keypair')
    seed?: string;
    priv_key?: string;
    pub_key?: {
      x: string;
      y: string;
    };
    formatted_priv_key?: string;
    packed_pub_key?: string;

    // Keypair comparison test data (required for test_type === 'keypair_comparison')
    keys_keypair?: {
      priv_key: string;
      pub_key: {
        x: string;
        y: string;
      };
      formatted_priv_key: string;
    };
    keypair?: {
      priv_key: string;
      pub_key: {
        x: string;
        y: string;
      };
      formatted_priv_key: string;
      commitment: string;
    };
    comparison?: {
      pub_key_match: boolean;
      formatted_priv_key_match: boolean;
      priv_key_match: boolean;
    };
    input_bytes?: string;

    // ECDH test data (required for test_type === 'ecdh')
    // keypair1, keypair2, and shared_key are required
    keypair1?: {
      priv_key: string;
      pub_key: {
        x: string;
        y: string;
      };
      formatted_priv_key?: string;
    };
    keypair2?: {
      priv_key: string;
      pub_key: {
        x: string;
        y: string;
      };
      formatted_priv_key?: string;
    };
    shared_key?: {
      x: string;
      y: string;
    };
    shared_key_reciprocal?: {
      x: string;
      y: string;
    };
    shared_key_with_public_key?: {
      x: string;
      y: string;
    };
    shared_key_with_public_key_reciprocal?: {
      x: string;
      y: string;
    };
    consistency_check?: {
      keys_vs_keypair?: boolean;
      method_vs_method?: boolean;
    };
    symmetry_check?: boolean;

    // Pack test data (required for test_type === 'pack')
    input?: {
      nonce: string;
      state_idx: string;
      vo_idx: string;
      new_votes: string;
      salt?: string;
    };
    packed?: string;
    unpacked?: {
      nonce: string;
      state_idx: string;
      vo_idx: string;
      new_votes: string;
    };

    // Tree test data (required for test_type === 'tree')
    degree?: number;
    depth?: number;
    zero?: string;
    leaves?: string[];
    root?: string;

    // Rerandomize test data (required for test_type === 'rerandomize')
    ciphertext?: {
      c1: {
        x: string;
        y: string;
      };
      c2: {
        x: string;
        y: string;
      };
      x_increment: string;
    };
    random_val?: string;
    rerandomized?: {
      c1: {
        x: string;
        y: string;
      };
      c2: {
        x: string;
        y: string;
      };
      x_increment: string;
    };

    // AMACI static random key test data (required for test_type === 'amaci_static_random_key')
    operator_seed?: string;
    operator_priv_key?: string;
    operator_pub_key?: {
      x: string;
      y: string;
    };
    operator_formatted_priv_key?: string;
    salt?: string;
    keys?: {
      [index: string]: string;
    };

    // AMACI encrypt test data (required for test_type === 'amaci_encrypt')
    is_odd?: boolean;
    random_key?: string;

    // AMACI rerandomize test data (required for test_type === 'amaci_rerandomize')
    // original_ciphertext, random_val, and rerandomized are required for this test type
    original_ciphertext?: {
      c1: {
        x: string;
        y: string;
      };
      c2: {
        x: string;
        y: string;
      };
      x_increment: string;
    };
    rerandomized?: {
      d1: {
        x: string;
        y: string;
      };
      d2: {
        x: string;
        y: string;
      };
    };

    // AMACI deactivate root test data (required for test_type === 'amaci_deactivate_root')
    coordinator_seed?: string;
    coordinator_pub_key?: {
      x: string;
      y: string;
    };
    accounts?: Array<{
      x: string;
      y: string;
    }>;
    state_tree_depth?: number;
    tree_depth?: number;
    tree_degree?: number;
    deactivates?: Array<{
      c1_x: string;
      c1_y: string;
      c2_x: string;
      c2_y: string;
      shared_key_hash: string;
    }>;
  };
}
