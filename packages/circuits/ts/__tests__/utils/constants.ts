export const STATE_TREE_ARITY = 2;
export const STATE_TREE_SUBDEPTH = 2;
export const VOTE_OPTION_TREE_ARITY = 5;
export const MESSAGE_BATCH_SIZE = 20;

export const STATE_TREE_DEPTH = 10;
export const voiceCreditBalance = 100n;
export const duration = 30;

export const treeDepths = {
  tallyProcessingStateTreeDepth: 5,
  voteOptionTreeDepth: 2,
  stateTreeDepth: 10
};

export const messageBatchSize = 20;

export const maxVoteOptions = BigInt(VOTE_OPTION_TREE_ARITY ** treeDepths.voteOptionTreeDepth);

export const maxSignups = BigInt(STATE_TREE_ARITY ** treeDepths.stateTreeDepth);

export const L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
