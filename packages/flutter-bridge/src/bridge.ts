// Import all exports from maci-sdk
import * as MaciSDK from '@dorafactory/maci-sdk';

// Extend window type definition
interface Window {
	MaciSDK: typeof MaciSDK;
	flutter_inappwebview?: {
		callHandler: (handlerName: string, ...args: any[]) => Promise<any>;
	};
}

// Initialization function
function initializeMaciSDK() {
	// Directly expose the entire MaciSDK - includes all exports:
	// - MaciClient: Main MACI client class
	// - Http: HTTP request utilities
	// - Query types: Round, UserAccount, Circuit, Operator, Proof, Transaction
	// - Crypto: All cryptographic functions (keys, hashing, signing, trees, etc.)
	// - Types: All type definitions
	// - Constants: circuits, getDefaultParams, NetworkConfig
	// - Utils: stringizing, bigInt2Buffer, isValidAddress, getAMaciRoundCircuitFee
	(window as any).MaciSDK = MaciSDK;

	// Notify Flutter that SDK is ready
	const flutterWebView = (window as any).flutter_inappwebview;
	if (flutterWebView?.callHandler) {
		flutterWebView.callHandler('onSDKReady', {
			ready: true,
			timestamp: Date.now(),
			availableSDK: Object.keys(MaciSDK),
		});
	}

	console.log('MACI SDK initialized and available at window.MaciSDK');
	console.log('Available SDK exports:', Object.keys(MaciSDK));
	console.log('SDK detailed contents:');
	console.log('- MaciClient: Main client class');
	console.log('- Http: HTTP request utilities');
	console.log(
		'- Query types: Round, UserAccount, Circuit, Operator, Proof, Transaction'
	);
	console.log(
		'- Crypto: Cryptographic functions (keys, hashing, signing, trees, etc.)'
	);
	console.log('- Types: All type definitions');
	console.log('- Constants: circuits, getDefaultParams, NetworkConfig');
	console.log(
		'- Utils: stringizing, bigInt2Buffer, isValidAddress, getAMaciRoundCircuitFee'
	);

	return MaciSDK;
}

// Initialize immediately
initializeMaciSDK();
