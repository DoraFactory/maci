/* Bilingual copy for the aMACI protocol explainer.
 * Content distilled from aMACI_EXTERNAL.md. Keys map to data-i18n attributes. */

window.PROTOCOL_I18N = {
  en: {
    'nav.subtitle': 'aMACI protocol explainer',
    'nav.back': '\u2190 Dashboard',
    footer: 'Local read-only verifier \u2014 no private keys, no transactions. Anyone can audit.',

    'hero.kicker': 'Protocol Explainer',
    'hero.title': 'aMACI: Anonymous, Anti-Collusion On-Chain Voting',
    'hero.lead':
      'aMACI (Anonymous MACI) extends the original MACI protocol: voters cast verifiable on-chain votes without revealing who they are \u2014 no wallet, no key management, no identity trail. This page walks through the protocol design, the infrastructure that runs it, and the trust boundaries under different configurations.',
    'hero.scroll': 'Scroll to explore \u2193',

    's1.title': 'Why on-chain voting is hard to get right',
    's1.lead':
      'On-chain voting must deliver two properties that pull against each other. The blockchain naturally provides the first; the second is subtle \u2014 and a transparent chain actively works against it.',
    's1.cardA.title': 'Blockchain guarantees',
    's1.cardA.body':
      'Results execute correctly and no message can be censored. As long as the contract logic is right, nobody can unilaterally forge an outcome or block a legitimate vote.',
    's1.cardB.title': 'Anti-collusion',
    's1.cardB.body':
      'A voter must NOT be able to credibly prove how they voted. If you can prove your vote, you can sell that proof \u2014 and bribery becomes a viable strategy.',
    's1.bribe1': 'Every vote is public on a transparent chain',
    's1.bribe2': '\u201cYou voted A\u201d is verifiable by anyone',
    's1.bribe3': 'Bribery becomes enforceable',

    's2.title': 'MACI\u2019s answer: a deniable key change',
    's2.lead':
      'MACI (Vitalik Buterin, 2019) resolves the tension: a voter can switch their voting key at any time, invalidating earlier messages \u2014 and the switch is invisible from outside. Publishing \u201cvote A\u201d proves nothing: the key may already have been rotated, silently.',
    's2.chainLabel': 'on-chain messages (encrypted)',
    's2.voided': 'invalidated',
    's2.keyMsg': 'enc(key change)',
    's2.briber': 'Was that the final vote? Impossible to tell.',
    's2.note':
      'One problem remains: in original MACI the voter\u2019s public key is registered openly on-chain. Even with encrypted votes, who participated stays visible \u2014 enough for targeted pressure or retaliation if the registered identity can be linked to a real person.',

    's3.title': 'aMACI\u2019s core move: deactivate & add-key',
    's3.lead':
      'aMACI replaces the simple key change with a stronger mechanism. A voter can anonymously deactivate their current account, then re-join as a cryptographically unlinkable new identity: holding the old key of a deactivated slot, they build a ZK proof \u2014 \u201cI hold a valid, unused deactivated key in the tree\u201d \u2014 without revealing which one, and register a brand-new voting key K_i.',
    's3.deactTree': 'Deactivate tree',
    's3.stateTree': 'State tree',
    's3.dkey': 'deactivated key',
    's3.nullifier': '+ nullifier: each deactivated key usable once',
    's3.replay': 'Replay',
    's3.cut':
      'The ZK proof\u2019s hiding property severs the link: no observer \u2014 not even the coordinator \u2014 can map the new K_i back to the deactivated key it came from.',
    's3.compare.maci':
      'chain records \u201caddress X \u2192 pubkey K_i\u201d \u2014 voter identity visible',
    's3.compare.amaci':
      'chain records \u201cvalid ZK proof \u2192 new pubkey K_i\u201d \u2014 voter identity hidden',

    's4.title': 'One round, five phases',
    's4.lead':
      'Click through the phases to see who does what. The contract is the source of truth throughout; the coordinator processes encrypted messages off-chain but every state change it makes must be proven on-chain.',
    's4.actor.voter': 'Voter',
    's4.actor.chain': 'aMACI contract',
    's4.actor.coord': 'Coordinator',
    's4.p0.name': 'Setup',
    's4.p1.name': 'Add-key',
    's4.p2.name': 'Vote',
    's4.p3.name': 'Tally',
    's4.p4.name': 'Result',
    's4.p0.desc':
      'The coordinator publishes its public key K_c. The contract initializes an empty state tree, stores the deactivate tree root (the verification anchor for later add-key proofs), and fixes the voting window T_start \u2192 T_end plus options and parameters.',
    's4.p1.desc':
      'Mandatory before voting: each voter obtains a deactivated key, generates a fresh voting key pair (k_i, K_i) locally, and submits an add-key ZK proof. On verification, K_i enters the state tree \u2014 an active, anonymous voting account.',
    's4.p2.desc':
      'The voter signs the vote with k_i, encrypts it to the coordinator\u2019s key K_c, and publishes it on-chain. Votes can be changed any time before T_end \u2014 last write wins, and nobody outside can tell whether a message was superseded.',
    's4.p3.desc':
      'After T_end, the coordinator decrypts all messages in on-chain order, applies last-write-wins per account, computes the final tally, and generates two ZK proofs: a process proof (\u201cI updated state correctly\u201d) and a tally proof (\u201cI counted correctly\u201d).',
    's4.p4.desc':
      'The contract independently recomputes the public input hash from on-chain data and verifies both proofs with its built-in verification keys. Only then is the tally accepted. Anyone can re-verify \u2014 that is exactly what this dashboard\u2019s Round Verification does.',
    's4.flow.setup': 'K_c \u00b7 deactivate root \u00b7 T_start/T_end',
    's4.flow.addkey': 'ZK proof + new K_i',
    's4.flow.vote': 'enc(sign(vote, k_i), K_c)',
    's4.flow.read': 'read all messages, decrypt with k_c',
    's4.flow.proofs': 'process proof + tally proof',
    's4.flow.verify': 'contract verifies proofs with built-in vkeys',

    's5.title': 'From protocol to infrastructure: V1 \u2192 V3',
    's5.lead':
      'The protocol defines what is valid; the infrastructure decides how much anonymity survives contact with real users. Our design evolved in three steps, each closing a linkage path.',
    's5.v1.box': 'User wallet address',
    's5.v1.desc':
      'V1 \u2014 Web3-native: the MACI key is derived from the user\u2019s chain address. Voting identity and on-chain identity are fully bound; who participated is plain to see. A gas station fixed costs, not anonymity.',
    's5.v2.box': 'User browser \u2014 same environment',
    's5.v2.session': 'login session (email)',
    's5.v2.desc':
      'V2 \u2014 Email login + Relay: no wallet needed, the relay broadcasts all transactions. But the ZK proof was built in the user\u2019s browser \u2014 login session and aMACI key shared one environment, so an attacker inside it could link identity to key.',
    's5.v3.boxA': 'User browser',
    's5.v3.isolated': 'isolated',
    's5.v3.desc':
      'V3 \u2014 Voting Sandbox (current): all key computation moves into an isolated runtime that holds no user session and never learns who the user is. The aMACI key is generated, used, and discarded inside the sandbox. The linkage path never exists.',
    's5.e2e.webapp':
      'Knows the email \u2014 receives only the E2E-encrypted option, never the plaintext choice.',
    's5.e2e.lock': 'E2E-encrypted option',
    's5.e2e.sandbox':
      'Sees the plaintext option and runs the protocol \u2014 never knows which email it serves.',

    's6.title': 'Trust model: who can learn what?',
    's6.lead':
      'Three services each hold one fragment of information. Toggle a coalition below and see what it could \u2014 and could not \u2014 reconstruct. The full chain email \u2192 deactivated key \u2192 K_i \u2192 vote is what an attacker would need.',
    's6.role.webapp': 'knows the email; the option is E2E-encrypted away from it',
    's6.role.relay': 'sees key-assignment timing; never sees an email',
    's6.role.operator': 'decrypts every vote; all keys are anonymous',
    's6.user': 'User actively cooperates (tries to reveal their voting key)',
    's6.node.vote': 'vote content',
    's6.link.never': 'never recorded \u2014 random assignment',
    's6.link.timing': 'timing correlation \u2014 probabilistic only',
    's6.link.zk': 'severed by ZK proof',
    's6.link.dec': 'decrypted by operator',
    's6.link.unknown': 'not observable',
    's6.v.none': 'Select one or more parties above to see what they could jointly infer.',
    's6.v.webapp':
      'Web App alone: knows who participated and when. No keys, no votes \u2014 the option left the browser E2E-encrypted.',
    's6.v.relay':
      'Relay/API alone: sees deactivated keys being handed out and K_i registrations \u2014 with no idea whose they are. Assignment is random and unrecorded.',
    's6.v.operator':
      'Operator alone: reads every vote in plaintext \u2014 every one cast by an anonymous key. No path to any identity.',
    's6.v.webapp_relay':
      'Scenario 1 \u2014 Web App + Relay/API: can attempt timing correlation (email active at T, key assigned at T\u2032). Probabilistic at best, defeated by concurrent voters, impossible to reconstruct after the fact \u2014 and still reveals no vote content.',
    's6.v.webapp_operator':
      'Web App + Operator: identity on one side, votes on the other \u2014 but the middle links (deactivated key, K_i) are missing entirely. Very limited overlap.',
    's6.v.relay_operator':
      'Relay/API + Operator: key timing plus vote content \u2014 but nothing connects either to a real identity.',
    's6.v.all':
      'Scenario 2 \u2014 full three-party coalition: email \u2192 (timing guess) \u2192 K_i \u2192 vote. The most complete attack possible, yet still probabilistic, still requires live cross-system monitoring during the vote, and can never be reconstructed afterwards. The larger the anonymity set, the less reliable it gets.',
    's6.v.user':
      'Scenarios 3/4 \u2014 even with the user cooperating: the voting key is generated and used inside the Voting Sandbox and never leaves it. There is no K_i for the user to hand over \u2014 and the overwrite mechanism makes any \u201cproof of vote\u201d unreliable anyway.',

    's7.title': 'Anonymity set: how strong in practice?',
    's7.lead':
      'The ZK guarantee is constant, but timing-correlation risk depends on how many people vote concurrently. The gap between the two curves is what trust configuration must cover. Drag the slider.',
    's7.crypto': 'Cryptographic anonymity (ZK proof) \u2014 ceiling',
    's7.timing': 'Timing-correlation risk \u2014 fades with scale',
    's7.effective': 'Effective anonymity \u2014 rises with set size',
    's7.gap': 'timing-correlation risk (the gap)',
    's7.ylabel': 'participation anonymity',
    's7.xlabel': 'anonymity set size (concurrent voters)',
    's7.scenario': 'Scenario',
    's7.risk': 'Timing risk',
    's7.config': 'Recommended setup',
    's7.scenarios': [
      'Board decision (\u22645 voters)',
      'Security council vote (~10)',
      'DAO quarterly budget (~60)',
      'Protocol governance (500+)',
      'National election (100k+)',
    ],
    's7.risks': [
      'Very high \u2014 near-certain correlation',
      'High',
      'Medium \u2014 narrows at peak hours',
      'Low',
      'Very low',
    ],
    's7.configs': [
      'Independent operator; disclose weak participation anonymity',
      'Independent operator (strongly advised)',
      'Standard, or independent operator',
      'Standard configuration',
      'Three-way independent (platform / operator / organizer split)',
    ],

    's8.title': 'Choosing a trust configuration',
    's8.lead':
      'Replacing wallets with email login introduced two platform services outside the protocol \u2014 that is the explicit price paid for zero Web3 friction. The configurable part is how many independent parties must collude to link identity to vote.',
    's8.th.config': 'Configuration',
    's8.th.collude': 'Parties needed to collude',
    's8.row1.name': 'Standard (Dora full-stack)',
    's8.row2.name': 'Independent operator',
    's8.row3.name': 'Three-way independent',
    's8.thirdparty': '3rd party',
    's8.opA': 'Operator A',
    's8.opB': 'Operator B',
    's8.final':
      'Whatever the configuration, the final guarantee lives on-chain: every tally is verified by ZK proofs inside the contract. No operator \u2014 honest or not \u2014 can forge a result without detection.',
    's8.cta': 'Verify a round yourself \u2192',
    's8.reading': 'Further reading',
  },

  zh: {
    'nav.subtitle': 'aMACI \u534f\u8bae\u52a8\u6548\u8bb2\u89e3',
    'nav.back': '\u2190 \u8fd4\u56de\u4eea\u8868\u76d8',
    footer: '\u672c\u5730\u53ea\u8bfb\u9a8c\u8bc1\u5668 \u2014 \u65e0\u79c1\u94a5\u3001\u65e0\u4ea4\u6613\uff0c\u4efb\u4f55\u4eba\u90fd\u53ef\u5ba1\u8ba1\u3002',

    'hero.kicker': '\u534f\u8bae\u8bb2\u89e3',
    'hero.title': 'aMACI\uff1a\u533f\u540d\u6297\u5171\u8c0b\u7684\u94fe\u4e0a\u6295\u7968',
    'hero.lead':
      'aMACI\uff08Anonymous MACI\uff09\u662f\u5bf9\u539f\u59cb MACI \u534f\u8bae\u7684\u6269\u5c55\uff1avoter \u65e0\u9700\u66b4\u9732\u8eab\u4efd\u5373\u53ef\u5b8c\u6210\u53ef\u9a8c\u8bc1\u7684\u94fe\u4e0a\u6295\u7968\uff0c\u65e0\u9700\u94b1\u5305\u3001\u65e0\u9700\u7ba1\u7406\u79c1\u94a5\u3001\u4e0d\u7559\u8eab\u4efd\u75d5\u8ff9\u3002\u672c\u9875\u9010\u6b65\u8bb2\u89e3\u534f\u8bae\u8bbe\u8ba1\u3001\u57fa\u7840\u8bbe\u65bd\u6f14\u8fdb\uff0c\u4ee5\u53ca\u4e0d\u540c\u4fe1\u4efb\u914d\u7f6e\u4e0b\u7684\u5b89\u5168\u8fb9\u754c\u3002',
    'hero.scroll': '\u5411\u4e0b\u6eda\u52a8\u63a2\u7d22 \u2193',

    's1.title': '\u94fe\u4e0a\u6295\u7968\u4e3a\u4ec0\u4e48\u96be\u4ee5\u505a\u5bf9',
    's1.lead':
      '\u94fe\u4e0a\u6295\u7968\u9700\u8981\u540c\u65f6\u6ee1\u8db3\u4e24\u4ef6\u4e92\u76f8\u5f20\u529b\u7684\u4e8b\u3002\u7b2c\u4e00\u4ef6\u662f\u533a\u5757\u94fe\u5929\u7136\u63d0\u4f9b\u7684\uff1b\u7b2c\u4e8c\u4ef6\u975e\u5e38\u5fae\u5999\u2014\u2014\u900f\u660e\u7684\u94fe\u53cd\u800c\u4f1a\u7834\u574f\u5b83\u3002',
    's1.cardA.title': '\u533a\u5757\u94fe\u4fdd\u8bc1',
    's1.cardA.body':
      '\u6267\u884c\u7ed3\u679c\u6b63\u786e\uff0c\u6d88\u606f\u4e0d\u88ab\u5ba1\u67e5\u3002\u53ea\u8981\u5408\u7ea6\u903b\u8f91\u6b63\u786e\uff0c\u4efb\u4f55\u4eba\u90fd\u65e0\u6cd5\u5355\u65b9\u9762\u4f2a\u9020\u7ed3\u679c\u6216\u5c4f\u853d\u5408\u6cd5\u6d88\u606f\u3002',
    's1.cardB.title': '\u6297\u5171\u8c0b',
    's1.cardB.body':
      '\u6295\u7968\u8005\u5fc5\u987b\u65e0\u6cd5\u5411\u7b2c\u4e09\u65b9\u53ef\u4fe1\u5730\u8bc1\u660e\u81ea\u5df1\u600e\u4e48\u6295\u7684\u7968\u3002\u5982\u679c\u80fd\u8bc1\u660e\uff0c\u5c31\u80fd\u51fa\u552e\u8fd9\u4e2a\u8bc1\u660e\u2014\u2014\u8d3f\u8d42\u5c31\u53d8\u5f97\u53ef\u884c\u3002',
    's1.bribe1': '\u900f\u660e\u94fe\u4e0a\u6bcf\u4e00\u7968\u90fd\u516c\u5f00\u53ef\u67e5',
    's1.bribe2': '\u4efb\u4f55\u4eba\u90fd\u80fd\u9a8c\u8bc1\u201c\u4f60\u6295\u4e86 A\u201d',
    's1.bribe3': '\u8d3f\u8d42\u53d8\u5f97\u53ef\u6267\u884c',

    's2.title': 'MACI \u7684\u7b54\u6848\uff1a\u53ef\u5426\u8ba4\u7684\u6362 key',
    's2.lead':
      'MACI\uff08Vitalik Buterin\uff0c2019\uff09\u89e3\u51b3\u4e86\u8fd9\u4e2a\u77db\u76fe\uff1a\u7528\u6237\u53ef\u4ee5\u968f\u65f6\u66f4\u6362\u6295\u7968\u5bc6\u94a5\uff0c\u4f7f\u4e4b\u524d\u7684\u6d88\u606f\u5931\u6548\uff0c\u800c\u8fd9\u4e2a\u64cd\u4f5c\u5bf9\u5916\u754c\u4e0d\u53ef\u89c1\u3002\u53d1\u5e03\u201c\u6295 A\u201d\u4ec0\u4e48\u4e5f\u8bc1\u660e\u4e0d\u4e86\uff1akey \u53ef\u80fd\u65e9\u5df2\u88ab\u6084\u6084\u6362\u6389\u3002',
    's2.chainLabel': '\u94fe\u4e0a\u6d88\u606f\uff08\u5168\u7a0b\u52a0\u5bc6\uff09',
    's2.voided': '\u5df2\u4f5c\u5e9f',
    's2.keyMsg': 'enc(\u6362 key)',
    's2.briber': '\u90a3\u662f\u6700\u7ec8\u6295\u7968\u5417\uff1f\u65e0\u4ece\u5224\u65ad\u3002',
    's2.note':
      '\u4f46\u8fd8\u6709\u4e00\u4e2a\u9057\u7559\u95ee\u9898\uff1a\u539f\u59cb MACI \u4e2d voter \u7684\u516c\u94a5\u662f\u516c\u5f00\u6ce8\u518c\u5230\u94fe\u4e0a\u7684\u3002\u5373\u4f7f\u6295\u7968\u5185\u5bb9\u52a0\u5bc6\uff0c\u201c\u8c01\u53c2\u4e0e\u4e86\u201d\u4ecd\u7136\u53ef\u89c1\u2014\u2014\u4e00\u65e6\u6ce8\u518c\u8eab\u4efd\u80fd\u5173\u8054\u5230\u771f\u5b9e\u8eab\u4efd\uff0c\u5b9a\u5411\u65bd\u538b\u548c\u4e8b\u540e\u8ffd\u8d23\u5c31\u6709\u4e86\u4f9d\u636e\u3002',

    's3.title': 'aMACI \u7684\u6838\u5fc3\u521b\u65b0\uff1adeactivate \u4e0e add-key',
    's3.lead':
      'aMACI \u7528\u66f4\u5f3a\u7684\u673a\u5236\u53d6\u4ee3\u7b80\u5355\u6362 key\uff1avoter \u53ef\u4ee5\u533f\u540d\u6ce8\u9500\u5f53\u524d\u8d26\u6237\uff0c\u518d\u4ee5\u4e00\u4e2a\u5bc6\u7801\u5b66\u4e0a\u5b8c\u5168\u4e0d\u53ef\u5173\u8054\u7684\u65b0\u8eab\u4efd\u91cd\u65b0\u53c2\u4e0e\u2014\u2014\u6301\u6709\u67d0\u4e2a\u5df2\u6ce8\u9500\u69fd\u4f4d\u7684\u65e7\u79c1\u94a5\uff0c\u6784\u9020 ZK proof\u201c\u6211\u6301\u6709 deactivate tree \u4e2d\u5408\u6cd5\u4e14\u672a\u4f7f\u7528\u7684 deactivated key\u201d\uff0c\u4f46\u4e0d\u6cc4\u9732\u662f\u54ea\u4e00\u4e2a\uff0c\u540c\u65f6\u6ce8\u518c\u5168\u65b0\u7684\u6295\u7968\u516c\u94a5 K_i\u3002',
    's3.deactTree': 'Deactivate tree',
    's3.stateTree': 'State tree',
    's3.dkey': 'deactivated key',
    's3.nullifier': '+ nullifier\uff1a\u6bcf\u4e2a deactivated key \u53ea\u80fd\u7528\u4e00\u6b21',
    's3.replay': '\u91cd\u64ad',
    's3.cut':
      'ZK proof \u7684\u9690\u85cf\u5c5e\u6027\u526a\u65ad\u4e86\u8fd9\u6761\u5173\u8054\uff1a\u4efb\u4f55\u89c2\u5bdf\u8005\u2014\u2014\u5305\u62ec coordinator\u2014\u2014\u90fd\u65e0\u6cd5\u4ece\u65b0\u7684 K_i \u53cd\u63a8\u51fa\u5b83\u5bf9\u5e94\u54ea\u4e2a deactivated key\u3002',
    's3.compare.maci':
      '\u94fe\u4e0a\u8bb0\u5f55\u201c\u5730\u5740 X \u2192 \u516c\u94a5 K_i\u201d\u2014\u2014voter \u8eab\u4efd\u53ef\u89c1',
    's3.compare.amaci':
      '\u94fe\u4e0a\u8bb0\u5f55\u201cZK proof \u5408\u6cd5 \u2192 \u65b0\u516c\u94a5 K_i\u201d\u2014\u2014voter \u8eab\u4efd\u4e0d\u53ef\u89c1',

    's4.title': '\u4e00\u8f6e\u6295\u7968\uff0c\u4e94\u4e2a\u9636\u6bb5',
    's4.lead':
      '\u70b9\u51fb\u5404\u9636\u6bb5\u67e5\u770b\u8c01\u5728\u505a\u4ec0\u4e48\u3002\u5408\u7ea6\u59cb\u7ec8\u662f\u4e8b\u5b9e\u6e90\uff1bcoordinator \u5728\u94fe\u4e0b\u5904\u7406\u52a0\u5bc6\u6d88\u606f\uff0c\u4f46\u5b83\u7684\u6bcf\u4e00\u6b65\u72b6\u6001\u53d8\u66f4\u90fd\u5fc5\u987b\u5728\u94fe\u4e0a\u51fa\u793a\u8bc1\u660e\u3002',
    's4.actor.voter': 'Voter',
    's4.actor.chain': 'aMACI \u5408\u7ea6',
    's4.actor.coord': 'Coordinator',
    's4.p0.name': 'Setup \u521d\u59cb\u5316',
    's4.p1.name': 'Add-key \u6ce8\u518c',
    's4.p2.name': 'Vote \u6295\u7968',
    's4.p3.name': 'Tally \u8ba1\u7968',
    's4.p4.name': 'Result \u7ed3\u679c',
    's4.p0.desc':
      'Coordinator \u516c\u5e03\u516c\u94a5 K_c\u3002\u5408\u7ea6\u521b\u5efa\u7a7a\u7684 state tree\uff0c\u5199\u5165 deactivate tree \u6839\u54c8\u5e0c\uff08\u540e\u7eed add-key proof \u7684\u9a8c\u8bc1\u57fa\u51c6\uff09\uff0c\u8bbe\u5b9a\u6295\u7968\u7a97\u53e3 T_start \u2192 T_end \u53ca\u9009\u9879\u53c2\u6570\u3002',
    's4.p1.desc':
      '\u6295\u7968\u524d\u7684\u5f3a\u5236\u524d\u63d0\uff1avoter \u83b7\u53d6\u4e00\u4e2a deactivated key\uff0c\u672c\u5730\u751f\u6210\u65b0\u7684\u6295\u7968\u5bc6\u94a5\u5bf9 (k_i, K_i)\uff0c\u63d0\u4ea4 add-key ZK proof\u3002\u9a8c\u8bc1\u901a\u8fc7\u540e K_i \u8fdb\u5165 state tree\u2014\u2014\u4e00\u4e2a\u6fc0\u6d3b\u4e14\u533f\u540d\u7684\u6295\u7968\u8d26\u6237\u3002',
    's4.p2.desc':
      'Voter \u7528 k_i \u7b7e\u540d\u6295\u7968\u6570\u636e\uff0c\u4ee5 K_c \u52a0\u5bc6\u540e\u4e0a\u94fe\u3002T_end \u4e4b\u524d\u53ef\u968f\u65f6\u6539\u7968\u2014\u2014\u540e\u5230\u4f18\u5148\uff08last-write-wins\uff09\uff0c\u5916\u754c\u65e0\u6cd5\u5f97\u77e5\u67d0\u6761\u6d88\u606f\u662f\u5426\u5df2\u88ab\u8986\u76d6\u3002',
    's4.p3.desc':
      'T_end \u4e4b\u540e\uff0ccoordinator \u6309\u94fe\u4e0a\u987a\u5e8f\u9010\u6761\u89e3\u5bc6\u6d88\u606f\uff0c\u6309\u8d26\u6237\u5e94\u7528 last-write-wins\uff0c\u8ba1\u7b97\u6700\u7ec8 tally\uff0c\u5e76\u751f\u6210\u4e24\u7c7b ZK proof\uff1aprocess proof\uff08\u201c\u6211\u6b63\u786e\u66f4\u65b0\u4e86\u72b6\u6001\u201d\uff09\u548c tally proof\uff08\u201c\u6211\u6b63\u786e\u7edf\u8ba1\u4e86\u7968\u6570\u201d\uff09\u3002',
    's4.p4.desc':
      '\u5408\u7ea6\u7528\u94fe\u4e0a\u5df2\u77e5\u6570\u636e\u72ec\u7acb\u91cd\u7b97\u516c\u5f00\u8f93\u5165 hash\uff0c\u7528\u5185\u7f6e verification key \u9a8c\u8bc1\u4e24\u4e2a proof\uff0c\u901a\u8fc7\u540e\u624d\u63a5\u53d7 tally\u3002\u4efb\u4f55\u4eba\u90fd\u53ef\u4ee5\u72ec\u7acb\u590d\u9a8c\u2014\u2014\u8fd9\u6b63\u662f\u672c\u4eea\u8868\u76d8 Round Verification \u505a\u7684\u4e8b\u3002',
    's4.flow.setup': 'K_c \u00b7 deactivate root \u00b7 T_start/T_end',
    's4.flow.addkey': 'ZK proof + \u65b0 K_i',
    's4.flow.vote': 'enc(sign(vote, k_i), K_c)',
    's4.flow.read': '\u8bfb\u53d6\u5168\u90e8\u6d88\u606f\uff0c\u7528 k_c \u89e3\u5bc6',
    's4.flow.proofs': 'process proof + tally proof',
    's4.flow.verify': '\u5408\u7ea6\u7528\u5185\u7f6e vkey \u9a8c\u8bc1 proof',

    's5.title': '\u4ece\u534f\u8bae\u5230\u57fa\u7840\u8bbe\u65bd\uff1aV1 \u2192 V3',
    's5.lead':
      '\u534f\u8bae\u5b9a\u4e49\u4ec0\u4e48\u662f\u5408\u6cd5\u7684\uff1b\u57fa\u7840\u8bbe\u65bd\u51b3\u5b9a\u533f\u540d\u6027\u5728\u771f\u5b9e\u7528\u6237\u9762\u524d\u8fd8\u5269\u591a\u5c11\u3002\u6211\u4eec\u7684\u8bbe\u8ba1\u7ecf\u8fc7\u4e09\u6b65\u6f14\u8fdb\uff0c\u6bcf\u4e00\u6b65\u90fd\u5173\u95ed\u4e00\u6761\u5173\u8054\u8def\u5f84\u3002',
    's5.v1.box': '\u7528\u6237\u94fe\u4e0a\u5730\u5740',
    's5.v1.desc':
      'V1 \u2014 Web3 \u539f\u751f\uff1aMACI key \u4ece\u7528\u6237\u94fe\u4e0a\u5730\u5740\u786e\u5b9a\u6027\u884d\u751f\uff0c\u6295\u7968\u8eab\u4efd\u4e0e\u94fe\u4e0a\u8eab\u4efd\u5b8c\u5168\u7ed1\u5b9a\uff0c\u8c01\u53c2\u4e0e\u4e86\u4e00\u76ee\u4e86\u7136\u3002Gas Station \u89e3\u51b3\u4e86\u6210\u672c\uff0c\u6ca1\u89e3\u51b3\u533f\u540d\u3002',
    's5.v2.box': '\u7528\u6237\u6d4f\u89c8\u5668 \u2014 \u540c\u4e00\u73af\u5883',
    's5.v2.session': '\u767b\u5f55 session\uff08email\uff09',
    's5.v2.desc':
      'V2 \u2014 \u90ae\u7bb1\u767b\u5f55 + Relay\uff1a\u65e0\u9700\u94b1\u5305\uff0cRelay \u4ee3\u4e3a\u5e7f\u64ad\u4ea4\u6613\u3002\u4f46 ZK proof \u5728\u7528\u6237\u6d4f\u89c8\u5668\u91cc\u6784\u9020\u2014\u2014\u767b\u5f55 session \u548c aMACI key \u51fa\u73b0\u5728\u540c\u4e00\u8ba1\u7b97\u73af\u5883\uff0c\u80fd\u8bbf\u95ee\u8be5\u73af\u5883\u7684\u653b\u51fb\u8005\u53ef\u4ee5\u5efa\u7acb\u8eab\u4efd\u4e0e key \u7684\u5173\u8054\u3002',
    's5.v3.boxA': '\u7528\u6237\u6d4f\u89c8\u5668',
    's5.v3.isolated': '\u9694\u79bb',
    's5.v3.desc':
      'V3 \u2014 Voting Sandbox\uff08\u5f53\u524d\u7248\u672c\uff09\uff1a\u6240\u6709\u4e0e key \u76f8\u5173\u7684\u8ba1\u7b97\u79fb\u5165\u4e00\u4e2a\u4e0d\u6301\u6709\u7528\u6237 session\u3001\u4e0d\u77e5\u9053\u7528\u6237\u662f\u8c01\u7684\u9694\u79bb\u8fd0\u884c\u65f6\u3002aMACI key \u5728 Sandbox \u5185\u751f\u6210\u3001\u4f7f\u7528\u3001\u4e22\u5f03\u2014\u2014\u5173\u8054\u4ece\u672a\u5b58\u5728\u8fc7\u3002',
    's5.e2e.webapp':
      '\u77e5\u9053 email\u2014\u2014\u53ea\u6536\u5230\u7aef\u5230\u7aef\u52a0\u5bc6\u540e\u7684\u9009\u9879\uff0c\u6c38\u8fdc\u770b\u4e0d\u5230\u660e\u6587\u9009\u62e9\u3002',
    's5.e2e.lock': '\u9009\u9879\u7aef\u5230\u7aef\u52a0\u5bc6',
    's5.e2e.sandbox':
      '\u770b\u5230\u660e\u6587\u9009\u9879\u5e76\u6267\u884c\u534f\u8bae\u2014\u2014\u6c38\u8fdc\u4e0d\u77e5\u9053\u670d\u52a1\u7684\u662f\u54ea\u4e2a email\u3002',

    's6.title': '\u4fe1\u4efb\u6a21\u578b\uff1a\u8c01\u80fd\u77e5\u9053\u4ec0\u4e48\uff1f',
    's6.lead':
      '\u4e09\u4e2a\u670d\u52a1\u5404\u6301\u4e00\u6bb5\u4fe1\u606f\u3002\u52fe\u9009\u4e0b\u65b9\u7684\u5408\u8c0b\u7ec4\u5408\uff0c\u770b\u770b\u5b83\u4eec\u80fd\u2014\u2014\u4ee5\u53ca\u4e0d\u80fd\u2014\u2014\u91cd\u5efa\u4ec0\u4e48\u3002\u653b\u51fb\u8005\u9700\u8981\u7684\u662f\u5b8c\u6574\u94fe\u8def email \u2192 deactivated key \u2192 K_i \u2192 \u6295\u7968\u5185\u5bb9\u3002',
    's6.role.webapp': '\u77e5\u9053 email\uff1b\u9009\u9879\u7ecf E2E \u52a0\u5bc6\uff0c\u770b\u4e0d\u5230\u660e\u6587',
    's6.role.relay': '\u77e5\u9053 key \u5206\u914d\u65f6\u5e8f\uff1b\u4ece\u4e0d\u63a5\u89e6 email',
    's6.role.operator': '\u89e3\u5bc6\u6240\u6709\u6295\u7968\uff1b\u6240\u6709 key \u90fd\u662f\u533f\u540d\u7684',
    's6.user': '\u7528\u6237\u4e3b\u52a8\u914d\u5408\uff08\u8bd5\u56fe\u51fa\u793a\u81ea\u5df1\u7684 voting key\uff09',
    's6.node.vote': '\u6295\u7968\u5185\u5bb9',
    's6.link.never': '\u4ece\u672a\u8bb0\u5f55 \u2014 \u968f\u673a\u5206\u914d',
    's6.link.timing': '\u65f6\u95f4\u5173\u8054 \u2014 \u4ec5\u6982\u7387\u6027',
    's6.link.zk': '\u88ab ZK proof \u526a\u65ad',
    's6.link.dec': 'operator \u53ef\u89e3\u5bc6',
    's6.link.unknown': '\u4e0d\u53ef\u89c2\u6d4b',
    's6.v.none': '\u52fe\u9009\u4e0a\u65b9\u4e00\u4e2a\u6216\u591a\u4e2a\u89d2\u8272\uff0c\u67e5\u770b\u5b83\u4eec\u8054\u5408\u8d77\u6765\u80fd\u63a8\u65ad\u51fa\u4ec0\u4e48\u3002',
    's6.v.webapp':
      '\u4ec5 Web App\uff1a\u77e5\u9053\u8c01\u5728\u4ec0\u4e48\u65f6\u5019\u53c2\u4e0e\u4e86\u3002\u6ca1\u6709 key\u3001\u6ca1\u6709\u6295\u7968\u5185\u5bb9\u2014\u2014\u9009\u9879\u79bb\u5f00\u6d4f\u89c8\u5668\u65f6\u5df2\u662f E2E \u5bc6\u6587\u3002',
    's6.v.relay':
      '\u4ec5 Relay/API\uff1a\u770b\u5230 deactivated key \u88ab\u53d6\u8d70\u3001K_i \u88ab\u6ce8\u518c\u2014\u2014\u4f46\u4e0d\u77e5\u9053\u662f\u8c01\u7684\u3002\u5206\u914d\u968f\u673a\u4e14\u4e0d\u7559\u8bb0\u5f55\u3002',
    's6.v.operator':
      '\u4ec5 Operator\uff1a\u80fd\u8bfb\u5230\u6bcf\u4e00\u7968\u7684\u660e\u6587\u2014\u2014\u4f46\u6bcf\u4e00\u7968\u90fd\u6765\u81ea\u533f\u540d key\uff0c\u6ca1\u6709\u4efb\u4f55\u901a\u5411\u8eab\u4efd\u7684\u8def\u5f84\u3002',
    's6.v.webapp_relay':
      '\u573a\u666f\u4e00 \u2014 Web App + Relay/API\uff1a\u53ef\u5c1d\u8bd5\u65f6\u95f4\u5173\u8054\uff08email \u5728 T \u65f6\u523b\u6d3b\u8dc3\uff0ckey \u5728 T\u2032 \u88ab\u5206\u914d\uff09\u3002\u81f3\u591a\u662f\u6982\u7387\u6027\u63a8\u65ad\uff0c\u5e76\u53d1\u6295\u7968\u8d8a\u591a\u8d8a\u4e0d\u53ef\u9760\uff0c\u65e0\u6cd5\u4e8b\u540e\u91cd\u5efa\u2014\u2014\u4e14\u4f9d\u7136\u5f97\u4e0d\u5230\u4efb\u4f55\u6295\u7968\u5185\u5bb9\u3002',
    's6.v.webapp_operator':
      'Web App + Operator\uff1a\u4e00\u8fb9\u662f\u8eab\u4efd\uff0c\u4e00\u8fb9\u662f\u6295\u7968\u5185\u5bb9\u2014\u2014\u4f46\u4e2d\u95f4\u73af\u8282\uff08deactivated key\u3001K_i\uff09\u5b8c\u5168\u7f3a\u5931\uff0c\u4fe1\u606f\u4ea4\u96c6\u6781\u5176\u6709\u9650\u3002',
    's6.v.relay_operator':
      'Relay/API + Operator\uff1akey \u65f6\u5e8f\u52a0\u6295\u7968\u5185\u5bb9\u2014\u2014\u4f46\u6ca1\u6709\u4efb\u4f55\u4e1c\u897f\u80fd\u628a\u5b83\u4eec\u8fde\u5230\u771f\u5b9e\u8eab\u4efd\u3002',
    's6.v.all':
      '\u573a\u666f\u4e8c \u2014 \u4e09\u65b9\u5168\u5408\u8c0b\uff1aemail \u2192\uff08\u65f6\u95f4\u731c\u6d4b\uff09\u2192 K_i \u2192 \u6295\u7968\u5185\u5bb9\u3002\u8fd9\u662f\u4fe1\u606f\u6700\u5b8c\u6574\u7684\u653b\u51fb\u7ec4\u5408\uff0c\u4f46\u4ecd\u662f\u6982\u7387\u6027\u7684\uff0c\u5fc5\u987b\u5728\u7528\u6237\u6295\u7968\u5f53\u4e0b\u8de8\u7cfb\u7edf\u5b9e\u65f6\u76d1\u63a7\uff0c\u65e0\u6cd5\u4e8b\u540e\u91cd\u5efa\u3002\u533f\u540d\u96c6\u8d8a\u5927\uff0c\u63a8\u65ad\u8d8a\u4e0d\u53ef\u9760\u3002',
    's6.v.user':
      '\u573a\u666f\u4e09/\u56db \u2014 \u5373\u4f7f\u7528\u6237\u4e3b\u52a8\u914d\u5408\uff1avoting key \u5728 Voting Sandbox \u5185\u751f\u6210\u548c\u4f7f\u7528\uff0c\u4ece\u672a\u79bb\u5f00\u8fc7 Sandbox\u2014\u2014\u7528\u6237\u624b\u91cc\u6839\u672c\u6ca1\u6709 K_i \u53ef\u4ee5\u4ea4\u51fa\u3002\u4e14\u8986\u76d6\u673a\u5236\u672c\u8eab\u5c31\u8ba9\u4efb\u4f55\u201c\u5df2\u6295\u8bc1\u660e\u201d\u4e0d\u53ef\u4fe1\u3002',

    's7.title': '\u533f\u540d\u96c6\uff1a\u5b9e\u9645\u533f\u540d\u6027\u6709\u591a\u5f3a\uff1f',
    's7.lead':
      'ZK \u4fdd\u8bc1\u662f\u6052\u5b9a\u7684\uff0c\u4f46\u65f6\u95f4\u5173\u8054\u98ce\u9669\u53d6\u51b3\u4e8e\u540c\u65f6\u6bb5\u6709\u591a\u5c11\u4eba\u6295\u7968\u3002\u4e24\u6761\u66f2\u7ebf\u4e4b\u95f4\u7684\u5dee\u8ddd\uff0c\u5c31\u662f\u9700\u8981\u7528\u4fe1\u4efb\u914d\u7f6e\u6765\u5f25\u8865\u7684\u7a7a\u95f4\u3002\u62d6\u52a8\u6ed1\u5757\u8bd5\u8bd5\u3002',
    's7.crypto': '\u5bc6\u7801\u5b66\u533f\u540d\u4fdd\u8bc1\uff08ZK proof\uff09\u2014 \u4e0a\u9650',
    's7.timing': '\u65f6\u95f4\u5173\u8054\u98ce\u9669 \u2014 \u968f\u89c4\u6a21\u6d88\u9000',
    's7.effective': '\u6709\u6548\u533f\u540d\u6027 \u2014 \u968f\u89c4\u6a21\u4e0a\u5347',
    's7.gap': '\u65f6\u95f4\u5173\u8054\u98ce\u9669\uff08\u5dee\u8ddd\uff09',
    's7.ylabel': '\u53c2\u4e0e\u533f\u540d\u6027',
    's7.xlabel': '\u533f\u540d\u96c6\u5927\u5c0f\uff08\u540c\u65f6\u6bb5\u6295\u7968\u4eba\u6570\uff09',
    's7.scenario': '\u4ee3\u8868\u573a\u666f',
    's7.risk': '\u65f6\u95f4\u5173\u8054\u98ce\u9669',
    's7.config': '\u63a8\u8350\u914d\u7f6e',
    's7.scenarios': [
      '\u673a\u6784\u5185\u90e8\u51b3\u7b56\uff08\u22645 \u4eba\uff09',
      '\u5b89\u5168\u59d4\u5458\u4f1a\u7d27\u6025\u8868\u51b3\uff08~10 \u4eba\uff09',
      'DAO \u5b63\u5ea6\u9884\u7b97\uff08~60 \u4eba\uff09',
      '\u534f\u8bae\u6cbb\u7406\u5347\u7ea7\uff08500 \u4eba+\uff09',
      '\u5c0f\u56fd\u8bae\u4f1a\u5927\u9009\uff0810 \u4e07\u4eba+\uff09',
    ],
    's7.risks': [
      '\u6781\u9ad8\uff08\u8fd1\u786e\u5b9a\uff09',
      '\u9ad8',
      '\u4e2d\uff08\u9ad8\u5cf0\u671f\u6536\u7a84\uff09',
      '\u4f4e',
      '\u6781\u4f4e',
    ],
    's7.configs': [
      '\u72ec\u7acb operator\uff1b\u987b\u5411\u53c2\u4e0e\u65b9\u8bf4\u660e\u53c2\u4e0e\u533f\u540d\u6027\u8f83\u5f31',
      '\u72ec\u7acb operator\uff08\u5f3a\u70c8\u5efa\u8bae\uff09',
      '\u6807\u51c6\u914d\u7f6e\u6216\u72ec\u7acb operator',
      '\u6807\u51c6\u914d\u7f6e',
      '\u4e09\u65b9\u72ec\u7acb\uff08\u5e73\u53f0 / Operator / \u53d1\u8d77\u65b9\u5206\u79bb\uff09',
    ],

    's8.title': '\u9009\u62e9\u4fe1\u4efb\u914d\u7f6e',
    's8.lead':
      '\u7528\u90ae\u7bb1\u767b\u5f55\u66ff\u6362\u94b1\u5305\uff0c\u5f15\u5165\u4e86\u4e24\u4e2a\u534f\u8bae\u5916\u7684\u5e73\u53f0\u670d\u52a1\u2014\u2014\u8fd9\u662f\u4e3a\u96f6 Web3 \u95e8\u69db\u4ed8\u51fa\u7684\u660e\u786e\u4ee3\u4ef7\u3002\u53ef\u914d\u7f6e\u7684\u662f\uff1a\u8981\u628a\u8eab\u4efd\u548c\u6295\u7968\u5173\u8054\u8d77\u6765\uff0c\u9700\u8981\u591a\u5c11\u4e2a\u72ec\u7acb\u4e3b\u4f53\u540c\u65f6\u5171\u8c0b\u3002',
    's8.th.config': '\u914d\u7f6e',
    's8.th.collude': '\u5173\u8054\u8eab\u4efd\u4e0e\u6295\u7968\u9700\u51e0\u65b9\u5171\u8c0b',
    's8.row1.name': '\u6807\u51c6\u914d\u7f6e\uff08Dora \u5168\u6808\u8fd0\u8425\uff09',
    's8.row2.name': '\u72ec\u7acb Operator',
    's8.row3.name': '\u4e09\u65b9\u72ec\u7acb',
    's8.thirdparty': '\u7b2c\u4e09\u65b9',
    's8.opA': '\u72ec\u7acb\u8fd0\u8425\u65b9 A',
    's8.opB': '\u72ec\u7acb\u8fd0\u8425\u65b9 B',
    's8.final':
      '\u65e0\u8bba\u54ea\u79cd\u914d\u7f6e\uff0c\u6700\u7ec8\u4fdd\u8bc1\u90fd\u5728\u94fe\u4e0a\uff1a\u6240\u6709 tally \u7ed3\u679c\u7531 ZK proof \u5728\u5408\u7ea6\u4e2d\u9a8c\u8bc1\u3002\u65e0\u8bba operator \u662f\u8c01\uff0c\u90fd\u65e0\u6cd5\u5728\u4e0d\u88ab\u53d1\u73b0\u7684\u60c5\u51b5\u4e0b\u4f2a\u9020\u7ed3\u679c\u3002',
    's8.cta': '\u4eb2\u81ea\u9a8c\u8bc1\u4e00\u4e2a\u8f6e\u6b21 \u2192',
    's8.reading': '\u5ef6\u4f38\u9605\u8bfb',
  },
};
