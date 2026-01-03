/**
 * Type definitions for crypto test vectors
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
    | 'amaci_rerandomize';
  data: {
    // Keypair test data
    seed?: string;
    priv_key?: string;
    pub_key?: {
      x: string;
      y: string;
    };
    formatted_priv_key?: string;
    packed_pub_key?: string;

    // Keypair comparison test data
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

    // ECDH test data
    keypair1?: {
      priv_key: string;
      pub_key: {
        x: string;
        y: string;
      };
    };
    keypair2?: {
      priv_key: string;
      pub_key: {
        x: string;
        y: string;
      };
    };
    shared_key?: {
      x: string;
      y: string;
    };
    shared_key_reciprocal?: {
      x: string;
      y: string;
    };

    // Pack test data
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

    // Tree test data
    degree?: number;
    depth?: number;
    zero?: string;
    leaves?: string[];
    root?: string;

    // Rerandomize test data (pub_key is also used here, but in different context)
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
      d1: {
        x: string;
        y: string;
      };
      d2: {
        x: string;
        y: string;
      };
    };

    // AMACI static random key test data
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

    // AMACI encrypt test data
    is_odd?: boolean;
    random_key?: string;

    // AMACI rerandomize test data
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
  };
}
