## Detail

Bug reports from [https://dorahacks.io/buidl/18047](https://dorahacks.io/buidl/18047)(MAJOR) & [https://dorahacks.io/buidl/18041](https://dorahacks.io/buidl/18041)(MINOR)

## Feedback

### CVE-001: Missing Randomness Validation

> Not deal with

For addNewKey proof, the voter user has the responsibility and motivation to choose a "sufficiently random" random number to make the rerandomization process more unpredictable. It seems unnecessary to increase randomness by limiting the minimum value.

### CVE-002: Insufficient Public Key Validation

> Not deal with

The coordPubKey parameter in the addNewKey proof is constrained by the contract (by generating an inputHasher), which is sufficient to ensure the correctness of the coordPubKey.

> In addition, although we do not intend to add constraints, we hope to understand the specific implementation of PointOnCurve and PrimeOrderPoint.

### CVE-003: Weak Nullifier Construction

> Not deal with

The nullifier is designed to be a simple, deterministic hash, so that it can be determined at the contract level that the user's request to repeat the nullifier can be rejected.

### CVE-004: Batch Size Constraints

> Not deal with

BatchSize is a parameter in the circuit compile stage, not a user input parameter, and does not require excessive judgment restrictions.

> In addition, the batchSize in practical application circuits may be in the range of 5 to 500

### CVE-005: Message Chain Verification Weakness

> MINOR Followed

Judgment on isEmptyMsg:

The circuit constrains the coordinator to provide a complete and correct set of messages through the batchStartHash - batchEndHash input in the contract. Each message is connected to the previous one to form a complete hash chain.
When processing to the end of a message, there may be a situation where a set of messages is not satisfied. In this case, those empty messages must be skipped when calculating the next hash.

If the coordinator wants to do evil at this step, he must create a message that can be detected by isEmptyMsg and correctly parsed, so as to secretly insert a voting information that does not belong to the current round into the aMACI round without breaking the hash chain.
In fact, as long as the value of any piece of information in the msg is restricted (it must be 0), the coordinator cannot generate a verifiable and signed reasonable message.

Therefore, it seems that stricter judgments are not necessary at present, even if it does increase safety.

### CVE-006: State Transition Constraint Gap

> Not deal with

I don't quite understand where the problem lies with the state transitions. The current state transitions in the circuit have been checked to be sufficiently constrained.

### CVE-007: Vote Count Overflow

> INFO Followed

In the circuit, by some simple mathematical means, the user's SUM (votes ^ 2) and SUM (Votes) are respectively stored in the high and low digits of a number.

In actual products, the number of votes is generally estimated not to exceed MAX_VOTE_COUNT by constraining the number of users and user voice credits, but if these two parameters are not set reasonably, the circuit may have an overflow problem.

The proposed method cannot effectively solve this problem. We temporarily reserve the change plan and still control it by controlling the voting size of specific rounds.
