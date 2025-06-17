// 导入maci-sdk的功能
import {
	MaciClient,
	genSignerFromKey,
	genSignerFromMnemonic,
} from '@dorafactory/maci-sdk';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';

// 扩展window类型定义
interface Window {
	MaciBridge: {
		// 基础方法
		initialize: (config: any) => Promise<void>;
		getMaciKeypair: () => Promise<any>;
		getMaciPubkey: () => Promise<any>;
		getAddress: (signer?: any) => Promise<string>;

		// Signer创建方法
		genSignerFromKey: (key: string) => Promise<any>;
		genSignerFromMnemonic: (mnemonic: string) => Promise<any>;

		// 密钥相关方法
		genKeypairFromSign: (params?: any) => Promise<any>;
		packMaciPubkey: (pubkey?: any) => Promise<any>;
		unpackMaciPubkey: (pubkey: string) => Promise<any>;

		// 轮次相关方法
		getRounds: (after?: string, limit?: number) => Promise<any>;
		getRoundInfo: (params: { contractAddress: string }) => Promise<any>;
		getRoundCircuitType: (params: {
			contractAddress: string;
		}) => Promise<any>;
		queryRoundIsQv: (params: { contractAddress: string }) => Promise<any>;
		queryRoundBalance: (params: {
			contractAddress: string;
		}) => Promise<any>;

		// 用户状态相关方法
		getStateIdxInc: (params: {
			contractAddress: string;
			address?: string;
		}) => Promise<any>;
		getVoiceCreditBalance: (params: {
			contractAddress: string;
			stateIdx?: number;
		}) => Promise<any>;
		getStateIdxByPubKey: (params: {
			contractAddress: string;
			pubKey?: any;
		}) => Promise<any>;

		// 投票相关方法
		signup: (params: any) => Promise<any>;
		vote: (params: any) => Promise<any>;
		deactivate: (params: any) => Promise<any>;

		// 费用相关方法
		feegrantAllowance: (params: {
			contractAddress: string;
			address?: string;
		}) => Promise<any>;
		hasFeegrant: (params: {
			contractAddress: string;
			address?: string;
		}) => Promise<boolean>;

		// 白名单相关方法
		queryWhitelistBalanceOf: (params: any) => Promise<string>;
		isWhitelisted: (params: {
			contractAddress: string;
			address?: string;
		}) => Promise<boolean>;
		getOracleWhitelistConfig: (params: {
			contractAddress: string;
		}) => Promise<any>;

		// 证书相关方法
		requestOracleCertificate: (params: any) => Promise<any>;
		getOracleCertificateConfig: () => Promise<any>;

		// 创建轮次相关方法
		createAMaciRound: (params: any) => Promise<any>;
		createMaciRound: (params: any) => Promise<any>;
		createOracleMaciRound: (params: any) => Promise<any>;

		// 其他实用方法
		queryRoundClaimable: (params: {
			contractAddress: string;
		}) => Promise<any>;
		queryAMaciChargeFee: (params: {
			maxVoter: number;
			maxOption: number;
		}) => Promise<any>;
		claimAMaciRound: (params: { contractAddress: string }) => Promise<any>;

		// 原有的测试方法（兼容性）
		publishMessage: (params: any) => Promise<any>;
		generateProof: (params: any) => Promise<any>;
		getState: (stateIndex: string) => Promise<any>;
	};
	flutter_inappwebview?: {
		callHandler: (handlerName: string, ...args: any[]) => Promise<any>;
	};
}

class MaciBridge {
	private maciClient: MaciClient | null = null;

	async genSignerFromMnemonic(mnemonic: string): Promise<any> {
		return await genSignerFromMnemonic(mnemonic);
	}

	async genSignerFromKey(key: string): Promise<DirectSecp256k1Wallet> {
		return await genSignerFromKey(key);
	}

	async initialize(config: any): Promise<void> {
		try {
			// 初始化maci客户端
			this.maciClient = new MaciClient({
				network: config.network || 'testnet',
				signer: config.signer,
				rpcEndpoint: config.rpcEndpoint,
				restEndpoint: config.restEndpoint,
				apiEndpoint: config.apiEndpoint,
				registryAddress: config.registryAddress,
				maciCodeId: config.maciCodeId,
				oracleCodeId: config.oracleCodeId,
				feegrantOperator: config.feegrantOperator,
				whitelistBackendPubkey: config.whitelistBackendPubkey,
				certificateApiEndpoint: config.certificateApiEndpoint,
				maciKeypair: config.maciKeypair,
			});
			this.postMessageToFlutter('onInitialized', { success: true });
		} catch (error: any) {
			this.postMessageToFlutter('onInitialized', {
				success: false,
				error: error.message,
			});
		}
	}

	// 基础方法
	async getMaciKeypair(): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return this.maciClient.getMaciKeypair();
	}

	async getMaciPubkey(): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return this.maciClient.getMaciPubkey();
	}

	async getAddress(signer?: any): Promise<string> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getAddress(signer);
	}

	// 密钥相关方法
	async genKeypairFromSign(params?: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.genKeypairFromSign(params);
	}

	async packMaciPubkey(pubkey?: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return this.maciClient.packMaciPubkey(pubkey);
	}

	async unpackMaciPubkey(pubkey: string): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return this.maciClient.unpackMaciPubkey(pubkey);
	}

	// 轮次相关方法
	async getRounds(after?: string, limit?: number): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getRounds(after, limit);
	}

	async getRoundInfo(params: { contractAddress: string }): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getRoundInfo(params);
	}

	async getRoundCircuitType(params: {
		contractAddress: string;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getRoundCircuitType(params);
	}

	async queryRoundIsQv(params: { contractAddress: string }): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.queryRoundIsQv(params);
	}

	async queryRoundBalance(params: { contractAddress: string }): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.queryRoundBalance(params);
	}

	// 用户状态相关方法
	async getStateIdxInc(params: {
		contractAddress: string;
		address?: string;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getStateIdxInc(params);
	}

	async getVoiceCreditBalance(params: {
		contractAddress: string;
		stateIdx?: number;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getVoiceCreditBalance(params);
	}

	async getStateIdxByPubKey(params: {
		contractAddress: string;
		pubKey?: any;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getStateIdxByPubKey(params);
	}

	// 费用相关方法
	async feegrantAllowance(params: {
		contractAddress: string;
		address?: string;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.feegrantAllowance(params);
	}

	async hasFeegrant(params: {
		contractAddress: string;
		address?: string;
	}): Promise<boolean> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.hasFeegrant(params);
	}

	// 白名单相关方法
	async queryWhitelistBalanceOf(params: any): Promise<string> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.queryWhitelistBalanceOf(params);
	}

	async isWhitelisted(params: {
		contractAddress: string;
		address?: string;
	}): Promise<boolean> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.isWhitelisted(params);
	}

	async getOracleWhitelistConfig(params: {
		contractAddress: string;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getOracleWhitelistConfig(params);
	}

	// 证书相关方法
	async requestOracleCertificate(params: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.requestOracleCertificate(params);
	}

	async getOracleCertificateConfig(): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.getOracleCertificateConfig();
	}

	// 创建轮次相关方法
	async createAMaciRound(params: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.createAMaciRound(params);
	}

	async createMaciRound(params: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.createMaciRound(params);
	}

	async createOracleMaciRound(params: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.createOracleMaciRound(params);
	}

	// 其他实用方法
	async queryRoundClaimable(params: {
		contractAddress: string;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.queryRoundClaimable(params);
	}

	async queryAMaciChargeFee(params: {
		maxVoter: number;
		maxOption: number;
	}): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.queryAMaciChargeFee(params);
	}

	async claimAMaciRound(params: { contractAddress: string }): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		return await this.maciClient.claimAMaciRound(params);
	}

	// 投票相关方法
	async vote(params: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		const result = await this.maciClient.vote(params);
		this.postMessageToFlutter('onVoteResult', result);
		return result;
	}

	async deactivate(params: any): Promise<any> {
		if (!this.maciClient) throw new Error('MACI客户端未初始化');
		const result = await this.maciClient.deactivate(params);
		this.postMessageToFlutter('onDeactivateResult', result);
		return result;
	}

	async signup(params: {
		pubKey: string;
		stateIndex: number;
		voiceCreditBalance: number;
	}): Promise<any> {
		try {
			if (!this.maciClient) {
				throw new Error('MACI客户端未初始化');
			}

			const result = await this.maciClient.signup(
				params
			);

			this.postMessageToFlutter('onSignupResult', result);
			return result;
		} catch (error: any) {
			const errorResult = { success: false, error: error.message };
			this.postMessageToFlutter('onSignupResult', errorResult);
			return errorResult;
		}
	}

	async publishMessage(params: {
		message: any;
		encPubKey: string;
	}): Promise<any> {
		try {
			if (!this.maciClient) {
				throw new Error('MACI客户端未初始化');
			}

			// const result = await this.maciClient.publishMessage(
			//   params.message,
			//   params.encPubKey
			// );

			const result = {
				success: true,
				messageHash: '0x...',
				timestamp: Date.now(),
			};

			this.postMessageToFlutter('onMessagePublished', result);
			return result;
		} catch (error: any) {
			const errorResult = { success: false, error: error.message };
			this.postMessageToFlutter('onMessagePublished', errorResult);
			return errorResult;
		}
	}

	async generateProof(params: { inputs: any }): Promise<any> {
		try {
			if (!this.maciClient) {
				throw new Error('MACI客户端未初始化');
			}

			// const result = await this.maciClient.generateProof(params.inputs);

			const result = {
				success: true,
				proof: {
					// 证明数据
				},
			};

			this.postMessageToFlutter('onProofGenerated', result);
			return result;
		} catch (error: any) {
			const errorResult = { success: false, error: error.message };
			this.postMessageToFlutter('onProofGenerated', errorResult);
			return errorResult;
		}
	}

	async getState(stateIndex: string): Promise<any> {
		try {
			if (!this.maciClient) {
				throw new Error('MACI客户端未初始化');
			}

			// const result = await this.maciClient.getState(stateIndex);

			const result = {
				success: true,
				state: {
					index: stateIndex,
					pubKey: '...',
					voiceCreditBalance: 100,
				},
			};

			return result;
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	}

	private postMessageToFlutter(event: string, data: any): void {
		// 发送消息到Flutter
		const flutterWebView = (window as any).flutter_inappwebview;
		if (flutterWebView?.callHandler) {
			flutterWebView.callHandler('onMaciEvent', {
				event,
				data,
			});
		} else {
			// 备用方案：使用postMessage
			window.parent.postMessage(
				{
					type: 'MACI_EVENT',
					event,
					data,
				},
				'*'
			);
		}
	}
}

// 初始化
function initializeMaciBridge() {
	const maciBridge = new MaciBridge();

	// 定义桥接接口
	const bridgeInterface = {
		// 基础方法
		initialize: (config: any) => maciBridge.initialize(config),
		getMaciKeypair: () => maciBridge.getMaciKeypair(),
		getMaciPubkey: () => maciBridge.getMaciPubkey(),
		getAddress: (signer?: any) => maciBridge.getAddress(signer),

		// Signer创建方法
		genSignerFromKey: (key: string) => maciBridge.genSignerFromKey(key),
		genSignerFromMnemonic: (mnemonic: string) =>
			maciBridge.genSignerFromMnemonic(mnemonic),

		// 密钥相关方法
		genKeypairFromSign: (params?: any) =>
			maciBridge.genKeypairFromSign(params),
		packMaciPubkey: (pubkey?: any) => maciBridge.packMaciPubkey(pubkey),
		unpackMaciPubkey: (pubkey: string) =>
			maciBridge.unpackMaciPubkey(pubkey),

		// 轮次相关方法
		getRounds: (after?: string, limit?: number) =>
			maciBridge.getRounds(after, limit),
		getRoundInfo: (params: { contractAddress: string }) =>
			maciBridge.getRoundInfo(params),
		getRoundCircuitType: (params: { contractAddress: string }) =>
			maciBridge.getRoundCircuitType(params),
		queryRoundIsQv: (params: { contractAddress: string }) =>
			maciBridge.queryRoundIsQv(params),
		queryRoundBalance: (params: { contractAddress: string }) =>
			maciBridge.queryRoundBalance(params),

		// 用户状态相关方法
		getStateIdxInc: (params: {
			contractAddress: string;
			address?: string;
		}) => maciBridge.getStateIdxInc(params),
		getVoiceCreditBalance: (params: {
			contractAddress: string;
			stateIdx?: number;
		}) => maciBridge.getVoiceCreditBalance(params),
		getStateIdxByPubKey: (params: {
			contractAddress: string;
			pubKey?: any;
		}) => maciBridge.getStateIdxByPubKey(params),

		// 投票相关方法
		signup: (params: any) => maciBridge.signup(params),
		vote: (params: any) => maciBridge.vote(params),
		deactivate: (params: any) => maciBridge.deactivate(params),

		// 费用相关方法
		feegrantAllowance: (params: {
			contractAddress: string;
			address?: string;
		}) => maciBridge.feegrantAllowance(params),
		hasFeegrant: (params: { contractAddress: string; address?: string }) =>
			maciBridge.hasFeegrant(params),

		// 白名单相关方法
		queryWhitelistBalanceOf: (params: any) =>
			maciBridge.queryWhitelistBalanceOf(params),
		isWhitelisted: (params: {
			contractAddress: string;
			address?: string;
		}) => maciBridge.isWhitelisted(params),
		getOracleWhitelistConfig: (params: { contractAddress: string }) =>
			maciBridge.getOracleWhitelistConfig(params),

		// 证书相关方法
		requestOracleCertificate: (params: any) =>
			maciBridge.requestOracleCertificate(params),
		getOracleCertificateConfig: () =>
			maciBridge.getOracleCertificateConfig(),

		// 创建轮次相关方法
		createAMaciRound: (params: any) => maciBridge.createAMaciRound(params),
		createMaciRound: (params: any) => maciBridge.createMaciRound(params),
		createOracleMaciRound: (params: any) =>
			maciBridge.createOracleMaciRound(params),

		// 其他实用方法
		queryRoundClaimable: (params: { contractAddress: string }) =>
			maciBridge.queryRoundClaimable(params),
		queryAMaciChargeFee: (params: {
			maxVoter: number;
			maxOption: number;
		}) => maciBridge.queryAMaciChargeFee(params),
		claimAMaciRound: (params: { contractAddress: string }) =>
			maciBridge.claimAMaciRound(params),

		// 原有的测试方法（兼容性）
		publishMessage: (params: any) => maciBridge.publishMessage(params),
		generateProof: (params: any) => maciBridge.generateProof(params),
		getState: (stateIndex: string) => maciBridge.getState(stateIndex),
	};

	// 暴露到全局window对象
	(window as any).MaciBridge = bridgeInterface;

	// 通知Flutter桥接已准备就绪
	const flutterWebView = (window as any).flutter_inappwebview;
	if (flutterWebView?.callHandler) {
		flutterWebView.callHandler('onBridgeReady', {
			ready: true,
			timestamp: Date.now(),
		});
	}

	console.log('MACI Bridge initialized and exposed to window.MaciBridge');
	return bridgeInterface;
}

// 立即初始化
initializeMaciBridge();
