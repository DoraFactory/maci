import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'dart:convert';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MACI Bridge Flutter Demo',
      theme: ThemeData(
        // This is the theme of your application.
        //
        // TRY THIS: Try running your application with "flutter run". You'll see
        // the application has a purple toolbar. Then, without quitting the app,
        // try changing the seedColor in the colorScheme below to Colors.green
        // and then invoke "hot reload" (save your changes or press the "hot
        // reload" button in a Flutter-supported IDE, or press "r" if you used
        // the command line to start the app).
        //
        // Notice that the counter didn't reset back to zero; the application
        // state is not lost during the reload. To reset the state, use hot
        // restart instead.
        //
        // This works for code too, not just values: Most code changes can be
        // tested with just a hot reload.
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: 'MACI Bridge Flutter Demo'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  // This widget is the home page of your application. It is stateful, meaning
  // that it has a State object (defined below) that contains fields that affect
  // how it looks.

  // This class is the configuration for the state. It holds the values (in this
  // case the title) provided by the parent (in this case the App widget) and
  // used by the build method of the State. Fields in a Widget subclass are
  // always marked "final".

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  late final WebViewController _controller;
  bool _isLoading = true;
  bool _isInitialized = false;
  bool _hasSigner = false;
  bool _isPageReady = false;
  String _status = 'Loading...';
  String _signerAddress = '';
  String _currentNetwork = '';
  List<String> _logs = [];
  Map<String, dynamic> _lastResult = {};

  // Result storage for each functional module
  Map<String, dynamic> _signerResults = {};
  Map<String, dynamic> _maciResults = {};
  Map<String, dynamic> _roundResults = {};
  Map<String, dynamic> _votingResults = {};

  // Input controllers
  final TextEditingController _privateKeyController = TextEditingController();
  final TextEditingController _mnemonicController = TextEditingController();
  final TextEditingController _roundNameController = TextEditingController();
  final TextEditingController _voteOptionController = TextEditingController();
  final TextEditingController _voteWeightController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initializeWebView();

    // Listen to text changes to update button states
    _privateKeyController.addListener(() => setState(() {}));
    _mnemonicController.addListener(() => setState(() {}));
    _roundNameController.addListener(() => setState(() {}));
    _voteOptionController.addListener(() => setState(() {}));
    _voteWeightController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _privateKeyController.dispose();
    _mnemonicController.dispose();
    _roundNameController.dispose();
    _voteOptionController.dispose();
    _voteWeightController.dispose();
    super.dispose();
  }

  void _initializeWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            debugPrint('WebView loading progress: $progress%');
          },
          onPageStarted: (String url) {
            setState(() {
              _isLoading = true;
              _status = 'Page loading...';
            });
            debugPrint('Page started loading: $url');
          },
          onPageFinished: (String url) {
            setState(() {
              _isLoading = false;
              _status =
                  'Page loaded, waiting for MACI Bridge initialization...';
            });
            debugPrint('Page finished loading: $url');
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView resource error: ${error.description}');
            setState(() {
              _status = 'WebView error: ${error.description}';
            });
          },
        ),
      )
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (JavaScriptMessage message) {
          _handleJavaScriptMessage(message.message);
        },
      )
      ..loadFlutterAsset('assets/maci_bridge.html');

    _setupJavaScriptHandlers();
  }

  void _setupJavaScriptHandlers() {
    _controller.addJavaScriptChannel(
      'onPageReady',
      onMessageReceived: (JavaScriptMessage message) {
        debugPrint('Page ready message: ${message.message}');
        try {
          Map<String, dynamic> data;
          final msg = message.message;
          if (msg.startsWith('{') && msg.endsWith('}')) {
            data = jsonDecode(msg);
          } else {
            data = {'ready': true};
          }
          if (data['ready'] == true) {
            setState(() {
              _isPageReady = true;
              _status = 'MACI Bridge is ready, you can start using it';
            });
            _addLog('✅ Page is ready, MACI Bridge available');
          }
        } catch (e) {
          debugPrint('Failed to parse page ready message: $e');
          _addLog('❌ Failed to parse page ready message: $e');
        }
      },
    );

    _controller.addJavaScriptChannel(
      'onMaciInitialized',
      onMessageReceived: (JavaScriptMessage message) {
        debugPrint('MACI initialization message: ${message.message}');
        try {
          Map<String, dynamic> data;
          final msg = message.message;
          if (msg.startsWith('{') && msg.endsWith('}')) {
            data = jsonDecode(msg);
          } else {
            data = {'success': true, 'network': 'testnet'};
          }
          setState(() {
            _isInitialized = data['success'] == true;
            _currentNetwork = data['network'] ?? 'testnet';
            _status = _isInitialized
                ? 'MACI client initialized ($_currentNetwork)'
                : 'MACI initialization failed: ${data['error'] ?? 'Unknown error'}';
          });
          _addLog(
            _isInitialized
                ? '✅ MACI client initialization successful (network: $_currentNetwork)'
                : '❌ MACI initialization failed: ${data['error'] ?? 'Unknown error'}',
          );
        } catch (e) {
          debugPrint('Failed to parse MACI initialization message: $e');
          _addLog('❌ Failed to parse MACI initialization message: $e');
        }
      },
    );

    _controller.addJavaScriptChannel(
      'onMaciLog',
      onMessageReceived: (JavaScriptMessage message) {
        debugPrint('MACI log: ${message.message}');
        try {
          Map<String, dynamic> data;
          final msg = message.message;
          if (msg.startsWith('{') && msg.endsWith('}')) {
            data = jsonDecode(msg);
            if (data.containsKey('result')) {
              // This is an operation result - dispatch to corresponding module based on operation type
              final operation = data['operation'] ?? 'Unknown operation';
              final result = data['result'] ?? {};

              setState(() {
                _lastResult = result;

                // Dispatch results to corresponding modules based on operation type
                if (operation.contains('signer') ||
                    operation.contains('Signer') ||
                    operation.contains('balance') ||
                    operation.contains('Balance') ||
                    operation.contains('address') ||
                    operation.contains('Address')) {
                  _signerResults = result;
                } else if (operation.contains('maci') ||
                    operation.contains('Maci') ||
                    operation.contains('initialize') ||
                    operation.contains('client') ||
                    operation.contains('keypair') ||
                    operation.contains('Keypair')) {
                  _maciResults = result;
                } else if (operation.contains('round') ||
                    operation.contains('Round')) {
                  _roundResults = result;
                } else if (operation.contains('vote') ||
                    operation.contains('Vote') ||
                    operation.contains('signup') ||
                    operation.contains('state')) {
                  _votingResults = result;
                }
              });
              _addLog('📄 Received operation result: $operation');
            } else {
              // This is a log message
              String logType = data['type'] ?? 'info';
              String icon = logType == 'error'
                  ? '❌'
                  : logType == 'success'
                  ? '✅'
                  : logType == 'warning'
                  ? '⚠️'
                  : 'ℹ️';
              _addLog(
                '$icon ${data['timestamp']} [${logType.toUpperCase()}]: ${data['message']}',
              );
            }
          } else {
            _addLog(
              'ℹ️ ${DateTime.now().toString().split(' ')[1].split('.')[0]} [INFO]: ${message.message}',
            );
          }
        } catch (e) {
          debugPrint('Failed to parse MACI log: $e');
          _addLog('❌ Failed to parse message: ${message.message}');
        }
      },
    );

    // Add signer-related message handling
    _controller.addJavaScriptChannel(
      'onSignerCreated',
      onMessageReceived: (JavaScriptMessage message) {
        debugPrint('Signer creation message: ${message.message}');
        try {
          Map<String, dynamic> data = jsonDecode(message.message);
          setState(() {
            _hasSigner = data['success'] == true;
            _signerAddress = data['address'] ?? '';
          });
          if (_hasSigner) {
            _addLog('✅ Signer created successfully, address: $_signerAddress');
            setState(() {
              _status = 'Signer created (address: $_signerAddress)';
            });
          } else {
            _addLog(
              '❌ Signer creation failed: ${data['error'] ?? 'Unknown error'}',
            );
          }
        } catch (e) {
          debugPrint('Failed to parse Signer creation message: $e');
          _addLog('❌ Failed to parse Signer creation message: $e');
        }
      },
    );
  }

  void _handleJavaScriptMessage(String message) {
    debugPrint('Received generic JavaScript message: $message');
  }

  void _addLog(String log) {
    setState(() {
      _logs.add(log);
      if (_logs.length > 100) {
        _logs.removeAt(0);
      }
    });
  }

  void _clearLogs() {
    setState(() {
      _logs.clear();
      _lastResult.clear();
      _signerResults.clear();
      _maciResults.clear();
      _roundResults.clear();
      _votingResults.clear();
    });
  }

  Future<void> _callJavaScriptFunction(
    String functionName, [
    Map<String, dynamic>? params,
  ]) async {
    String script = functionName;
    if (params != null) {
      final paramsJson = jsonEncode(params);
      script = '$functionName($paramsJson)';
    } else {
      script = '$functionName()';
    }

    try {
      await _controller.runJavaScript(script);
      _addLog('🔄 Called function: $functionName');
    } catch (e) {
      _addLog('❌ Failed to call $functionName: $e');
      debugPrint('Failed to call JavaScript function: $e');
    }
  }

  Widget _buildStatusCard() {
    Color statusColor = _isPageReady
        ? (_isInitialized && _hasSigner
              ? Colors.green.shade100
              : Colors.blue.shade100)
        : (_isLoading ? Colors.orange.shade100 : Colors.red.shade100);

    Color textColor = _isPageReady
        ? (_isInitialized && _hasSigner
              ? Colors.green.shade800
              : Colors.blue.shade800)
        : (_isLoading ? Colors.orange.shade800 : Colors.red.shade800);

    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  _isPageReady
                      ? (_isInitialized && _hasSigner
                            ? Icons.check_circle
                            : Icons.wifi)
                      : (_isLoading ? Icons.hourglass_empty : Icons.error),
                  color: textColor,
                ),
                const SizedBox(width: 8),
                const Text(
                  'System Status',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: statusColor,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: textColor.withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _status,
                    style: TextStyle(
                      color: textColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (_currentNetwork.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.wifi, size: 16, color: textColor),
                        const SizedBox(width: 4),
                        Text(
                          'Network: $_currentNetwork',
                          style: TextStyle(color: textColor, fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                  if (_signerAddress.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.account_circle, size: 16, color: textColor),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'Signer: ${_signerAddress.length > 20 ? '${_signerAddress.substring(0, 10)}...${_signerAddress.substring(_signerAddress.length - 10)}' : _signerAddress}',
                            style: TextStyle(color: textColor, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSignerSection() {
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.key),
                SizedBox(width: 8),
                Text(
                  'Signer Management',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Private key input
            TextField(
              controller: _privateKeyController,
              decoration: const InputDecoration(
                labelText: 'Private Key',
                hintText: 'Enter private key to create signer',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.vpn_key),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 8),

            // Mnemonic input
            TextField(
              controller: _mnemonicController,
              decoration: const InputDecoration(
                labelText: 'Mnemonic',
                hintText: 'Enter mnemonic to create signer',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.text_fields),
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 16),

            // Buttons
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed:
                      _isPageReady && _privateKeyController.text.isNotEmpty
                      ? () => _callJavaScriptFunction('createSigner', {
                          'type': 'privateKey',
                          'value': _privateKeyController.text,
                        })
                      : null,
                  icon: const Icon(Icons.create),
                  label: const Text('Create from Private Key'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady && _mnemonicController.text.isNotEmpty
                      ? () => _callJavaScriptFunction('createSigner', {
                          'type': 'mnemonic',
                          'value': _mnemonicController.text,
                        })
                      : null,
                  icon: const Icon(Icons.create),
                  label: const Text('Create from Mnemonic'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('getSignerAddress')
                      : null,
                  icon: const Icon(Icons.account_circle),
                  label: const Text('Get Address'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('checkBalance')
                      : null,
                  icon: const Icon(Icons.account_balance_wallet),
                  label: const Text('Check Balance'),
                ),
              ],
            ),

            // Signer result display
            _buildModuleResultCard(
              'Signer Operation Results',
              _signerResults,
              () => setState(() => _signerResults.clear()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMaciSection() {
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.rocket_launch),
                SizedBox(width: 8),
                Text(
                  'MACI Client',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('initializeMaci')
                      : null,
                  icon: const Icon(Icons.power_settings_new),
                  label: const Text('Initialize MACI'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('getClientInfo')
                      : null,
                  icon: const Icon(Icons.info),
                  label: const Text('Client Info'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('generateKeypair')
                      : null,
                  icon: const Icon(Icons.key),
                  label: const Text('Generate Keypair'),
                ),
              ],
            ),

            // MACI operation result display
            _buildModuleResultCard(
              'MACI Operation Results',
              _maciResults,
              () => setState(() => _maciResults.clear()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoundSection() {
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.how_to_vote),
                SizedBox(width: 8),
                Text(
                  'Voting Round Management',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Round name input
            TextField(
              controller: _roundNameController,
              decoration: const InputDecoration(
                labelText: 'Round Name',
                hintText: 'Enter name for new voting round',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.label),
              ),
            ),
            const SizedBox(height: 16),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('getRounds')
                      : null,
                  icon: const Icon(Icons.list),
                  label: const Text('Get Round List'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('getRoundInfo')
                      : null,
                  icon: const Icon(Icons.info_outline),
                  label: const Text('Current Round Info'),
                ),
                ElevatedButton.icon(
                  onPressed:
                      _isPageReady && _roundNameController.text.isNotEmpty
                      ? () => _callJavaScriptFunction('createAMaciRound', {
                          'name': _roundNameController.text,
                        })
                      : null,
                  icon: const Icon(Icons.add_circle),
                  label: const Text('Create New Round'),
                ),
              ],
            ),

            // Round management result display
            _buildModuleResultCard(
              'Round Management Results',
              _roundResults,
              () => setState(() => _roundResults.clear()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVotingSection() {
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.how_to_vote),
                SizedBox(width: 8),
                Text(
                  'Voting Functions',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _voteOptionController,
                    decoration: const InputDecoration(
                      labelText: 'Vote Option',
                      hintText: 'Enter vote option ID',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.check_box),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _voteWeightController,
                    decoration: const InputDecoration(
                      labelText: 'Vote Weight',
                      hintText: 'Enter vote weight',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.balance),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('signup')
                      : null,
                  icon: const Icon(Icons.person_add),
                  label: const Text('Sign Up to Vote'),
                ),
                ElevatedButton.icon(
                  onPressed:
                      _isPageReady &&
                          _voteOptionController.text.isNotEmpty &&
                          _voteWeightController.text.isNotEmpty
                      ? () => _callJavaScriptFunction('vote', {
                          'option':
                              int.tryParse(_voteOptionController.text) ?? 0,
                          'weight':
                              int.tryParse(_voteWeightController.text) ?? 1,
                        })
                      : null,
                  icon: const Icon(Icons.how_to_vote),
                  label: const Text('Vote'),
                ),
                ElevatedButton.icon(
                  onPressed: _isPageReady
                      ? () => _callJavaScriptFunction('getStateIdx')
                      : null,
                  icon: const Icon(Icons.tag),
                  label: const Text('Get State Index'),
                ),
              ],
            ),

            // Voting function result display
            _buildModuleResultCard(
              'Voting Function Results',
              _votingResults,
              () => setState(() => _votingResults.clear()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultCard() {
    if (_lastResult.isEmpty) {
      return const SizedBox.shrink();
    }

    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.description),
                SizedBox(width: 8),
                Text(
                  'Latest Result',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: SingleChildScrollView(
                child: Text(
                  _formatResult(_lastResult),
                  style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _lastResult.clear();
                    });
                  },
                  icon: const Icon(Icons.clear),
                  label: const Text('Clear Result'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatResult(Map<String, dynamic> result) {
    try {
      const encoder = JsonEncoder.withIndent('  ');
      return encoder.convert(result);
    } catch (e) {
      return result.toString();
    }
  }

  Widget _buildModuleResultCard(
    String title,
    Map<String, dynamic> result,
    VoidCallback onClear,
  ) {
    if (result.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.data_object, size: 18),
              const SizedBox(width: 4),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.clear, size: 18),
                onPressed: onClear,
                tooltip: 'Clear Result',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Colors.green.shade200),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Text(
                _formatResult(result),
                style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogsCard() {
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.terminal),
                const SizedBox(width: 8),
                const Text(
                  'Operation Logs',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                Text(
                  'Total ${_logs.length} entries',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _clearLogs,
                  icon: const Icon(Icons.clear_all),
                  tooltip: 'Clear Logs',
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              height: 300,
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: _logs.isEmpty
                  ? Center(
                      child: Text(
                        'No log entries yet',
                        style: TextStyle(
                          color: Colors.grey.shade500,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    )
                  : ListView.builder(
                      itemCount: _logs.length,
                      itemBuilder: (context, index) {
                        final log = _logs[index];
                        final isError = log.contains('❌');
                        final isSuccess = log.contains('✅');
                        final isWarning = log.contains('⚠️');

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 1),
                          child: SelectableText(
                            log,
                            style: TextStyle(
                              fontSize: 11,
                              fontFamily: 'monospace',
                              color: isError
                                  ? Colors.red.shade700
                                  : (isSuccess
                                        ? Colors.green.shade700
                                        : (isWarning
                                              ? Colors.orange.shade700
                                              : Colors.black87)),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _controller.reload();
              _addLog('🔄 Page reloaded');
            },
            tooltip: 'Reload',
          ),
          IconButton(
            icon: const Icon(Icons.web),
            onPressed: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('WebView Page'),
                  content: SizedBox(
                    width: double.maxFinite,
                    height: 400,
                    child: WebViewWidget(controller: _controller),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Close'),
                    ),
                  ],
                ),
              );
            },
            tooltip: 'Show WebView',
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(8.0),
          child: Column(
            children: [
              // System status
              _buildStatusCard(),
              const SizedBox(height: 8),

              // Signer management
              _buildSignerSection(),
              const SizedBox(height: 8),

              // MACI client
              _buildMaciSection(),
              const SizedBox(height: 8),

              // Voting round management
              _buildRoundSection(),
              const SizedBox(height: 8),

              // Voting functions
              _buildVotingSection(),
              const SizedBox(height: 8),

              // Latest result display
              _buildResultCard(),
              const SizedBox(height: 8),

              // Operation logs
              _buildLogsCard(),
            ],
          ),
        ),
      ),
    );
  }
}
